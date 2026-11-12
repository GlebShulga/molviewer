/**
 * The short commit hash a build is made from, for the product events' app
 * version (VITE_APP_VERSION in vite.config.ts and vite.widget.config.ts).
 * Cloudflare Pages and GitHub Actions set the commit in the environment; a
 * local build asks git. Empty when neither is available.
 */
import { execSync } from 'node:child_process';

export function appVersion(): string {
  const sha = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}
