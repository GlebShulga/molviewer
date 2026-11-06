import type { ColorScheme, Molecule, RepresentationType } from '../types';
import { hasBackboneData } from './backboneExtraction';
import { isTouchScreen } from './touch';
import { DESKTOP_ATOM_STYLE_LIMIT } from '../../site/appContract';

/**
 * Whether a style can be picked, and if not, why: a short predicate shown
 * after the option's name ("Cartoon: needs a ... backbone"), visible text
 * rather than a tooltip, which touch screens don't have.
 */
export interface Availability {
  available: boolean;
  reason?: string;
}

export interface StructureFacts {
  visible: boolean;
  atomCount: number;
  /** CA or P atoms (hasBackboneData). */
  hasBackbone: boolean;
  /** A phone or tablet (isTouchScreen). */
  touch: boolean;
}

export const REPRESENTATION_LABELS: Record<RepresentationType, string> = {
  'ball-and-stick': 'Ball & Stick',
  'stick': 'Stick',
  'spacefill': 'Spacefill',
  'cartoon': 'Cartoon',
  'surface-vdw': 'VdW Surface',
  'surface-sas': 'SAS Surface',
};

/** Surface generation is skipped outside this range (too small to be useful, too big to build). */
export const SURFACE_MIN_ATOMS = 100;
export const SURFACE_MAX_ATOMS = 100_000;

/**
 * Ball & Stick and Stick on a touch screen stop at this many atoms. Measured on
 * a production build (Pixel 5 emulation, CPU throttled 4x): 660 atoms rotate at
 * about 30 fps, 2.5k at 9 fps, 4.8k freeze for 7-10 s and 58k for 22-30 s.
 * These were measured with one drei instance per bond, before bonds became one
 * InstancedMesh (InstancedBonds.tsx), and with one 32x16 sphere geometry per
 * atom, before atoms shared a few (SelectableAtom.tsx); re-measuring could
 * raise the limit.
 * Desktops stop much later (DESKTOP_ATOM_STYLE_LIMIT), and Spacefill stays
 * fast everywhere through impostors.
 */
export const TOUCH_ATOM_STYLE_LIMIT = 1000;
export { DESKTOP_ATOM_STYLE_LIMIT };

/** Where Ball & Stick and Stick stop on this kind of device. */
export function atomStyleLimit(touch: boolean): number {
  return touch ? TOUCH_ATOM_STYLE_LIMIT : DESKTOP_ATOM_STYLE_LIMIT;
}

/** The limit as people read it ("1,000"), for every text that names it. */
export function atomStyleLimitLabel(touch: boolean): string {
  return atomStyleLimit(touch).toLocaleString('en-US');
}

function limitReason(touch: boolean): string {
  return `over ${atomStyleLimitLabel(touch)} atoms${touch ? ' on a touch screen' : ''}; use Cartoon or Spacefill`;
}

const HIDDEN: Availability = { available: false, reason: 'the structure is hidden' };
const OK: Availability = { available: true };

function overAtomStyleLimit(rep: RepresentationType, facts: Omit<StructureFacts, 'visible'>): boolean {
  return (rep === 'ball-and-stick' || rep === 'stick')
    && facts.hasBackbone && facts.atomCount > atomStyleLimit(facts.touch);
}

/**
 * One rule for the toolbar and the sheet. Only real limits: the one atom-count
 * cap is Ball & Stick and Stick (atomStyleLimit: 1,000 atoms on a touch screen,
 * 100,000 on a desktop), and only with a backbone, so Cartoon is there
 * instead. Spacefill has none (impostor rendering handles large structures).
 */
export function representationAvailability(rep: RepresentationType, facts: StructureFacts): Availability {
  if (!facts.visible) return HIDDEN;
  if (overAtomStyleLimit(rep, facts)) return { available: false, reason: limitReason(facts.touch) };
  if (rep === 'cartoon' && !facts.hasBackbone) {
    return { available: false, reason: 'needs a protein or nucleic-acid backbone' };
  }
  if (rep === 'surface-vdw') {
    if (facts.atomCount < SURFACE_MIN_ATOMS) return { available: false, reason: `needs at least ${SURFACE_MIN_ATOMS} atoms` };
    if (facts.atomCount > SURFACE_MAX_ATOMS) return { available: false, reason: 'too many atoms' };
  }
  return OK;
}

/**
 * Whether the atom-count limit blocks this style for this molecule on this
 * device, for the paths that set a style without the buttons (links, sessions,
 * keys, the widget).
 */
export function isStyleLimited(rep: RepresentationType, molecule: Molecule): boolean {
  // The cheap checks first: the backbone check can walk every atom
  if (!overAtomStyleLimit(rep, { touch: isTouchScreen(), atomCount: molecule.atoms.length, hasBackbone: true })) return false;
  return hasBackboneData(molecule);
}

/** Why a link or session opened in Cartoon instead of the style it asked for. */
export function styleFallbackMessage(requested: RepresentationType): string {
  const touch = isTouchScreen();
  return `Showing Cartoon: ${REPRESENTATION_LABELS[requested]} is limited to ${atomStyleLimitLabel(touch)} atoms${touch ? ' on touch screens' : ''}`;
}

/** The reason the buttons show, for the keyboard shortcuts. */
export function styleLimitNote(rep: RepresentationType): string {
  return `${REPRESENTATION_LABELS[rep]}: ${limitReason(isTouchScreen())}`;
}

export interface ColorFacts {
  visible: boolean;
  representation: RepresentationType;
  hasBackbone: boolean;
  hasResidueData: boolean;
  hasBfactorData: boolean;
  hasResidueNumbers: boolean;
  hasSecondaryStructure: boolean;
}

export function colorSchemeAvailability(scheme: ColorScheme, facts: ColorFacts): Availability {
  if (!facts.visible) return HIDDEN;
  switch (scheme) {
    case 'cpk':
      // Element colors on a backbone ribbon would all be carbon grey
      return facts.representation === 'cartoon' ? { available: false, reason: 'colors atoms, which Cartoon does not draw' } : OK;
    case 'residueType':
      return facts.hasResidueData ? OK : { available: false, reason: 'no residue names in this file' };
    case 'bfactor':
      return facts.hasBfactorData ? OK : { available: false, reason: 'no B-factor values in this file' };
    case 'rainbow':
      return facts.hasResidueNumbers ? OK : { available: false, reason: 'no residue numbers in this file' };
    case 'secondaryStructure':
      // Helices and sheets can be detected from the backbone when the file has none
      return facts.hasSecondaryStructure || facts.hasBackbone ? OK : { available: false, reason: 'no backbone to find helices and sheets in' };
    default:
      return OK;
  }
}
