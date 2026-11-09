import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useMoleculeStore, temporalStore } from '../../../store/moleculeStore';
import { SequenceViewer } from '../SequenceViewer';
import { ThemeProvider } from '../../../context/ThemeContext';
import type { Atom, Molecule } from '../../../types';

/** Chain A: MET 1 and ALA 2, and a ligand LIG that shares number 1 (as MD and docking output number them). */
function metAndLigandOne(): Molecule {
  const atoms: Atom[] = [];
  const add = (name: string, element: string, residueName: string, residueNumber: number) =>
    atoms.push({ id: atoms.length, name, element, residueName, residueNumber, chainId: 'A', x: atoms.length * 1.5, y: 0, z: 0 });
  for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) add(name, element, 'MET', 1);
  for (const [name, element] of [['N', 'N'], ['CA', 'C'], ['C', 'C'], ['O', 'O']]) add(name, element, 'ALA', 2);
  add('C1', 'C', 'LIG', 1); // atom 8
  add('O1', 'O', 'LIG', 1);
  return { name: 'complex', atoms, bonds: [] };
}

interface Layout {
  /** The highlighted residue's top left in the window; by default at the strip's centre */
  residue?: { top?: number; left?: number };
  /** The strip's border (clientTop/clientLeft) and current scroll */
  border?: number;
  scrollTop?: number;
  scrollLeft?: number;
  /** The pointer is over the strip (:hover, which jsdom never matches) */
  pointerInStrip?: boolean;
  /** The main pointer can hover (a mouse), as opposed to a touch screen */
  canHover?: boolean;
}

/**
 * jsdom lays nothing out. A 300x180 strip at the window's top left (inside
 * its border, centre 150,90), and a 20x20 highlighted residue.
 */
function layOut({ residue = {}, border = 0, scrollTop = 0, scrollLeft = 0, pointerInStrip = false, canHover = true }: Layout) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(hover: hover)' ? canHover : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
    return selector === ':hover' ? pointerInStrip : matches.call(this, selector);
  });
  const box = (top: number, left: number, width: number, height: number) =>
    ({ top, left, bottom: top + height, right: left + width, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.hasAttribute('data-highlighted')
      ? box(residue.top ?? 80 + border, residue.left ?? 140 + border, 20, 20)
      : box(0, 0, 300 + 2 * border, 180 + 2 * border);
  });
  vi.spyOn(Element.prototype, 'clientTop', 'get').mockReturnValue(border);
  vi.spyOn(Element.prototype, 'clientLeft', 'get').mockReturnValue(border);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(180);
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockReturnValue(scrollTop);
  vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockReturnValue(scrollLeft);
}

describe('SequenceViewer and an atom hovered in 3D', () => {
  const scrollIntoView = vi.fn();
  const scrollTo = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    useMoleculeStore.getState().reset();
    temporalStore.getState().clear();
    scrollIntoView.mockClear();
    scrollTo.mockClear();
    // jsdom has neither; scrollIntoView must stay unused (it scrolls the sidebar too)
    Element.prototype.scrollIntoView = scrollIntoView;
    Element.prototype.scrollTo = scrollTo as typeof Element.prototype.scrollTo;
    // jsdom has no matchMedia (ThemeProvider reads the system theme)
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const open = () => {
    const id = useMoleculeStore.getState().addStructure(metAndLigandOne(), 'complex');
    render(<ThemeProvider><SequenceViewer /></ThemeProvider>);
    return id;
  };
  const hover = (id: string, atomIndex: number) => {
    const atom = useMoleculeStore.getState().structures.get(id)!.molecule.atoms[atomIndex];
    act(() => useMoleculeStore.getState().setHoveredAtom(atom, atomIndex, id, null));
  };
  const residueButton = (title: RegExp) => screen.getByTitle(title);
  const highlighted = () => document.querySelectorAll('[class*="highlighted"]');

  it('centres MET 1 in the strip, and scrolls only the strip, when it is below it', () => {
    // 200..220 (centre 210) below a strip whose centre is at 90: down by 120
    layOut({ residue: { top: 200 } });
    const id = open();
    hover(id, 1);
    expect(residueButton(/^MET 1 /).className).toMatch(/highlighted/);
    expect(highlighted()).toHaveLength(1);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.contexts[0]).toBe(document.querySelector('[data-highlighted]')?.closest('[class*="sequenceContainer"]'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 120, left: 0, behavior: 'instant' });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('centres a residue above, measured inside the border', () => {
    // Inside a 2px border the strip's centre is at 92; the residue's (-20) is
    // 112 above it, and the strip is scrolled to 300 already
    layOut({ residue: { top: -30 }, border: 2, scrollTop: 300 });
    const id = open();
    hover(id, 1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 188, left: 0, behavior: 'instant' });
  });

  it('centres a residue cut off at the bottom edge', () => {
    // 170..190 against a strip that ends at 180: centre 180 is 90 below 90
    layOut({ residue: { top: 170 } });
    const id = open();
    hover(id, 1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 90, left: 0, behavior: 'instant' });
  });

  it('centres the residue sideways in the single row phones show', () => {
    // The row scrolled to 40; the residue's centre (510) is 360px right of
    // the strip's (150)
    layOut({ residue: { left: 500 }, scrollLeft: 40 });
    const id = open();
    hover(id, 1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 400, behavior: 'instant' });
  });

  it('centres a residue cut off at the edge of the row', () => {
    // 290..310 against a strip that ends at 300: centre 300 is 150 right of 150
    layOut({ residue: { left: 290 } });
    const id = open();
    hover(id, 1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 150, behavior: 'instant' });
  });

  it('never moves the strip while the pointer is in it', () => {
    // The same layout as above, but the pointer is in the strip (on a
    // residue, a group label or a gap): moving the strip would slide other
    // residues under it, which highlight in turn
    layOut({ residue: { left: 290 }, pointerInStrip: true });
    const id = open();
    hover(id, 1);
    expect(residueButton(/^MET 1 /).className).toMatch(/highlighted/);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('still scrolls on a touch screen, where :hover stays on the strip after a tap there', () => {
    // No pointer rests anywhere: an atom picked in 3D brings its residue in
    layOut({ residue: { left: 290 }, pointerInStrip: true, canHover: false });
    const id = open();
    hover(id, 1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 150, behavior: 'instant' });
  });

  it('leaves a residue fully in view where it is, even off-centre', () => {
    layOut({ residue: { top: 10, left: 250 } });
    const id = open();
    hover(id, 1);
    expect(highlighted()).toHaveLength(1);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('highlights nothing for an atom of the ligand numbered 1 (not in the sequence)', () => {
    const id = open();
    hover(id, 8);
    expect(residueButton(/^MET 1 /).className).not.toMatch(/highlighted/);
    expect(highlighted()).toHaveLength(0);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
