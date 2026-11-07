import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ShortcutsHelp } from '../ShortcutsHelp';
import { KEYBOARD_SHORTCUTS } from '../../../hooks/useKeyboardShortcuts';

describe('ShortcutsHelp', () => {
  it('lists every keyboard shortcut once', () => {
    render(<ShortcutsHelp isOpen onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const shown = Array.from(dialog.querySelectorAll('kbd')).map((k) => k.textContent);
    expect(shown.sort()).toEqual(KEYBOARD_SHORTCUTS.map((s) => s.key).sort());
  });

  it('shows undo, redo and auto-rotate', () => {
    render(<ShortcutsHelp isOpen onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Undo')).toBeTruthy();
    expect(within(dialog).getAllByText('Redo').length).toBe(2);
    expect(within(dialog).getByText('Toggle auto-rotate')).toBeTruthy();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ShortcutsHelp isOpen onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
