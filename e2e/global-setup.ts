import { request } from '@playwright/test';

/**
 * Runs once per shard before any test when BASE_URL is set: is the target
 * the MolViewer page, served to this machine? A redirect, a Cloudflare
 * challenge or an Access login would otherwise fail every test slowly, as on
 * 2026-11-16 (run 43930423486). Throws one error that lists every problem.
 *
 * A block that hits only some requests can still pass here; maxFailures in
 * playwright.config.ts stops that run a few minutes in.
 */
const PATHS = ['/', '/pdb/1CRN'];

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.BASE_URL;
  if (!baseURL) return;

  const context = await request.newContext();
  const problems: string[] = [];
  try {
    for (const path of PATHS) {
      const url = new URL(path, baseURL).toString();
      try {
        const response = await context.get(url, {
          maxRedirects: 0,
          failOnStatusCode: false,
          timeout: 30_000,
        });
        const status = response.status();
        const headers = response.headers();
        if (headers['cf-mitigated']) {
          problems.push(
            `${url}: ${status}, cf-mitigated: ${headers['cf-mitigated']}. Cloudflare challenge: the host's WAF or bot rules block this runner.`
          );
        } else if (status >= 300 && status < 400) {
          problems.push(`${url}: ${status}, redirects to ${headers.location ?? '(no location header)'}.`);
        } else if (status !== 200) {
          problems.push(`${url}: ${status}.`);
        } else if (!(await response.text()).includes('id="root"')) {
          problems.push(`${url}: 200, but not the MolViewer page (no id="root").`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        problems.push(`${url}: ${message}`);
      }
    }
  } finally {
    await context.dispose();
  }

  if (problems.length > 0) {
    throw new Error(`BASE_URL ${baseURL} can't be tested:\n- ${problems.join('\n- ')}`);
  }
}
