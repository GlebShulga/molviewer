#!/usr/bin/env bash
# Prints the address the E2E and snapshot workflows test, as base_url=... in
# $GITHUB_OUTPUT: the workflow's base_url input when one is given, otherwise
# the Cloudflare Pages deployment of the commit the run is on
# (<id>.molviewer.pages.dev, where <id> is the start of Cloudflare's
# deployment id, not the commit hash; for main's head that deployment is the
# production build).
#
# Not molviewer.bio: its zone WAF challenges cloud runner IPs, which failed
# every test of run 43930423486 for an hour. Not molviewer.pages.dev: it
# redirects to molviewer.bio. Per-deployment addresses do neither.
#
# The address comes from the "Cloudflare Pages" check run that Cloudflare's
# GitHub app posts on each deployed commit, so no Cloudflare credentials are
# needed. Cloudflare builds only the last commit of each push.
#
# Env: SHA, GITHUB_REPOSITORY, GH_TOKEN (checks: read), GITHUB_OUTPUT;
# optional OVERRIDE (the base_url input), GITHUB_STEP_SUMMARY,
# MAX_WAIT_SECONDS (default 900), POLL_SECONDS (default 30).
# Needs only gh: the filter runs in its built-in jq.
set -euo pipefail

: "${SHA:?SHA is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
MAX_WAIT_SECONDS=${MAX_WAIT_SECONDS:-900}
POLL_SECONDS=${POLL_SECONDS:-30}
short=${SHA:0:7}

fail() {
  echo "::error::$1"
  exit 1
}

finish() {
  echo "base_url=$1" >>"$GITHUB_OUTPUT"
  echo "Testing $1, $2"
  if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
    echo "Testing $1, $2" >>"$GITHUB_STEP_SUMMARY"
  fi
  exit 0
}

if [[ -n ${OVERRIDE:-} ]]; then
  # One line only: a newline would add extra lines to $GITHUB_OUTPUT.
  # [^[:space:]] rather than \S, which only glibc's regex understands.
  [[ $OVERRIDE =~ ^https?://[^[:space:]]+$ ]] || fail "base_url must be one http(s) address"
  finish "$OVERRIDE" "given as base_url"
fi

# The latest Cloudflare run on the commit, as status|conclusion|details_url|address.
# The address is the per-deployment one from the summary (which on a branch
# also lists the <branch>.molviewer.pages.dev alias), or else built from the
# deployment id at the end of details_url. Filtered by app so that an Actions
# job named "Cloudflare Pages" can't pass for the deployment.
filter='[.check_runs[] | select(.app.slug == "cloudflare-workers-and-pages")]
  | sort_by(.id) | last // empty
  | [ .status,
      (.conclusion // ""),
      (.details_url // ""),
      ( ([(.output.summary // "") | match("https://[0-9a-f]{8}\\.molviewer\\.pages\\.dev"; "g") | .string] | first)
        // ([(.details_url // "") | capture("/(?<id>[0-9a-f]{8})-[0-9a-f-]+$") | "https://\(.id).molviewer.pages.dev"] | first)
        // "" ) ]
  | join("|")'

errors=$(mktemp)
trap 'rm -f "$errors"' EXIT

deadline=$((SECONDS + MAX_WAIT_SECONDS))
details=''
while :; do
  error=''
  if line=$(gh api "repos/$GITHUB_REPOSITORY/commits/$SHA/check-runs?check_name=Cloudflare%20Pages" --jq "$filter" 2>"$errors"); then
    if [[ -z $line ]]; then
      echo "No Cloudflare Pages deployment of $short yet, waiting"
    else
      IFS='|' read -r status conclusion details url <<<"$line"
      if [[ $status != completed ]]; then
        echo "Cloudflare Pages deployment of $short is $status, waiting"
      elif [[ $conclusion != success ]]; then
        fail "Cloudflare Pages deployment of $short ended with '$conclusion': $details"
      elif [[ -z $url ]]; then
        fail "Cloudflare Pages deployment of $short succeeded, but its check run names no address: $details"
      else
        finish "$url/" "the Cloudflare Pages deployment of $short"
      fi
    fi
  else
    # gh ends its error with "(HTTP <status>)". Rate limits, server errors and
    # network failures can pass on a later try. Other 4xx answers (422 "No
    # commit found", 404 for a wrong repository, 401/403 for the token) can't.
    error=$(tr '\n' ' ' <"$errors" | sed 's/^gh: //; s/ *$//')
    case $error in
      *"rate limit"* | *"(HTTP 429)"* | *"(HTTP 5"[0-9][0-9]")"*) ;;
      *"(HTTP 4"[0-9][0-9]")"*) fail "Reading the check runs of $short failed: $error" ;;
    esac
    echo "::warning::Reading the check runs of $short failed, retrying: $error"
  fi
  if ((SECONDS + POLL_SECONDS > deadline)); then
    break
  fi
  sleep "$POLL_SECONDS"
done

minutes=$((MAX_WAIT_SECONDS / 60))
if [[ -n $error ]]; then
  fail "Couldn't read the check runs of $short for $minutes min, last error: $error"
fi
if [[ -n $details ]]; then
  fail "Cloudflare Pages deployment of $short still not finished after $minutes min: $details. Pass base_url to test another address."
fi
fail "No finished Cloudflare Pages deployment for $short after $minutes min. Cloudflare builds only the last commit of each push; run on a branch head or pass base_url."
