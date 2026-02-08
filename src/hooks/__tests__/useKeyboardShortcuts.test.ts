import { describe, it, expect } from 'vitest';
import { KEYBOARD_SHORTCUTS } from '../useKeyboardShortcuts';

describe('KEYBOARD_SHORTCUTS', () => {
  it('exports a non-empty array of shortcuts', () => {
    expect(KEYBOARD_SHORTCUTS.length).toBeGreaterThan(0);
  });

  it('each shortcut has required fields', () => {
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(shortcut.key).toBeTruthy();
      expect(shortcut.description).toBeTruthy();
      expect(typeof shortcut.action).toBe('function');
    }
  });

  it('includes undo/redo shortcuts with ctrl modifier', () => {
    const undoShortcut = KEYBOARD_SHORTCUTS.find(s => s.key === 'Ctrl+Z');
    expect(undoShortcut).toBeDefined();
    expect(undoShortcut!.modifiers?.ctrl).toBe(true);

    const redoShortcut = KEYBOARD_SHORTCUTS.find(s => s.key === 'Ctrl+Y');
    expect(redoShortcut).toBeDefined();
    expect(redoShortcut!.modifiers?.ctrl).toBe(true);
  });

  it('includes representation shortcuts 1-3', () => {
    expect(KEYBOARD_SHORTCUTS.find(s => s.key === '1')).toBeDefined();
    expect(KEYBOARD_SHORTCUTS.find(s => s.key === '2')).toBeDefined();
    expect(KEYBOARD_SHORTCUTS.find(s => s.key === '3')).toBeDefined();
  });

  it('includes measurement shortcuts', () => {
    expect(KEYBOARD_SHORTCUTS.find(s => s.key === 'D')).toBeDefined();
    expect(KEYBOARD_SHORTCUTS.find(s => s.key === 'A')).toBeDefined();
  });
});
