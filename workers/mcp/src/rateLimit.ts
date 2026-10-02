/**
 * Rate limits for tool calls (Workers rate-limiting bindings, see
 * wrangler.toml). MCP calls come from the chat provider's servers, not the
 * user's browser, so an IP is a whole provider (or one abuser), never a user:
 *
 * - IP_LIMIT, per connecting IP, on every call: generous enough for a chat
 *   provider's shared egress IPs (all Claude users share a handful), and it
 *   caps a script that makes up a new `openai/subject` on every call.
 * - USER_LIMIT, per ChatGPT's anonymized `openai/subject`, when one is sent:
 *   one ChatGPT user can't use up the provider's share. Other clients send no
 *   user id, so for them only the IP limit applies.
 * - GLOBAL_LIMIT: an approximate backstop (counted per Cloudflare location).
 */
import type { ServerContext } from '@modelcontextprotocol/server';
import type { Env } from './server';

export const RATE_LIMITED_MESSAGE = 'MolViewer is busy, please try again in a minute.';

function subjectOf(ctx: ServerContext): string | null {
  const subject = ctx.mcpReq._meta?.['openai/subject'];
  return typeof subject === 'string' && subject ? subject : null;
}

function ipOf(ctx: ServerContext): string {
  return ctx.http?.req?.headers.get('cf-connecting-ip') ?? 'unknown';
}

/** Which chat client made the call, for analytics only (self-reported, so approximate). */
export function clientOf(ctx: ServerContext): 'chatgpt' | 'claude' | 'other' {
  if (subjectOf(ctx)) return 'chatgpt';
  const ua = ctx.http?.req?.headers.get('user-agent') ?? '';
  if (/openai|chatgpt/i.test(ua)) return 'chatgpt';
  if (/claude|anthropic/i.test(ua)) return 'claude';
  return 'other';
}

/** False when the caller or the whole server is over a limit. Missing bindings (tests, dev) never limit. */
export async function limitCaller(env: Env, ctx: ServerContext): Promise<boolean> {
  const subject = subjectOf(ctx);
  try {
    const outcomes = await Promise.all([
      env.IP_LIMIT?.limit({ key: `ip:${ipOf(ctx)}` }),
      subject ? env.USER_LIMIT?.limit({ key: `sub:${subject}` }) : undefined,
      env.GLOBAL_LIMIT?.limit({ key: 'global' }),
    ]);
    return outcomes.every((o) => o?.success ?? true);
  } catch {
    // A limiter outage must not take the app down.
    return true;
  }
}
