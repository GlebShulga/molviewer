import type { ColorScheme, Molecule, RepresentationType } from '../types';
import { hasBackboneData } from './backboneExtraction';
import { isTouchScreen } from './touch';
import { DESKTOP_ATOM_STYLE_LIMIT } from '../../site/appContract';
import { CARTOON_FALLBACK_REPRESENTATION } from '../config/smartDefaults';
import { calculateColorSchemeContext, type ColorSchemeContext } from './atomColor';

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

/**
 * What a structure shows when the limit blocks Ball & Stick or Stick: Cartoon
 * when it has a backbone, Spacefill otherwise (a large ligand set, an XYZ
 * file, a membrane), which stays fast at any size through impostors.
 */
export type LimitFallback = 'cartoon' | 'spacefill';

export function limitFallback(hasBackbone: boolean): LimitFallback {
  return hasBackbone ? 'cartoon' : 'spacefill';
}

function limitReason(touch: boolean, hasBackbone: boolean): string {
  const instead = hasBackbone ? 'Cartoon or Spacefill' : 'Spacefill';
  return `over ${atomStyleLimitLabel(touch)} atoms${touch ? ' on a touch screen' : ''}; use ${instead}`;
}

const CARTOON_REASON = 'needs a protein or nucleic-acid backbone';

const HIDDEN: Availability = { available: false, reason: 'the structure is hidden' };
const OK: Availability = { available: true };

function isAtomStyle(rep: RepresentationType): boolean {
  return rep === 'ball-and-stick' || rep === 'stick';
}

function overAtomStyleLimit(rep: RepresentationType, atomCount: number, touch: boolean): boolean {
  return isAtomStyle(rep) && atomCount > atomStyleLimit(touch);
}

/**
 * One rule for the toolbar and the sheet. Only real limits: the one atom-count
 * cap is Ball & Stick and Stick (atomStyleLimit: 1,000 atoms on a touch screen,
 * 100,000 on a desktop), with or without a backbone; Cartoon or Spacefill
 * is there instead (limitFallback). Spacefill has none (impostor rendering
 * handles large structures).
 */
export function representationAvailability(rep: RepresentationType, facts: StructureFacts): Availability {
  if (!facts.visible) return HIDDEN;
  if (overAtomStyleLimit(rep, facts.atomCount, facts.touch)) {
    return { available: false, reason: limitReason(facts.touch, facts.hasBackbone) };
  }
  if (rep === 'cartoon' && !facts.hasBackbone) {
    return { available: false, reason: CARTOON_REASON };
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
  return overAtomStyleLimit(rep, molecule.atoms.length, isTouchScreen());
}

/**
 * Whether the limit blocks this style for `atomCount` atoms on this device:
 * one component's atoms, for a ligand set beside a polymer, whose own count
 * is what it draws in that style.
 */
export function isComponentStyleLimited(rep: RepresentationType, atomCount: number): boolean {
  return overAtomStyleLimit(rep, atomCount, isTouchScreen());
}

/** The style to show instead of a limited one (limitFallback) for this molecule. */
export function styleLimitFallback(molecule: Molecule): LimitFallback {
  return limitFallback(hasBackboneData(molecule));
}

/**
 * The style a link, session or the widget shows for `rep` on this molecule,
 * for the paths that set a style without the buttons: Cartoon without a
 * backbone shows CARTOON_FALLBACK_REPRESENTATION (it would draw nothing), and
 * the atom-count limit then applies as usual (limitFallback). The backbone
 * check can walk every atom, so it runs only when the answer depends on it.
 */
export function styleToShow(rep: RepresentationType, molecule: Molecule): RepresentationType {
  let hasBackbone: boolean | undefined;
  const backbone = () => (hasBackbone ??= hasBackboneData(molecule));
  const style = rep === 'cartoon' && !backbone() ? CARTOON_FALLBACK_REPRESENTATION : rep;
  return isStyleLimited(style, molecule) ? limitFallback(backbone()) : style;
}

/**
 * Why a link or session opened in `shown` instead of the style it asked for:
 * Cartoon for want of a backbone (the reason the buttons give), any other
 * style for the atom-count limit.
 */
export function styleFallbackMessage(requested: RepresentationType, shown: RepresentationType): string {
  if (requested === 'cartoon') {
    return `Showing ${REPRESENTATION_LABELS[shown]}: Cartoon ${CARTOON_REASON}`;
  }
  const touch = isTouchScreen();
  return `Showing ${REPRESENTATION_LABELS[shown]}: ${REPRESENTATION_LABELS[requested]} is limited to ${atomStyleLimitLabel(touch)} atoms${touch ? ' on touch screens' : ''}`;
}

/** The reason the buttons show, for the keyboard shortcuts. */
export function styleLimitNote(rep: RepresentationType, molecule: Molecule): string {
  return `${REPRESENTATION_LABELS[rep]}: ${limitReason(isTouchScreen(), hasBackboneData(molecule))}`;
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

/** The facts colorSchemeAvailability needs, from a molecule's color context (calculateColorSchemeContext). */
export function colorFacts(context: ColorSchemeContext, representation: RepresentationType, visible = true): ColorFacts {
  return {
    visible,
    representation,
    hasBackbone: context.hasBackboneData === true,
    hasResidueData: context.hasResidueData === true,
    hasBfactorData: context.hasBfactorData === true,
    hasResidueNumbers: context.hasResidueNumbers === true,
    hasSecondaryStructure: context.hasSecondaryStructure === true,
  };
}

/**
 * `scheme` if the buttons would offer it for a molecule shown in `shown`, CPK
 * otherwise. For where Cartoon fell back: a protein's default Secondary
 * structure needs a backbone or helix and sheet records, and without them the
 * atoms draw in CPK while the control would show a greyed-out scheme.
 * `context` is the molecule's calculateColorSchemeContext, which walks every
 * atom, so callers compute it once and only when Cartoon fell back.
 */
export function availableColor(scheme: ColorScheme, shown: RepresentationType, context: ColorSchemeContext): ColorScheme {
  return colorSchemeAvailability(scheme, colorFacts(context, shown)).available ? scheme : 'cpk';
}

/**
 * The color a link or the widget applies along with a style that styleToShow
 * turned from `requested` into `shown`: when Cartoon fell back, one the
 * buttons would offer (availableColor), else `scheme` as asked.
 */
export function colorToShow(
  scheme: ColorScheme,
  requested: RepresentationType,
  shown: RepresentationType,
  molecule: Molecule
): ColorScheme {
  return requested === 'cartoon' && shown !== 'cartoon'
    ? availableColor(scheme, shown, calculateColorSchemeContext(molecule))
    : scheme;
}
