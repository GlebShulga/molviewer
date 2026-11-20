#!/usr/bin/env bash
# Keeps the molviewer.bio WAF rule that challenges unreleased Chrome versions
# current. Bots with made-up user agents often claim a Chrome major that
# doesn't exist yet; a Managed Challenge stops them before they start a Pages
# Function. Run daily by .github/workflows/chrome-waf.yml.
#
# Threshold T = max(stable + 3, canary + 2), from Chromium Dash, checked
# against Google's versionhistory API. Canary moves to M + 1 when milestone M
# branches, so T stays at least 2 above Canary and Dev and 3 above stable
# whatever Google does to the release dates.
#
# A rule that stops updating fails closed and challenges real users:
#   - Canary and Dev reach T when milestone T - 1 branches, 2 to 4 weeks after
#     the last successful run;
#   - Beta users at T's earliest beta, stable users at T's early-stable date.
# The rule's description carries the Canary and stable dates for its T.
#
# The zone is on the Free plan: no regex (`matches`) in custom rules, so the
# expression lists majors T to T + 37 with `contains "Chrome/N."`.
#
# The rule is found by its ref, chrome-unreleased-versions. A rule someone
# disabled stays disabled (that is the emergency fix); the run only warns.
#
# A threshold lower than the rule's (a pulled Canary or early-stable build) is
# not written: the higher one is the safe direction. The run warns instead.
#
# Env: CF_API_TOKEN (Zone WAF: Edit on the zone), CF_ZONE_ID, both unless
# DRY_RUN=1 (print the threshold, deadlines and expression, no Cloudflare
# call); optional CHROMIUMDASH_URL (default https://chromiumdash.appspot.com),
# GITHUB_STEP_SUMMARY.
#
# Time budget: 7 reads (2 sources x 2 channels, 2 schedule dates, 1
# Cloudflare GET) of at most about 35 s each with retries
# (--retry-max-time 20 plus a last --max-time 15 attempt), and at most one
# 15 s write: under 5 minutes, the workflow step's timeout.
# Needs curl and jq.
set -euo pipefail

CHROMIUMDASH_URL=${CHROMIUMDASH_URL:-https://chromiumdash.appspot.com}
VERSIONHISTORY_URL=https://versionhistory.googleapis.com/v1/chrome/platforms/win/channels
CF_API=https://api.cloudflare.com/client/v4
RULE_REF=chrome-unreleased-versions
TERMS=38 # majors T to T + 37
MAX_EXPRESSION=4096

fail() {
  echo "::error::$1" >&2
  exit 1
}

# GET a Chrome source. Use only as x=$(fetch URL): on failure it exits the
# command substitution's subshell with 1, so the assignment fails and set -e
# ends the script, or a caller's `|| x=` fallback takes over. The optional
# second argument is the annotation level, `warning` for optional sources.
fetch() {
  curl -fsS --max-time 15 --retry 3 --retry-max-time 20 "$1" && return 0
  echo "::${2:-error}::Request failed: $1" >&2
  exit 1
}

# Cloudflare API call: cf METHOD PATH [BODY] [ALLOWED_STATUS]. Called directly,
# not in a subshell. Sets cf_status and cf_body; returns on 2xx or
# ALLOWED_STATUS, exits 1 on anything else. Only GET retries: a write that
# timed out after Cloudflare applied it could otherwise run twice.
cf_tmp=$(mktemp)
trap 'rm -f "$cf_tmp"' EXIT
cf() {
  local method=$1 path=$2 body=${3:-} allowed=${4:-}
  local args=(-sS -X "$method" -o "$cf_tmp" -w '%{http_code}' --max-time 15
    -H "Authorization: Bearer $CF_API_TOKEN")
  if [[ $method == GET ]]; then
    args+=(--retry 3 --retry-max-time 20)
  fi
  if [[ -n $body ]]; then
    args+=(-H 'Content-Type: application/json' --data "$body")
  fi
  # Without -f curl exits 0 on HTTP errors but not on transport failures,
  # which would otherwise end the script here with curl's own code.
  cf_status=$(curl "${args[@]}" "$CF_API$path") || cf_status=000
  if [[ $cf_status == 000 ]]; then
    fail "Cloudflare $method $path: no response"
  fi
  cf_body=$(cat "$cf_tmp")
  if [[ $cf_status == 2?? || $cf_status == "$allowed" ]]; then
    return 0
  fi
  echo "Cloudflare $method $path returned $cf_status:" >&2
  jq '.errors' <<<"$cf_body" >&2 2>/dev/null || printf '%s\n' "$cf_body" >&2
  fail "Cloudflare $method $path returned $cf_status"
}

# check_milestone NAME VALUE: a Chrome milestone is an integer >= 150.
check_milestone() {
  if [[ ! $2 =~ ^[0-9]+$ ]] || ((10#$2 < 150)); then
    fail "$1 is '$2', expected a Chrome milestone >= 150"
  fi
}

# milestone CHANNEL: the channel's milestone from both sources. They may
# differ by 1 on a rollout day (the larger wins); more means one is wrong.
# Runs in a command substitution, where bash turns set -e off, hence the
# explicit `|| exit 1`.
milestone() {
  local channel=$1 lower json dash vh
  lower=$(tr '[:upper:]' '[:lower:]' <<<"$channel")
  json=$(fetch "$CHROMIUMDASH_URL/fetch_releases?channel=$channel&platform=Windows&num=1") || exit 1
  dash=$(jq -r '.[0].milestone // empty' <<<"$json" 2>/dev/null) || dash=''
  check_milestone "Chromium Dash $channel" "$dash"
  json=$(fetch "$VERSIONHISTORY_URL/$lower/versions?pageSize=1") || exit 1
  vh=$(jq -r '.versions[0].version // empty | split(".")[0]' <<<"$json" 2>/dev/null) || vh=''
  check_milestone "versionhistory $lower" "$vh"
  dash=$((10#$dash))
  vh=$((10#$vh))
  if ((dash - vh > 1 || vh - dash > 1)); then
    fail "$channel is $dash on Chromium Dash but $vh on versionhistory"
  fi
  echo $((dash > vh ? dash : vh))
}

# schedule_date MILESTONE FIELD: the date (YYYY-MM-DD) of a milestone's
# schedule field, or nothing (with a warning) when it can't be read.
schedule_date() {
  local json date
  json=$(fetch "$CHROMIUMDASH_URL/fetch_milestone_schedule?mstone=$1" warning) || return 0
  date=$(jq -r --argjson m "$1" --arg f "$2" \
    '.mstones[]? | select(.mstone == $m) | .[$f] // empty | .[0:10]' <<<"$json" 2>/dev/null) || date=''
  if [[ $date =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "$date"
  else
    echo "::warning::No $2 date for Chrome $1 in the Chromium Dash schedule" >&2
  fi
}

# 1-2. Milestones and threshold.
stable=$(milestone Stable)
canary=$(milestone Canary)
threshold=$((stable + 3 > canary + 2 ? stable + 3 : canary + 2))

# 3. Deadlines. Optional: the threshold doesn't depend on them.
canary_date=$(schedule_date $((threshold - 1)) branch_point)
stable_date=$(schedule_date "$threshold" early_stable)
if [[ -n $canary_date && -n $stable_date ]]; then
  deadlines="Canary hits it $canary_date, stable users $stable_date"
else
  canary_date='' stable_date='' deadlines=''
fi

# 4. Expression.
terms=()
for ((major = threshold; major < threshold + TERMS; major++)); do
  terms+=("http.user_agent contains \"Chrome/$major.\"")
done
joined=$(printf ' or %s' "${terms[@]}")
expression="not cf.client.bot and (${joined# or })"
if ((${#expression} > MAX_EXPRESSION)); then
  fail "The expression is ${#expression} characters, over Cloudflare's $MAX_EXPRESSION"
fi

# 5. Description.
describe() {
  echo "Chrome >= $threshold (stable $stable, canary $canary). Stale: $1. Updated daily by chrome-waf.yml; do not edit by hand."
}

echo "Stable $stable, canary $canary, threshold $threshold"
echo "Stale deadlines: Canary ${canary_date:-unknown}, stable users ${stable_date:-unknown}"

if [[ ${DRY_RUN:-} == 1 ]]; then
  echo "Expression (${#expression} characters):"
  echo "$expression"
  exit 0
fi

: "${CF_API_TOKEN:?CF_API_TOKEN is required}"
: "${CF_ZONE_ID:?CF_ZONE_ID is required}"

# 6. The zone's custom ruleset and the rule in it. 404: no custom rules yet.
entrypoint=/zones/$CF_ZONE_ID/rulesets/phases/http_request_firewall_custom/entrypoint
cf GET "$entrypoint" "" 404
ruleset_id='' rule=''
if [[ $cf_status != 404 ]]; then
  ruleset_id=$(jq -r '.result.id // empty' <<<"$cf_body")
  [[ -n $ruleset_id ]] || fail "The custom ruleset entrypoint has no id"
  rule=$(jq -c --arg ref "$RULE_REF" '[.result.rules // [] | .[] | select(.ref == $ref)] | first // empty' <<<"$cf_body")
fi

# 7. Monotonic check against the existing rule's threshold.
old_threshold='' lowered=''
if [[ -n $rule ]]; then
  rule_id=$(jq -r '.id' <<<"$rule")
  old_expression=$(jq -r '.expression // ""' <<<"$rule")
  old_description=$(jq -r '.description // ""' <<<"$rule")
  # `.enabled // true` would turn false into true.
  enabled=$(jq -r 'if .enabled == false then "false" else "true" end' <<<"$rule")
  re='^Chrome >= ([0-9]+)'
  if [[ ! $old_description =~ $re ]]; then
    fail "Rule $RULE_REF has a description without 'Chrome >= N' (edited by hand?): '$old_description'. Left unchanged."
  fi
  old_threshold=$((10#${BASH_REMATCH[1]}))
  if ((threshold < old_threshold)); then
    echo "::warning::Computed threshold $threshold is lower than the rule's $old_threshold (stable $stable, canary $canary; a pulled build?). Keeping $old_threshold."
    lowered=1
  fi
fi

# 8. Write.
if [[ -n $deadlines ]]; then
  description=$(describe "$deadlines")
elif [[ -n $rule && $threshold == "$old_threshold" ]]; then
  description=$old_description # its dates still hold for this threshold
else
  description=$(describe "deadlines unknown")
fi

notes=()
if [[ -n $rule && $enabled == false ]]; then
  echo "::warning::Rule $RULE_REF is disabled; the threshold is kept current but not enforced"
  notes+=("Rule is disabled; the threshold is kept current but not enforced. Turn it back on in Security > WAF > Custom rules.")
fi

whole_rule() {
  jq -n --arg ref "$RULE_REF" --arg expression "$expression" --arg description "$description" \
    --argjson enabled "$1" \
    '{ref: $ref, expression: $expression, description: $description, action: "managed_challenge", enabled: $enabled}'
}

deadline_text="Canary ${canary_date:-unknown}, stable users ${stable_date:-unknown}"
if [[ -n $lowered ]]; then
  action="kept at $old_threshold"
  deadline_text="as in the rule's description"
elif [[ -n $rule && $expression == "$old_expression" && $description == "$old_description" ]]; then
  action='up to date'
elif [[ -n $rule ]]; then
  cf PATCH "/zones/$CF_ZONE_ID/rulesets/$ruleset_id/rules/$rule_id" "$(whole_rule "$enabled")"
  action=updated
elif [[ -n $ruleset_id ]]; then
  cf POST "/zones/$CF_ZONE_ID/rulesets/$ruleset_id/rules" "$(whole_rule true)"
  action=created
else
  # Only after a 404: a PUT on an existing entrypoint replaces all its rules.
  cf PUT "$entrypoint" "$(jq -n --argjson rule "$(whole_rule true)" '{rules: [$rule]}')"
  action='created (with the custom ruleset)'
fi

# 9. Report.
summary="Chrome WAF rule: stable $stable, canary $canary, threshold $threshold, $action (previous threshold ${old_threshold:-none}). Stale deadlines: $deadline_text."
echo "$summary"
for note in "${notes[@]}"; do
  echo "$note"
done
if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
  {
    echo "$summary"
    for note in "${notes[@]}"; do
      echo
      echo "**$note**"
    done
  } >>"$GITHUB_STEP_SUMMARY"
fi
