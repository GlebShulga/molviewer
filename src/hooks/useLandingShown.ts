import { useShallow } from 'zustand/react/shallow';
import { useMoleculeStore } from '../store/moleculeStore';
import { getLandingData, matchesLanding, type LandingData } from '../utils/landingData';
import { sourceToPath } from '../utils/urlParams';

/**
 * The landing page's summary (#landing-data) while the page's own structure
 * is the one the address points at, i.e. the first structure with an
 * address (see useUrlSync). That's exactly when the text below the viewer is
 * visible, so "Details" links never point at hidden content. Null otherwise.
 */
export function useLandingShown(): LandingData | null {
  const data = getLandingData();
  const firstAddressable = useMoleculeStore(
    useShallow((s) => {
      for (const id of s.structureOrder) {
        const source = s.structures.get(id)?.source;
        if (sourceToPath(source)) return source;
      }
      return undefined;
    })
  );
  return data && matchesLanding(data, firstAddressable) ? data : null;
}
