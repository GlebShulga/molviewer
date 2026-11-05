import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { MoleculeViewerPage } from '../../page-objects';
import { molecules } from '../../fixtures';
import { waitForMoleculeLoaded } from '../../helpers/wait-for-render';

/**
 * Fixes from the mobile audit: toolbar "More" menu, the sheet as a modal,
 * touch targets, the viewer's overlays, and export/copy feedback.
 */

const MOBILE_PROJECTS = ['mobile-chrome', 'mobile-safari'];

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!MOBILE_PROJECTS.includes(testInfo.project.name), 'Mobile tests only run on mobile-chrome and mobile-safari');
  // 1CRN from disk, so nothing depends on RCSB
  await page.route('**/files.rcsb.org/download/1CRN.cif', (route) =>
    route.fulfill({ path: molecules.crambinCif, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' } })
  );
});

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const insideViewport = (b: Box, vw: number, vh: number) => b.top >= 0 && b.left >= 0 && b.bottom <= vh && b.right <= vw;
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The app with onboarding done and Caffeine loaded from the sheet's samples. */
async function withCaffeine(page: Page) {
  const viewer = new MoleculeViewerPage(page);
  await viewer.goto();
  await viewer.openSidebar();
  await viewer.loadSampleMolecule('caffeine');
  return viewer;
}

/** 1CRN through its readable address, so Copy Link has something to copy. */
async function withCrambin(page: Page) {
  await page.addInitScript(() => localStorage.setItem('mol3d-onboarding-completed', 'true'));
  await page.goto('/pdb/1CRN');
  await waitForMoleculeLoaded(page);
}

async function openMoreMenu(page: Page) {
  await page.getByRole('button', { name: 'More', exact: true }).click({ force: true });
  await expect(page.getByRole('menu', { name: 'More actions' })).toBeVisible();
}

test.describe('Toolbar on phones', () => {
  test('fits the screen without scrolling, down to 360px', async ({ page }) => {
    await withCaffeine(page);
    for (const width of [page.viewportSize()!.width, 360]) {
      await page.setViewportSize({ width, height: 740 });
      await page.waitForTimeout(200);
      const m = await page.getByTestId('toolbar').evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        box: el.getBoundingClientRect().toJSON(),
        vw: window.innerWidth,
      }));
      expect(m.scrollWidth, `toolbar scrolls at ${width}px`).toBeLessThanOrEqual(m.clientWidth);
      expect(insideViewport(m.box, m.vw, 740), `toolbar on screen at ${width}px`).toBe(true);
    }
    // Undo/Redo and the View group live in the menu now
    await expect(page.getByRole('button', { name: 'Reset View', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible();
  });

  test('"More" opens a menu that is fully on screen, with every item reachable', async ({ page }) => {
    await withCaffeine(page);
    await openMoreMenu(page);

    const result = await page.getByRole('menu', { name: 'More actions' }).evaluate((menu) => {
      const items = Array.from(menu.querySelectorAll('[role^="menuitem"]'));
      return {
        box: menu.getBoundingClientRect().toJSON(),
        vw: window.innerWidth,
        vh: window.innerHeight,
        labels: items.map((i) => i.textContent),
        // The element under each item's center is the item: not clipped or covered
        reachable: items.map((i) => {
          const r = i.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!hit && i.contains(hit);
        }),
        heights: items.map((i) => i.getBoundingClientRect().height),
      };
    });
    expect(insideViewport(result.box, result.vw, result.vh)).toBe(true);
    expect(result.labels).toEqual(['Undo', 'Redo', 'Reset View', 'Auto Rotate', 'Export', 'Copy Link']);
    expect(result.reachable.every(Boolean)).toBe(true);
    for (const h of result.heights) expect(h).toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('Export from the menu opens the share sheet where files can be shared', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __shared?: string };
      Object.assign(navigator, {
        canShare: () => true,
        share: (data: { files: File[] }) => {
          w.__shared = data.files[0].name;
          return Promise.resolve();
        },
      });
    });
    await withCaffeine(page);
    await openMoreMenu(page);
    await page.getByRole('menuitem', { name: 'Export' }).click({ force: true });

    await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: string }).__shared)).toMatch(/\.png$/);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('Export downloads where sharing is not available, and says so', async ({ page }) => {
    await page.addInitScript(() => Object.assign(navigator, { canShare: undefined, share: undefined }));
    await withCaffeine(page);
    await openMoreMenu(page);
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Export' }).click({ force: true });

    expect((await download).suggestedFilename()).toMatch(/\.png$/);
    await expect(page.getByTestId('toast')).toHaveText('Image saved');

    // Next to the toolbar, not over the middle of the molecule
    const toast = (await page.getByTestId('toast').boundingBox())!;
    const toolbar = (await page.getByTestId('toolbar').boundingBox())!;
    expect(toolbar.y - (toast.y + toast.height)).toBeGreaterThanOrEqual(0);
    expect(toolbar.y - (toast.y + toast.height)).toBeLessThanOrEqual(24);
  });

  test('from the keyboard, choosing an item returns focus to "More", and Auto Rotate says it is on', async ({ page }) => {
    await withCaffeine(page);
    const more = page.getByRole('button', { name: 'More', exact: true });
    const autoRotate = page.getByRole('menuitemcheckbox', { name: 'Auto Rotate' });

    await more.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu', { name: 'More actions' })).toBeVisible();
    await expect(autoRotate).toHaveAttribute('aria-checked', 'false');
    // The menu focuses its first enabled item; arrows move to Auto Rotate
    for (let i = 0; i < 6 && !(await autoRotate.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('ArrowDown');
    }
    await expect(autoRotate).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(more).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(autoRotate).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('menuitem', { name: 'Reset View' })).toBeVisible();
  });

  test('Copy Link from the menu says the link was copied', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() } });
    });
    await withCrambin(page);
    await openMoreMenu(page);
    await page.getByRole('menuitem', { name: 'Copy Link' }).click({ force: true });

    await expect(page.getByTestId('toast')).toHaveText('Link copied');
  });
});

test.describe('Sheet', () => {
  test('is a modal dialog while open, and a load from it closes it', async ({ page }) => {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    await viewer.openSidebar();

    const sheet = page.locator('aside');
    await expect(sheet).toHaveAttribute('role', 'dialog');
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();

    await viewer.loadSampleMolecule('caffeine');

    await expect.poll(() => viewer.isSidebarOpen()).toBe(false);
    await expect(sheet).not.toHaveAttribute('role', 'dialog');
    await expect(page.getByTestId('toolbar')).toBeVisible();
  });

  test('a drag at the end of the sheet does not scroll the page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Touch input goes through CDP');
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    await viewer.openSidebar();
    // Until the sheet has slid all the way up: under load the 0.3s transition
    // runs long, and a touch computed mid-slide would land outside the sheet
    await expect
      .poll(() => page.locator('aside').evaluate((el) => Math.round(el.getBoundingClientRect().bottom) === window.innerHeight))
      .toBe(true);

    const point = await page.locator('aside').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.7 };
    });
    const before = await page.evaluate(() => window.scrollY);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y - i * 30 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);

    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});

test.describe('Sheet content', () => {
  test('the sequence is one sideways row per chain, not a second vertical scroller', async ({ page }) => {
    await withCrambin(page);
    await new MoleculeViewerPage(page).openSidebar();
    const container = page.locator('[class*="sequenceContainer"]');
    await expect(container).toBeAttached();

    const m = await container.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(m.scrollHeight).toBeLessThanOrEqual(m.clientHeight);
    expect(m.scrollWidth).toBeGreaterThan(m.clientWidth);
  });

  test('the sequence legend uses the 3D view colors, like the legend over the viewer', async ({ page }) => {
    await withCrambin(page);
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mol3d_store.getState().setColorScheme('secondaryStructure');
    });
    await expect(page.getByTestId('color-legend')).toBeVisible();

    const colors = await page.evaluate(() => ({
      viewer: Array.from(document.querySelectorAll('[data-testid="color-legend"] [class*="legendSwatch"]')).map((e) => getComputedStyle(e).backgroundColor),
      sequence: Array.from(document.querySelectorAll('[class*="sequenceViewer"] [class*="legendColor"]')).map((e) => getComputedStyle(e).backgroundColor),
    }));
    expect(colors.sequence).toHaveLength(3);
    expect(colors.sequence).toEqual(colors.viewer);
  });

  test('the structure chip opens the sheet at Molecule Info', async ({ page }) => {
    const viewer = await withCaffeine(page);
    await expect.poll(() => viewer.isSidebarOpen()).toBe(false);

    await page.getByTestId('structure-title').click({ force: true });
    await expect.poll(() => viewer.isSidebarOpen()).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const sheet = document.querySelector('aside')!.getBoundingClientRect();
          const info = document.getElementById('molecule-info')!.getBoundingClientRect();
          return info.top >= sheet.top && info.top < sheet.top + 120;
        })
      )
      .toBe(true);
  });
});

test.describe('Canvas drags', () => {
  test('a vertical drag on the molecule rotates it and does not scroll the page', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Touch input goes through CDP');
    await withCaffeine(page);

    const canvas = page.locator('#viewer-main canvas').first();
    await expect(canvas).toHaveCSS('touch-action', 'none');
    // The home page is taller than the screen, so a scroll would show
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);

    const box = (await canvas.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height * 0.3;
    const pixels = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    const before = await pixels();

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 20 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(600);

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await pixels(), 'the molecule rotated').not.toBe(before);
  });
});

test.describe('Ways in and touch targets', () => {
  test('the empty state opens the sheet', async ({ page }) => {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    await page.getByRole('button', { name: 'Load a structure' }).click({ force: true });
    await expect.poll(() => viewer.isSidebarOpen()).toBe(true);
  });

  test('sheet inputs and buttons are finger-sized and keep iOS from zooming', async ({ page }) => {
    const viewer = new MoleculeViewerPage(page);
    await viewer.goto();
    await viewer.openSidebar();
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
      const height = (el: Element | null) => (el ? el.getBoundingClientRect().height : 0);
      const inputs = ['#pdb-input', '#uniprot-input', '#pubchem-input'].map((s) => document.querySelector<HTMLInputElement>(s)!);
      const fetchButtons = inputs.map((i) => i.form!.querySelector('button[type="submit"]'));
      return {
        inputHeights: inputs.map(height),
        inputFontSizes: inputs.map((i) => getComputedStyle(i).fontSize),
        capitalize: inputs.map((i) => i.getAttribute('autocapitalize')),
        spellcheck: inputs.map((i) => i.getAttribute('spellcheck')),
        enterKeyHint: inputs.map((i) => i.getAttribute('enterkeyhint')),
        fetchHeights: fetchButtons.map(height),
        sampleHeights: Array.from(document.querySelectorAll('[class*="sampleButton"]')).map(height),
        github: height(document.querySelector('[aria-label="View on Github"]')),
      };
    });

    for (const h of [...m.inputHeights, ...m.fetchHeights, ...m.sampleHeights, m.github]) {
      expect(h).toBeGreaterThanOrEqual(44);
    }
    expect(m.sampleHeights.length).toBeGreaterThan(0);
    expect(m.inputFontSizes).toEqual(['16px', '16px', '16px']);
    expect(m.capitalize).toEqual(['characters', 'characters', 'off']);
    expect(m.spellcheck).toEqual(['false', 'false', 'false']);
    expect(m.enterKeyHint).toEqual(['go', 'go', 'go']);
  });
});

test.describe('Viewer overlays', () => {
  test('error, hint, atom card, title, legend and toolbar never overlap', async ({ page }) => {
    await withCrambin(page);
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__mol3d_store;
      const s = store.getState();
      const id = s.structureOrder[0];
      s.setColorScheme('secondaryStructure');
      s.setMeasurementMode('distance');
      // A tap near the right edge
      s.setHoveredAtom(s.structures.get(id).molecule.atoms[0], 0, id, { x: window.innerWidth - 5, y: window.innerHeight / 2 });
      s.setError('Something went wrong while loading the second structure');
    });

    const testIds = ['toolbar', 'measurement-hint', 'atom-card', 'color-legend', 'structure-title'];
    for (const id of testIds) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
    await test.info().attach('overlays', { body: await page.screenshot(), contentType: 'image/png' });

    const boxes = await page.evaluate((ids) => {
      const els: [string, Element | null][] = ids.map((id) => [id, document.querySelector(`[data-testid="${id}"]`)]);
      els.push(['error', document.querySelector('[role="alert"]')]);
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        boxes: els.map(([name, el]) => ({ name, ...el!.getBoundingClientRect().toJSON() })),
      };
    }, testIds);

    for (const b of boxes.boxes) {
      expect(insideViewport(b, boxes.vw, boxes.vh), `${b.name} on screen`).toBe(true);
    }
    for (let i = 0; i < boxes.boxes.length; i++) {
      for (let j = i + 1; j < boxes.boxes.length; j++) {
        const [a, b] = [boxes.boxes[i], boxes.boxes[j]];
        expect(overlaps(a, b), `${a.name} overlaps ${b.name}`).toBe(false);
      }
    }
  });

  test('every tap on an atom counts while the atom card is showing, and the hint shows the result', async ({ page }) => {
    // A grid of real taps, each checked against the store
    test.setTimeout(90_000);
    await withCrambin(page);
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__mol3d_store.getState();
      s.setRepresentation('spacefill');
      s.setMeasurementMode('distance');
    });
    await page.waitForTimeout(500);

    const state = () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).__mol3d_store.getState();
        return { hovered: s.hoveredAtomIndex as number | null, picked: s.selectedAtoms.length as number, measured: s.measurements.length as number };
      });
    const box = (await page.locator('#viewer-main canvas').first().boundingBox())!;
    let atomTaps = 0;
    for (let y = box.y + box.height * 0.35; y < box.y + box.height * 0.65; y += 50) {
      for (let x = box.x + box.width * 0.3; x < box.x + box.width * 0.7; x += 50) {
        const before = await state();
        await page.touchscreen.tap(x, y);
        await page.waitForTimeout(200);
        const after = await state();
        if (after.hovered === null) continue; // missed the molecule
        atomTaps++;
        // Picked: a first atom, or the second one completing a measurement
        const counted = after.picked !== before.picked || after.measured !== before.measured;
        expect(counted, `tap at ${Math.round(x)},${Math.round(y)} (card was ${before.hovered === null ? 'closed' : 'open'})`).toBe(true);
      }
    }
    expect(atomTaps).toBeGreaterThan(3);
    await expect(page.getByTestId('atom-card')).toBeVisible();
    await expect(page.getByTestId('atom-tooltip')).toHaveCount(0);

    // Right after a measurement the hint names it
    const s = await state();
    if (s.picked === 0) await expect(page.getByTestId('measurement-hint')).toContainText(/\d+\.\d\d Å · tap 2 more/);
  });

  test('the measurement hint counts atoms and Done ends measuring', async ({ page }) => {
    await withCaffeine(page);
    await page.getByRole('button', { name: 'Distance', exact: true }).click({ force: true });

    const hint = page.getByTestId('measurement-hint');
    await expect(hint).toContainText('Tap 2 atoms · 0/2');
    await hint.getByRole('button', { name: 'Done' }).click({ force: true });

    await expect(hint).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Distance', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });
});
