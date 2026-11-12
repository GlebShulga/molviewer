import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Molecule } from '../../types';

const track = vi.hoisted(() => vi.fn());
vi.mock('../track', async (importOriginal) => ({ ...(await importOriginal<typeof import('../track')>()), track }));

import {
  forgetRemovedStructures,
  noteFrameDrawn,
  noteStructureCommitted,
  noteStructureUnmounted,
  resetLoadTrackingForTests,
  startLoad,
} from '../loadTracking';
import { classifyLoadError, asParseError, LoadError } from '../loadErrors';
import { FileValidationError } from '../fileValidation';
import { UnsupportedFormatError } from '../../parsers/errors';

const names = () => track.mock.calls.map(([name]) => name);
const propsOf = (name: string) => track.mock.calls.find(([n]) => n === name)?.[1];
const rendered = () => track.mock.calls.filter(([n]) => n === 'structure_rendered').map(([, p]) => p);

/** A molecule object with `atomCount` atoms: the render signal compares these by identity. */
function molecule(atomCount = 3): Molecule {
  return { name: 'm', atoms: Array.from({ length: atomCount }, (_, i) => ({ id: i, element: 'C', x: i, y: 0, z: 0 })), bonds: [] };
}

describe('startLoad', () => {
  beforeEach(() => {
    track.mockClear();
    resetLoadTrackingForTests();
  });

  it('sends started, then one outcome with the user flag', () => {
    const attempt = startLoad({ source: 'file', userInitiated: true, format: 'pdb', bytes: 48_000 });
    attempt.loaded({ id: 'a', molecule: molecule(4782), visible: true });
    attempt.failed(new Error('late'));
    attempt.cancelled('superseded');
    expect(names()).toEqual(['structure_load_started', 'structure_loaded']);
    expect(propsOf('structure_load_started')).toMatchObject({ source: 'file', user: 1, format: 'pdb', kb: 47 });
    expect(propsOf('structure_loaded')).toMatchObject({ source: 'file', user: 1, atoms: 4800, duration: expect.any(Number) });
  });

  it('marks automatic loads with user 0 and keeps the example tag', () => {
    startLoad({ source: 'rcsb', userInitiated: false }).cancelled('aborted');
    startLoad({ source: 'rcsb', userInitiated: true, via: 'welcome_example' }).failed(new LoadError('PDB ID "XXXX" not found', 'not_found'));
    expect(track.mock.calls[1]).toEqual(['structure_load_cancelled', expect.objectContaining({ user: 0, detail: 'aborted' })]);
    expect(track.mock.calls[3]).toEqual([
      'structure_load_failed',
      expect.objectContaining({ user: 1, value: 'welcome_example', detail: 'not_found' }),
    ]);
  });

  it('reports a file under 512 bytes as 1 KB, not as no size', () => {
    startLoad({ source: 'file', userInitiated: true, bytes: 300 });
    expect(propsOf('structure_load_started')).toMatchObject({ kb: 1 });
  });
});

describe('structure_rendered', () => {
  beforeEach(() => {
    track.mockClear();
    resetLoadTrackingForTests();
  });

  it('follows the first frame drawn after the loaded molecule commits', () => {
    const a = molecule(46);
    startLoad({ source: 'sample', userInitiated: true }).loaded({ id: 'a', molecule: a, visible: true });
    noteFrameDrawn(); // a frame from before the commit
    expect(rendered()).toHaveLength(0);
    noteStructureCommitted('a', a);
    noteFrameDrawn();
    noteFrameDrawn();
    expect(rendered()).toHaveLength(1);
    expect(rendered()[0]).toMatchObject({ source: 'sample', atoms: 46, user: 1, duration: expect.any(Number) });
    expect(rendered()[0]).not.toHaveProperty('detail');
  });

  it('counts a commit that reached the scene before the loader reported in', () => {
    const b = molecule();
    noteStructureCommitted('b', b);
    startLoad({ source: 'af', userInitiated: true }).loaded({ id: 'b', molecule: b, visible: true });
    noteFrameDrawn();
    expect(rendered()).toHaveLength(1);
  });

  it('counts the copy with aromatic rings that replaced the loaded molecule before the first frame', () => {
    const loaded = molecule();
    startLoad({ source: 'pubchem', userInitiated: true }).loaded({ id: 'c', molecule: loaded, visible: true });
    noteStructureCommitted('c', { ...loaded, aromaticRings: [] });
    noteFrameDrawn();
    expect(rendered()).toHaveLength(1);
  });

  it('times a reopened session that keeps its structure ids and renderers', () => {
    const reopened = molecule();
    noteStructureCommitted('s1', molecule());
    startLoad({ source: 'saved', userInitiated: true }).loaded({ id: 's1', molecule: reopened, visible: true });
    noteFrameDrawn();
    expect(rendered()).toHaveLength(0);
    // The kept renderer commits the new molecule
    noteStructureCommitted('s1', reopened);
    noteFrameDrawn();
    expect(rendered()).toHaveLength(1);
  });

  it('does not count the old molecule shown again (hide and show) as the loaded one', () => {
    const old = molecule();
    const loaded = molecule();
    noteStructureCommitted('x', old);
    noteStructureUnmounted('x');
    noteStructureCommitted('x', old);
    startLoad({ source: 'saved', userInitiated: true }).loaded({ id: 'x', molecule: loaded, visible: true });
    noteStructureCommitted('x', old);
    noteFrameDrawn();
    expect(rendered()).toHaveLength(0);
    noteStructureCommitted('x', loaded);
    noteFrameDrawn();
    expect(rendered()).toHaveLength(1);
  });

  it('does not time a structure loaded hidden, which is drawn only when someone shows it', () => {
    const hidden = molecule();
    startLoad({ source: 'share', userInitiated: false }).loaded({ id: 'h', molecule: hidden, visible: false });
    // Shown much later
    noteStructureCommitted('h', hidden);
    noteFrameDrawn();
    expect(names()).toEqual(['structure_load_started', 'structure_loaded']);
  });

  it('stops waiting for a structure hidden before its first frame', () => {
    const m = molecule();
    noteStructureCommitted('v', molecule());
    startLoad({ source: 'saved', userInitiated: true }).loaded({ id: 'v', molecule: m, visible: true });
    noteStructureUnmounted('v');
    noteStructureCommitted('v', m);
    noteFrameDrawn();
    expect(rendered()).toHaveLength(0);
  });

  it('stops waiting for a structure removed before it was drawn', () => {
    const gone = molecule();
    startLoad({ source: 'rcsb', userInitiated: true }).loaded({ id: 'gone', molecule: gone, visible: true });
    forgetRemovedStructures(() => false);
    noteStructureCommitted('gone', gone);
    noteFrameDrawn();
    expect(rendered()).toHaveLength(0);
  });

  it('marks the render time of a load that was hidden at some point', () => {
    const h = molecule();
    const attempt = startLoad({ source: 'rcsb', userInitiated: false });
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    hidden.mockRestore();
    attempt.loaded({ id: 'h', molecule: h, visible: true });
    noteStructureCommitted('h', h);
    noteFrameDrawn();
    expect(propsOf('structure_rendered')).toMatchObject({ detail: 'hidden' });
  });

  it('sends nothing to wait for when there is no structure to time', () => {
    startLoad({ source: 'share', userInitiated: false }).loaded(undefined);
    noteFrameDrawn();
    expect(names()).toEqual(['structure_load_started', 'structure_loaded']);
    expect(propsOf('structure_loaded')).toMatchObject({ atoms: 0 });
  });
});

describe('classifyLoadError', () => {
  it('maps errors to classes', () => {
    expect(classifyLoadError(new LoadError('x', 'not_found'))).toBe('not_found');
    expect(classifyLoadError(new FileValidationError('big', 'too_large'))).toBe('too_large');
    expect(classifyLoadError(new FileValidationError('.exe', 'unsupported_format'))).toBe('unsupported_format');
    expect(classifyLoadError(new FileValidationError('empty', 'empty'))).toBe('parse');
    expect(classifyLoadError(new UnsupportedFormatError('V3000'))).toBe('unsupported_format');
    expect(classifyLoadError(asParseError(new Error('No valid atoms')))).toBe('parse');
    expect(classifyLoadError(new DOMException('Aborted', 'AbortError'))).toBe('timeout');
    expect(classifyLoadError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyLoadError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe('other');
    expect(classifyLoadError('weird')).toBe('other');
  });
});
