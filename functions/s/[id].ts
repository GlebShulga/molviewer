/**
 * GET /s/:id: share link page. Reads the stored scene from SHARE_KV and
 * injects a title, description, OG image and canonical that describe it
 * (see site/render/sharePage.ts). The SPA restores the scene from the path.
 */
import { renderShareLanding, UNAVAILABLE } from '../../site/render/sharePage';
import { isGetOrHead, shellResponse } from '../../site/render/respond';
import { SITE_ORIGIN } from '../../site/nav';

interface Env {
  SHARE_KV: KVNamespace;
}

const ID_PATTERN = /^[A-Za-z0-9]{8,16}$/;

export const onRequest: PagesFunction<Env> = async ({ request, params, env, next }) => {
  const id = String(params.id ?? '');
  if (!isGetOrHead(request) || !ID_PATTERN.test(id)) return next();

  // A KV error (or a missing binding in a preview environment) must not take
  // the page down: the app can still try to restore the share itself.
  const [shell, raw] = await Promise.all([
    next(),
    Promise.resolve()
      .then(() => env.SHARE_KV.get(id))
      .catch((): typeof UNAVAILABLE => UNAVAILABLE),
  ]);
  let share: unknown = null;
  if (raw === UNAVAILABLE) {
    share = UNAVAILABLE;
  } else if (raw !== null) {
    try {
      share = JSON.parse(raw) as unknown;
    } catch {
      share = {};
    }
  }
  const { status, meta } = renderShareLanding(id, share, SITE_ORIGIN);
  return shellResponse(request, shell, meta, status);
};
