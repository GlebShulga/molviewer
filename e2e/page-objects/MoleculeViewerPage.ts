import { Page, Locator } from '@playwright/test';
import { Canvas3DPage } from './Canvas3D';
import { ToolbarPage } from './Toolbar';
import { ControlPanelPage } from './ControlPanel';
import { SequenceViewerPage } from './SequenceViewerPage';
import { StructureListPage } from './StructureListPage';
import { waitForMoleculeLoaded } from '../helpers/wait-for-render';
import { sampleMolecules } from '../fixtures';

/**
 * Main page object for the Molecule Viewer application
 */
export class MoleculeViewerPage {
  readonly page: Page;
  readonly canvas: Canvas3DPage;
  readonly toolbar: ToolbarPage;
  readonly controlPanel: ControlPanelPage;
  readonly sequenceViewerPage: SequenceViewerPage;
  readonly structureList: StructureListPage;

  // Header elements
  readonly header: Locator;
  readonly title: Locator;
  readonly themeToggle: Locator;
  readonly menuButton: Locator;

  // Sidebar
  readonly sidebar: Locator;
  readonly sidebarCloseButton: Locator;
  readonly sidebarOverlay: Locator;

  // File upload section
  readonly fileInput: Locator;
  readonly dropZone: Locator;
  readonly pdbIdInput: Locator;
  readonly fetchButton: Locator;

  // Sample molecule buttons
  readonly sampleButtons: Locator;

  // Context menu
  readonly contextMenu: Locator;

  // Shortcuts help modal
  readonly shortcutsHelp: Locator;

  // Sequence viewer
  readonly sequenceViewer: Locator;

  // Measurement panel
  readonly measurementPanel: Locator;

  // Export panel
  readonly exportPanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.canvas = new Canvas3DPage(page);
    this.toolbar = new ToolbarPage(page);
    this.controlPanel = new ControlPanelPage(page);
    this.sequenceViewerPage = new SequenceViewerPage(page);
    this.structureList = new StructureListPage(page);

    // Header
    this.header = page.locator('header');
    this.title = page.locator('h1');
    this.themeToggle = page.locator('[class*="themeToggle"]');
    this.menuButton = page.locator('[class*="menuButton"]');

    // Sidebar
    this.sidebar = page.locator('aside');
    this.sidebarCloseButton = page.locator('[class*="sidebarCloseButton"]');
    this.sidebarOverlay = page.locator('[class*="sidebarOverlay"]');

    // File upload
    this.fileInput = page.locator('input[type="file"]');
    this.dropZone = page.locator('[class*="dropZone"]');
    this.pdbIdInput = page.getByPlaceholder(/1CRN/i);
    this.fetchButton = page.getByRole('button', { name: /Fetch/i });

    // Sample buttons
    this.sampleButtons = page.locator('[class*="sampleButton"]');

    // Context menu
    this.contextMenu = page.locator('[class*="contextMenu"]');

    // Shortcuts help - target modalContent specifically to avoid matching multiple nested elements
    this.shortcutsHelp = page.locator('[class*="modalContent"]').filter({
      has: page.getByRole('heading', { name: 'Keyboard Shortcuts' }),
    });

    // Sequence viewer
    this.sequenceViewer = page.locator('[class*="sequenceViewer"]');

    // Measurement panel
    this.measurementPanel = page.locator('[class*="measurementPanel"]');

    // Export panel - locate the entire CollapsibleSection to find elements inside
    this.exportPanel = page.locator('[class*="collapsibleSection"]').filter({ hasText: 'Export' });
  }

  /**
   * Navigate to the application with clean state for test isolation
   * Storage clearing is handled by the page fixture in e2e/fixtures.ts
   */
  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Load a sample molecule by clicking its button
   * Uses evaluate().click() to bypass both Playwright stability checks AND viewport coordinate checks.
   * This is necessary because on mobile viewports, the sidebar uses CSS transform (translateX(-100%))
   * which places elements at negative x coordinates even when visually visible during animation.
   */
  async loadSampleMolecule(molecule: keyof typeof sampleMolecules): Promise<void> {
    const buttonName = sampleMolecules[molecule];
    const button = this.page.getByRole('button', { name: buttonName });

    // Wait for button to be attached to DOM
    await button.waitFor({ state: 'attached', timeout: 5000 });

    // Use evaluate() to click directly, bypassing Playwright's viewport coordinate check
    // This works for off-canvas elements during CSS transform animations
    await button.evaluate((el) => (el as HTMLElement).click());

    await waitForMoleculeLoaded(this.page);
  }

  /**
   * Upload a molecule file through the file input
   */
  async uploadFile(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath);
    await waitForMoleculeLoaded(this.page);
  }

  /**
   * Upload a molecule file expecting an error (doesn't wait for molecule to load)
   * Use this for testing invalid/malformed files
   */
  async uploadFileExpectError(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath);
    // Don't wait for molecule to load - it will fail
    // Just wait a short time for error state to appear
    await this.page.waitForTimeout(500);
  }

  /**
   * Fetch a molecule from RCSB PDB
   * Uses force: true to bypass Playwright stability checks that hang due to WebGL canvas repainting
   */
  async fetchFromRCSB(pdbId: string): Promise<void> {
    await this.pdbIdInput.fill(pdbId);
    await this.fetchButton.click({ force: true });
    await this.page.waitForTimeout(300);
  }

  /**
   * Fetch from RCSB and wait for load
   */
  async fetchFromRCSBAndWait(pdbId: string): Promise<void> {
    await this.fetchFromRCSB(pdbId);
    await waitForMoleculeLoaded(this.page, 60000); // Longer timeout for network
  }

  /**
   * Toggle theme between light and dark
   * Uses force: true to bypass Playwright stability checks that hang due to WebGL canvas repainting
   */
  async toggleTheme(): Promise<void> {
    await this.themeToggle.click({ force: true });
    await this.page.waitForTimeout(200); // Allow theme transition
  }

  /**
   * Get current theme
   */
  async getCurrentTheme(): Promise<'light' | 'dark'> {
    const html = this.page.locator('html');
    const theme = await html.getAttribute('data-theme');
    return theme === 'light' ? 'light' : 'dark';
  }

  /**
   * Open sidebar on mobile
   */
  async openSidebar(): Promise<void> {
    await this.menuButton.click();
  }

  /**
   * Close sidebar on mobile/tablet
   * Uses Escape key as the most reliable method to avoid WebGL stability check delays
   */
  async closeSidebar(): Promise<void> {
    // Use Escape key directly - most reliable method that avoids WebGL stability check issues
    // Skip the isSidebarOpen() check which can also hang on Chrome with WebGL
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300); // Wait for drawer animation
  }

  /**
   * Check if sidebar is open
   */
  async isSidebarOpen(): Promise<boolean> {
    return this.sidebar.evaluate((el) => {
      // CSS modules hash class names: 'open' becomes 'open_abc123'
      // Check if any class contains 'open'
      return Array.from(el.classList).some(cls => cls.includes('open'));
    });
  }

  /**
   * Open context menu by right-clicking on an atom
   * @returns true if atom was found, false if fell back to center
   */
  async openContextMenu(): Promise<boolean> {
    const success = await this.canvas.rightClickOnAtom(0);
    await this.page.waitForTimeout(100); // Allow menu to appear
    return success;
  }

  /**
   * Close context menu
   */
  async closeContextMenu(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  /**
   * Check if context menu is visible
   */
  async isContextMenuVisible(): Promise<boolean> {
    return this.contextMenu.isVisible();
  }

  /**
   * Click a context menu action
   * Uses force: true to bypass Playwright stability checks that hang due to WebGL canvas repainting
   */
  async clickContextMenuAction(actionName: string): Promise<void> {
    await this.contextMenu.getByRole('button', { name: actionName }).click({ force: true });
  }

  /**
   * Open the Export panel if collapsed
   * Uses aria-expanded to check state (recommended for WebGL stability)
   */
  async openExportPanel(): Promise<void> {
    // Wait for Export section to appear (it only renders when molecule is loaded)
    // Use longer timeout to handle slow renders
    await this.exportPanel.waitFor({ state: 'visible', timeout: 15000 });

    const header = this.exportPanel.getByRole('button', { name: 'Export' });
    await header.waitFor({ state: 'visible', timeout: 5000 });
    const isExpanded = await header.getAttribute('aria-expanded');
    if (isExpanded !== 'true') {
      await header.click({ force: true });
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Open shortcuts help modal
   */
  async openShortcutsHelp(): Promise<void> {
    await this.toolbar.openShortcuts();
  }

  /**
   * Close shortcuts help modal
   */
  async closeShortcutsHelp(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  /**
   * Press a keyboard shortcut
   * Uses dispatchEvent to window (where the keyboard listener is attached)
   */
  async pressKey(key: string): Promise<void> {
    await this.page.evaluate((k) => {
      // Determine the correct key code
      const isDigit = /^\d$/.test(k);
      const code = isDigit ? `Digit${k}` : `Key${k.toUpperCase()}`;

      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: k,
        code: code,
        bubbles: true
      }));
    }, key);
    await this.page.waitForTimeout(100);  // Allow React state update
  }

  /**
   * Press modifier + key shortcut
   */
  async pressShortcut(
    modifiers: ('Control' | 'Shift' | 'Alt' | 'Meta')[],
    key: string
  ): Promise<void> {
    const combo = [...modifiers, key].join('+');
    await this.page.keyboard.press(combo);
  }

  /**
   * Check if molecule is loaded
   */
  async isMoleculeLoaded(): Promise<boolean> {
    const isEmpty = await this.canvas.isEmpty();
    const hasError = await this.canvas.hasError();
    return !isEmpty && !hasError;
  }

  /**
   * Wait for molecule to load
   */
  async waitForMoleculeLoaded(timeout = 30000): Promise<void> {
    await waitForMoleculeLoaded(this.page, timeout);
  }

  /**
   * Undo last action
   * Uses dispatchEvent to window (where the keyboard listener is attached)
   */
  async undo(): Promise<void> {
    await this.page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'z',
        code: 'KeyZ',
        ctrlKey: true,
        bubbles: true
      }));
    });
  }

  /**
   * Redo last undone action
   * Uses dispatchEvent to window (where the keyboard listener is attached)
   */
  async redo(): Promise<void> {
    await this.page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'y',
        code: 'KeyY',
        ctrlKey: true,
        bubbles: true
      }));
    });
  }

  /**
   * Take a full page screenshot
   */
  async screenshot(name?: string): Promise<Buffer> {
    return this.page.screenshot({ path: name ? `${name}.png` : undefined });
  }

  /**
   * Get all sample molecule button names
   */
  async getSampleMoleculeNames(): Promise<string[]> {
    return this.sampleButtons.allTextContents();
  }

  /**
   * Get the title text
   */
  async getTitleText(): Promise<string> {
    return (await this.title.textContent()) ?? '';
  }

  /**
   * Drag and drop a file onto the drop zone
   */
  async dragDropFile(filePath: string): Promise<void> {
    // Read file and create dataTransfer
    const dataTransfer = await this.page.evaluateHandle(async (path) => {
      const response = await fetch(path);
      const blob = await response.blob();
      const file = new File([blob], path.split('/').pop() || 'file', { type: blob.type });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      return dataTransfer;
    }, filePath);

    await this.dropZone.dispatchEvent('drop', { dataTransfer });
    await waitForMoleculeLoaded(this.page);
  }

  // ============================================
  // Multi-Structure Support
  // ============================================

  /**
   * Add a structure file (assumes Add mode is active or sets it)
   */
  async addStructure(filePath: string): Promise<void> {
    // Ensure we're in Add mode if mode toggle is visible
    if (await this.structureList.hasModeToggle()) {
      await this.structureList.setAddMode();
    }
    await this.fileInput.setInputFiles(filePath);
    await waitForMoleculeLoaded(this.page);
  }

  /**
   * Get the current structure count
   */
  async getStructureCount(): Promise<number> {
    return this.structureList.getStructureCount();
  }

  /**
   * Switch the active structure
   */
  async switchActiveStructure(name: string): Promise<void> {
    await this.structureList.selectStructure(name);
    await this.page.waitForTimeout(200);
  }

  // ============================================
  // Mobile Support
  // ============================================

  /**
   * Set viewport to mobile size
   */
  async setMobileViewport(): Promise<void> {
    await this.page.setViewportSize({ width: 375, height: 667 });
  }

  /**
   * Set viewport to tablet size
   */
  async setTabletViewport(): Promise<void> {
    await this.page.setViewportSize({ width: 768, height: 1024 });
  }

  /**
   * Set viewport to desktop size
   */
  async setDesktopViewport(): Promise<void> {
    await this.page.setViewportSize({ width: 1280, height: 720 });
  }

  /**
   * Check if hamburger menu is visible (mobile mode)
   */
  async isHamburgerMenuVisible(): Promise<boolean> {
    return this.menuButton.isVisible();
  }

  /**
   * Check if sidebar overlay is visible
   */
  async isSidebarOverlayVisible(): Promise<boolean> {
    return this.sidebarOverlay.isVisible();
  }

  /**
   * Close sidebar by clicking overlay
   * Must click on the exposed overlay area (RIGHT side, outside the 300px sidebar)
   * because the sidebar (z-index: 250) is above the overlay (z-index: 200).
   * Math: Mobile viewport is 375px, sidebar is 300px (max-width: 85vw ≈ 319px)
   * So x = 375 - 30 = 345, which is safely outside the sidebar area
   */
  async closeSidebarViaOverlay(): Promise<void> {
    const viewport = this.page.viewportSize();
    if (!viewport) throw new Error('No viewport set');

    // Click right side of viewport (outside 300px sidebar)
    await this.sidebarOverlay.click({
      position: { x: viewport.width - 30, y: viewport.height / 2 }
    });
    await this.page.waitForTimeout(300); // Wait for drawer animation
  }
}
