import { Page, expect } from '@playwright/test';
import { molecules, sampleMolecules } from '../fixtures';
import { waitForMoleculeLoaded } from './wait-for-render';

/**
 * Load a sample molecule by clicking its button in the sidebar
 */
export async function loadSampleMolecule(
  page: Page,
  molecule: keyof typeof sampleMolecules
): Promise<void> {
  const buttonName = sampleMolecules[molecule];
  await page.getByRole('button', { name: buttonName }).click();
  await waitForMoleculeLoaded(page);
}

/**
 * Upload a molecule file through the file input
 */
export async function uploadMoleculeFile(page: Page, filePath: string): Promise<void> {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);
  await waitForMoleculeLoaded(page);
}

/**
 * Fetch a molecule from RCSB PDB
 */
export async function fetchFromRCSB(page: Page, pdbId: string): Promise<void> {
  const input = page.getByPlaceholder(/PDB ID/i);
  await input.fill(pdbId);
  await page.getByRole('button', { name: /fetch/i }).click();
  await waitForMoleculeLoaded(page);
}

/**
 * Press a keyboard shortcut
 */
export async function pressKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
}

/**
 * Press modifier + key shortcut
 */
export async function pressShortcut(
  page: Page,
  modifiers: ('Control' | 'Shift' | 'Alt' | 'Meta')[],
  key: string
): Promise<void> {
  const combo = [...modifiers, key].join('+');
  await page.keyboard.press(combo);
}

/**
 * Wait for and verify a toast notification
 */
export async function expectToast(page: Page, textPattern: string | RegExp): Promise<void> {
  const toast = page.locator('[role="alert"], .toast, [data-testid="toast"]');
  await expect(toast.filter({ hasText: textPattern })).toBeVisible({ timeout: 5000 });
}

/**
 * Clear all measurements
 */
export async function clearAllMeasurements(page: Page): Promise<void> {
  const clearButton = page.getByRole('button', { name: /clear all/i });
  if (await clearButton.isVisible()) {
    await clearButton.click();
  }
}

/**
 * Get the current representation from the UI
 */
export async function getCurrentRepresentation(page: Page): Promise<string> {
  // Look for the active/selected representation in the control panel
  const activeRep = page.locator('[data-testid="representation-selector"] [data-selected="true"]');
  if (await activeRep.isVisible()) {
    return (await activeRep.textContent()) || '';
  }
  // Fallback: check radio buttons
  const checkedRadio = page.locator('input[name="representation"]:checked');
  if (await checkedRadio.isVisible()) {
    const label = page.locator(`label[for="${await checkedRadio.getAttribute('id')}"]`);
    return (await label.textContent()) || '';
  }
  return '';
}

/**
 * Get the current color scheme from the UI
 */
export async function getCurrentColorScheme(page: Page): Promise<string> {
  const activeScheme = page.locator('[data-testid="color-scheme-selector"] [data-selected="true"]');
  if (await activeScheme.isVisible()) {
    return (await activeScheme.textContent()) || '';
  }
  const checkedRadio = page.locator('input[name="colorScheme"]:checked');
  if (await checkedRadio.isVisible()) {
    const label = page.locator(`label[for="${await checkedRadio.getAttribute('id')}"]`);
    return (await label.textContent()) || '';
  }
  return '';
}

/**
 * Check if a molecule is currently loaded
 */
export async function isMoleculeLoaded(page: Page): Promise<boolean> {
  // Check for presence of atoms in the scene
  return page.evaluate(() => {
    const scene = (window as unknown as { __mol3d_scene?: { children: unknown[] } }).__mol3d_scene;
    return scene ? scene.children.length > 0 : false;
  });
}

/**
 * Toggle theme between light and dark
 */
export async function toggleTheme(page: Page): Promise<void> {
  const themeToggle = page.getByRole('button', { name: /theme|dark|light/i });
  await themeToggle.click();
}

/**
 * Get current theme
 */
export async function getCurrentTheme(page: Page): Promise<'light' | 'dark'> {
  const html = page.locator('html');
  const theme = await html.getAttribute('data-theme');
  return theme === 'light' ? 'light' : 'dark';
}

/**
 * Open the context menu at canvas center
 */
export async function openContextMenu(page: Page): Promise<void> {
  const canvas = page.locator('canvas');
  await canvas.click({ button: 'right' });
}

/**
 * Close any open context menu
 */
export async function closeContextMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
}

/**
 * Check if context menu is visible
 */
export async function isContextMenuVisible(page: Page): Promise<boolean> {
  const menu = page.locator('[data-testid="context-menu"], .context-menu');
  return menu.isVisible();
}

/**
 * Perform undo action
 */
export async function undo(page: Page): Promise<void> {
  await pressShortcut(page, ['Control'], 'z');
}

/**
 * Perform redo action
 */
export async function redo(page: Page): Promise<void> {
  await pressShortcut(page, ['Control'], 'y');
}

/**
 * Get atom count from the scene
 */
export async function getAtomCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    // This is a simplified check - actual implementation depends on how atoms are tracked
    interface SceneLike {
      traverse(callback: (obj: MeshLike) => void): void;
    }
    interface MeshLike {
      isMesh?: boolean;
      isInstancedMesh?: boolean;
      count?: number;
    }
    const scene = (window as unknown as { __mol3d_scene?: SceneLike }).__mol3d_scene;
    if (!scene) return 0;

    let count = 0;
    scene.traverse((object: MeshLike) => {
      // Count mesh objects that represent atoms (typically InstancedMesh or Mesh with SphereGeometry)
      if (object.isMesh) {
        if (object.isInstancedMesh) {
          count += object.count || 0;
        } else {
          count += 1;
        }
      }
    });
    return count;
  });
}

// Re-export fixtures for convenience
export { molecules, sampleMolecules };

// ============================================
// Multi-Structure Helpers
// ============================================

/**
 * Load multiple structure files sequentially
 */
export async function loadMultipleStructures(page: Page, files: string[]): Promise<void> {
  const fileInput = page.locator('input[type="file"]');
  const modeToggle = page.locator('[class*="modeToggle"]');

  for (let i = 0; i < files.length; i++) {
    // For second structure onwards, ensure Add mode is active
    if (i > 0 && await modeToggle.isVisible().catch(() => false)) {
      const addButton = modeToggle.locator('button').filter({ hasText: /add/i });
      await addButton.click();
    }
    await fileInput.setInputFiles(files[i]);
    await waitForMoleculeLoaded(page);
  }
}

/**
 * Get names of visible structures
 */
export async function getVisibleStructures(page: Page): Promise<string[]> {
  const structureList = page.locator('[class*="structureList"]');
  const items = structureList.locator('[class*="item"], [class*="structureItem"]');
  const allItems = await items.all();
  const visible: string[] = [];

  for (const item of allItems) {
    const classes = await item.getAttribute('class');
    if (!classes?.includes('hidden') && !classes?.includes('invisible')) {
      const nameLocator = item.locator('[class*="name"], span').first();
      const name = await nameLocator.textContent();
      if (name) visible.push(name.trim());
    }
  }
  return visible;
}

/**
 * Switch to a specific structure by name
 */
export async function switchActiveStructure(page: Page, name: string): Promise<void> {
  const structureList = page.locator('[class*="structureList"]');
  const item = structureList.locator('[class*="item"], [class*="structureItem"]').filter({ hasText: name });
  await item.click();
  await page.waitForTimeout(200);
}

// ============================================
// Sequence Viewer Helpers
// ============================================

/**
 * Click on a residue in the sequence viewer
 */
export async function clickSequenceResidue(page: Page, chainId: string, resNumber: number): Promise<void> {
  const residue = page.locator(
    `[data-residue-key="${chainId}:${resNumber}"], [data-chain="${chainId}"][data-residue="${resNumber}"]`
  );
  await residue.click();
}

/**
 * Check if sequence viewer is visible
 */
export async function isSequenceViewerVisible(page: Page): Promise<boolean> {
  const container = page.locator('[class*="sequenceViewer"]');
  return container.isVisible();
}

// ============================================
// Mobile/Viewport Helpers
// ============================================

/**
 * Common viewport sizes
 */
export const viewports = {
  mobile: { width: 375, height: 667 },    // iPhone SE
  tablet: { width: 768, height: 1024 },   // iPad
  desktop: { width: 1280, height: 720 },  // Standard desktop
} as const;

/**
 * Set viewport to mobile size
 */
export async function setMobileViewport(page: Page): Promise<void> {
  await page.setViewportSize(viewports.mobile);
}

/**
 * Set viewport to tablet size
 */
export async function setTabletViewport(page: Page): Promise<void> {
  await page.setViewportSize(viewports.tablet);
}

/**
 * Set viewport to desktop size
 */
export async function setDesktopViewport(page: Page): Promise<void> {
  await page.setViewportSize(viewports.desktop);
}

/**
 * Check if mobile sidebar is open
 */
export async function isMobileSidebarOpen(page: Page): Promise<boolean> {
  const sidebar = page.locator('aside');
  const classes = await sidebar.getAttribute('class');
  return classes?.includes('open') || false;
}

/**
 * Open mobile sidebar via hamburger menu
 */
export async function openMobileSidebar(page: Page): Promise<void> {
  const menuButton = page.locator('[class*="menuButton"]');
  await menuButton.click();
  await page.waitForTimeout(300); // Wait for animation
}

/**
 * Close mobile sidebar via close button
 */
export async function closeMobileSidebar(page: Page): Promise<void> {
  const closeButton = page.locator('[class*="sidebarCloseButton"]');
  await closeButton.click();
  await page.waitForTimeout(300); // Wait for animation
}
