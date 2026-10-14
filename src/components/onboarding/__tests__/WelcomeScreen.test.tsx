import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeScreen } from '../WelcomeScreen';

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

describe('WelcomeScreen background', () => {
  it('draws the molecule as a static SVG, without a WebGL canvas', () => {
    const { container } = render(<WelcomeScreen onStart={() => {}} isLoading={false} onExample={() => {}} />);
    const welcome = container.querySelector('[data-onboarding="welcome-screen"]')!;

    expect(welcome.querySelector(':scope > svg')).not.toBeNull();
    expect(welcome.querySelectorAll(':scope > svg circle')).toHaveLength(24);
    expect(welcome.querySelector('canvas')).toBeNull();
  });
});
