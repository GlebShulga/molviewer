import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StructureListItem } from '../StructureList/StructureListItem';
import type { Structure } from '../../../types';

const structure = {
  id: 's1',
  name: '1CRN',
  visible: true,
  representation: 'cartoon',
  colorScheme: 'chain',
  componentSettings: [],
  molecule: { name: '1CRN', atoms: [{ id: 0, element: 'C', x: 0, y: 0, z: 0 }], bonds: [] },
} as unknown as Structure;

function renderItem() {
  const handlers = { onSelect: vi.fn(), onToggleVisibility: vi.fn(), onRemove: vi.fn() };
  render(<StructureListItem structure={structure} isActive={false} {...handlers} />);
  return handlers;
}

describe('StructureListItem keyboard', () => {
  it('Enter on Remove removes the structure without selecting the row', async () => {
    const user = userEvent.setup();
    const handlers = renderItem();
    screen.getByTitle('Remove structure').focus();
    await user.keyboard('{Enter}');
    expect(handlers.onRemove).toHaveBeenCalledTimes(1);
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it('Space on the visibility button toggles it without selecting the row', async () => {
    const user = userEvent.setup();
    const handlers = renderItem();
    screen.getByTitle('Hide structure').focus();
    await user.keyboard(' ');
    expect(handlers.onToggleVisibility).toHaveBeenCalledTimes(1);
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it('Enter and Space on the row select it', async () => {
    const user = userEvent.setup();
    const handlers = renderItem();
    screen.getByRole('button', { name: /1CRN/ }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(handlers.onSelect).toHaveBeenCalledTimes(2);
  });
});
