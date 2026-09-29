/**
 * Text drawn in the corner of exported images and videos.
 *
 * Points back to what's on screen: the share link on share pages
 * (`/s/<id>`), the structure's readable address when the address bar shows
 * one (`/pdb/4HHB`, `/af/P69905`, `/compound/caffeine`), otherwise the host.
 */
import { parseRoute, structurePath } from '../../site/routes';

export function getWatermarkText(
  location: Pick<Location, 'host' | 'pathname'> = window.location
): string {
  const route = parseRoute(location.pathname);
  if (route.page === 'share') return `${location.host}/s/${route.id}`;
  if (route.page === 'structure' && !route.embed) return `${location.host}${structurePath(route.structure)}`;
  return location.host;
}
