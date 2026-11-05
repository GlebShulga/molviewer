import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useMoleculeStore } from '../../../store/moleculeStore';
import { MeasurementHint, measurementHintText } from '../MeasurementHint';

describe('measurementHintText', () => {
  it('says how many atoms the mode needs and how many are picked', () => {
    expect(measurementHintText('distance', 1, true)).toBe('Tap 2 atoms · 1/2');
    expect(measurementHintText('angle', 0, false)).toBe('Click 3 atoms · 0/3');
    expect(measurementHintText('dihedral', 2, true)).toBe('Tap 4 atoms · 2/4');
  });

  it('shows the value just measured until the next atom is picked', () => {
    const measured = { id: 'm', type: 'distance' as const, atomIndices: [0, 1], atomRefs: [], value: 11.6912, unit: 'Å' };
    expect(measurementHintText('distance', 0, true, measured)).toBe('11.69 Å · tap 2 more');
    expect(measurementHintText('distance', 1, true, measured)).toBe('Tap 2 atoms · 1/2');
  });
});

describe('MeasurementHint', () => {
  beforeEach(() => {
    useMoleculeStore.getState().reset();
  });

  it('is hidden when no measurement mode is on', () => {
    render(<MeasurementHint />);
    expect(screen.queryByTestId('measurement-hint')).toBeNull();
  });

  it('shows while measuring, and Done turns the mode off', () => {
    useMoleculeStore.getState().setMeasurementMode('distance');
    render(<MeasurementHint />);

    expect(screen.getByTestId('measurement-hint').textContent).toContain('2 atoms · 0/2');

    // A finished measurement shows its value
    act(() => {
      useMoleculeStore.getState().addMeasurement({ id: 'm', type: 'distance', atomIndices: [0, 1], atomRefs: [], value: 3.5, unit: 'Å' });
    });
    expect(screen.getByTestId('measurement-hint').textContent).toContain('3.50 Å · ');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(useMoleculeStore.getState().measurementMode).toBe('none');
    expect(screen.queryByTestId('measurement-hint')).toBeNull();
  });
});
