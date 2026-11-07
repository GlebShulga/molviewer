import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeContext';

function ShowTheme() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;

describe('ThemeProvider with storage blocked', () => {
  beforeEach(() => {
    // As in a browser that blocks site data: reading window.localStorage throws
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-color-scheme: light)' }));
  });
  afterEach(() => {
    Object.defineProperty(window, 'localStorage', original);
    vi.unstubAllGlobals();
  });

  it('starts from the system preference and still toggles', () => {
    render(
      <ThemeProvider>
        <ShowTheme />
      </ThemeProvider>
    );
    expect(screen.getByRole('button').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    act(() => screen.getByRole('button').click());
    expect(screen.getByRole('button').textContent).toBe('dark');
  });
});

describe('ThemeProvider with storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('restores and saves the chosen theme', () => {
    localStorage.setItem('mol3d-theme', 'light');
    render(
      <ThemeProvider>
        <ShowTheme />
      </ThemeProvider>
    );
    expect(screen.getByRole('button').textContent).toBe('light');
    act(() => screen.getByRole('button').click());
    expect(localStorage.getItem('mol3d-theme')).toBe('dark');
  });
});
