import { Page, Locator, expect } from '@playwright/test';

/**
 * Page object for the Toolbar component
 */
export class ToolbarPage {
  readonly page: Page;
  readonly toolbar: Locator;

  // Representation buttons
  readonly ballAndStickButton: Locator;
  readonly stickButton: Locator;
  readonly spacefillButton: Locator;

  // Measurement buttons
  readonly distanceButton: Locator;
  readonly angleButton: Locator;

  // Undo/Redo buttons
  readonly undoButton: Locator;
  readonly redoButton: Locator;

  // View buttons
  readonly homeViewButton: Locator;
  readonly autoRotateButton: Locator;
  readonly exportButton: Locator;

  // Help
  readonly shortcutsButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.toolbar = page.locator('[class*="toolbar"]').first();

    // Representation buttons (by title) - use exact names with shortcuts to avoid matching ControlPanel buttons
    this.ballAndStickButton = page.getByRole('button', { name: 'Ball & Stick (1)' });
    this.stickButton = page.getByRole('button', { name: 'Stick (2)' });
    this.spacefillButton = page.getByRole('button', { name: 'Spacefill (3)' });

    // Measurement buttons
    this.distanceButton = page.getByRole('button', { name: /Distance/i });
    this.angleButton = page.getByRole('button', { name: /Angle/i });

    // Undo/Redo buttons
    this.undoButton = page.getByRole('button', { name: /Undo/i });
    this.redoButton = page.getByRole('button', { name: /Redo/i });

    // View buttons - use exact name with shortcut to avoid matching other Export buttons
    this.homeViewButton = page.getByRole('button', { name: /Reset View/i });
    this.autoRotateButton = page.getByRole('button', { name: /Auto Rotate/i });
    this.exportButton = page.getByRole('button', { name: 'Export (Ctrl+S)' });

    // Help
    this.shortcutsButton = page.getByRole('button', { name: /Shortcuts/i });
  }

  /**
   * Check if toolbar is visible
   */
  async isVisible(): Promise<boolean> {
    return this.toolbar.isVisible();
  }

  /**
   * Set representation to Ball & Stick
   */
  async setBallAndStick(): Promise<void> {
    await expect(this.ballAndStickButton).toBeEnabled({ timeout: 10000 });
    await this.ballAndStickButton.click({ force: true });
  }

  /**
   * Set representation to Stick
   */
  async setStick(): Promise<void> {
    await expect(this.stickButton).toBeEnabled({ timeout: 10000 });
    await this.stickButton.click({ force: true });
  }

  /**
   * Set representation to Spacefill
   */
  async setSpacefill(): Promise<void> {
    await expect(this.spacefillButton).toBeEnabled({ timeout: 10000 });
    await this.spacefillButton.click({ force: true });
  }

  /**
   * Toggle distance measurement mode
   */
  async toggleDistance(): Promise<void> {
    await expect(this.distanceButton).toBeEnabled({ timeout: 10000 });
    await this.distanceButton.click({ force: true });
  }

  /**
   * Toggle angle measurement mode
   */
  async toggleAngle(): Promise<void> {
    await expect(this.angleButton).toBeEnabled({ timeout: 10000 });
    await this.angleButton.click({ force: true });
  }

  /**
   * Click undo button
   */
  async undo(): Promise<void> {
    await this.undoButton.click({ force: true });
  }

  /**
   * Click redo button
   */
  async redo(): Promise<void> {
    await this.redoButton.click({ force: true });
  }

  /**
   * Reset view to home position
   */
  async homeView(): Promise<void> {
    // Skip toBeEnabled() check - it hangs due to WebGL canvas stability checks
    await this.homeViewButton.click({ force: true });
  }

  /**
   * Toggle auto-rotate
   */
  async toggleAutoRotate(): Promise<void> {
    await expect(this.autoRotateButton).toBeEnabled({ timeout: 10000 });
    await this.autoRotateButton.click({ force: true });
  }

  /**
   * Open export panel
   */
  async openExport(): Promise<void> {
    await expect(this.exportButton).toBeEnabled({ timeout: 10000 });
    await this.exportButton.click({ force: true });
  }

  /**
   * Open shortcuts help
   */
  async openShortcuts(): Promise<void> {
    await this.shortcutsButton.click({ force: true });
  }

  /**
   * Check if a representation is active
   */
  async isRepresentationActive(rep: 'ball-and-stick' | 'stick' | 'spacefill'): Promise<boolean> {
    const button = {
      'ball-and-stick': this.ballAndStickButton,
      'stick': this.stickButton,
      'spacefill': this.spacefillButton,
    }[rep];
    return (await button.getAttribute('aria-pressed')) === 'true';
  }

  /**
   * Check if measurement mode is active
   */
  async isMeasurementActive(mode: 'distance' | 'angle'): Promise<boolean> {
    const button = mode === 'distance' ? this.distanceButton : this.angleButton;
    return (await button.getAttribute('aria-pressed')) === 'true';
  }

  /**
   * Check if undo is available
   */
  async canUndo(): Promise<boolean> {
    return !(await this.undoButton.isDisabled());
  }

  /**
   * Check if redo is available
   */
  async canRedo(): Promise<boolean> {
    return !(await this.redoButton.isDisabled());
  }

  /**
   * Check if auto-rotate is active
   */
  async isAutoRotateActive(): Promise<boolean> {
    return (await this.autoRotateButton.getAttribute('aria-pressed')) === 'true';
  }
}
