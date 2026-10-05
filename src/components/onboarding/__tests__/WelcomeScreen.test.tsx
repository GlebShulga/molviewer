import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeScreen } from '../WelcomeScreen';

// The background molecule renders through react-three-fiber, which needs WebGL.
vi.mock('../WelcomeMolecule', () => ({ WelcomeMolecule: () => null }));

function renderScreen(isLoading: boolean) {
  const onExample = vi.fn();
  render(<WelcomeScreen onStart={() => {}} isLoading={isLoading} onExample={onExample} />);
  return { onExample, link: screen.getByRole('link', { name: 'Hemoglobin 4HHB' }) };
}

describe('WelcomeScreen example links', () => {
  it('loads the example in place on a plain click', () => {
    const { onExample, link } = renderScreen(false);
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(link, event);

    expect(onExample).toHaveBeenCalledWith('/pdb/4HHB');
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves a modified click to the browser, so the link opens in a new tab', () => {
    const { onExample, link } = renderScreen(false);
    // The listener reads the verdict once the component has had the event, then
    // stops jsdom from trying to navigate for real.
    let preventedByComponent: boolean | null = null;
    document.addEventListener('click', (e) => { preventedByComponent = e.defaultPrevented; e.preventDefault(); }, { once: true });

    fireEvent(link, new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));

    expect(onExample).not.toHaveBeenCalled();
    expect(preventedByComponent).toBe(false);
  });

  it('is inert while the tour molecule loads, so no second structure is loaded', () => {
    const { onExample, link } = renderScreen(true);
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    fireEvent(link, event);

    expect(onExample).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(link.getAttribute('aria-disabled')).toBe('true');
  });
});
