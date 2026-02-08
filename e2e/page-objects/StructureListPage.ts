import { Page, Locator } from '@playwright/test';

/**
 * Page object for the Structure List component (multi-structure support)
 *
 * Note: The Add/Replace mode toggle is in FileUpload component but exposed here
 * for logical grouping with multi-structure features.
 */
export class StructureListPage {
  readonly page: Page;
  readonly container: Locator;

  // Mode toggle (Add/Replace) - Located in FileUpload component, not StructureList
  readonly modeToggle: Locator;
  readonly addModeButton: Locator;
  readonly replaceModeButton: Locator;

  // Structure list items
  readonly items: Locator;

  // Layout controls
  readonly layoutControls: Locator;
  readonly overlayButton: Locator;
  readonly sideBySideButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[class*="structureList"]');

    // Mode toggle buttons (in FileUpload component, not StructureList)
    this.modeToggle = page.locator('[class*="modeToggle"]');
    this.addModeButton = this.modeToggle.locator('button').filter({ hasText: /add/i });
    this.replaceModeButton = this.modeToggle.locator('button').filter({ hasText: /replace/i });

    // Structure list items - divs with role="button" in the items container
    // The structure items are div elements with role="button", not native buttons
    // Note: Using descendant selector (not >) because there may be wrapper divs
    this.items = this.container.locator('[class*="items"] div[role="button"]');

    // Layout controls
    this.layoutControls = page.locator('[class*="layoutControls"], [class*="layoutToggle"]');
    this.overlayButton = this.layoutControls.locator('button').filter({ hasText: /overlay/i });
    this.sideBySideButton = this.layoutControls.locator('button').filter({ hasText: /side/i });
  }

  /**
   * Check if structure list is visible
   */
  async isVisible(): Promise<boolean> {
    return this.container.isVisible();
  }

  /**
   * Get the number of loaded structures
   */
  async getStructureCount(): Promise<number> {
    // Try evaluateAll first - this doesn't have actionability checks
    try {
      return await this.items.evaluateAll(items => items.length);
    } catch {
      // Fallback to count()
      return await this.items.count();
    }
  }

  /**
   * Get all structure names
   */
  async getStructureNames(): Promise<string[]> {
    const items = await this.items.all();
    const names: string[] = [];
    for (const item of items) {
      // Look specifically for the name element (not the active indicator span)
      const nameLocator = item.locator('[class*="name"]').first();
      const text = await nameLocator.textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }

  /**
   * Click on a structure item to make it active
   * Uses dispatchEvent to bypass Playwright stability checks that hang due to WebGL canvas repainting
   */
  async selectStructure(name: string): Promise<void> {
    const item = this.items.filter({ hasText: name });

    // Check if item exists first using evaluateAll (no actionability checks)
    const count = await item.evaluateAll(items => items.length);
    if (count === 0) {
      throw new Error(`No structure found with name "${name}"`);
    }

    // Use dispatchEvent (no actionability checks, no scroll issues with WebGL)
    await item.first().dispatchEvent('click');
    await this.page.waitForTimeout(500); // Allow React/Three.js state to update
  }

  /**
   * Check if a structure is active
   */
  async isStructureActive(name: string): Promise<boolean> {
    const item = this.items.filter({ hasText: name });
    // Check for "active" class on the item
    const classes = await item.getAttribute('class');
    return classes?.includes('active') || false;
  }

  /**
   * Get the active structure name
   */
  async getActiveStructureName(): Promise<string | null> {
    // Find item with "active" in class name
    const items = await this.items.all();
    for (const item of items) {
      const classes = await item.getAttribute('class');
      if (classes?.includes('active')) {
        const nameLocator = item.locator('[class*="name"]').first();
        return nameLocator.textContent();
      }
    }
    return null;
  }

  /**
   * Toggle visibility of a structure
   */
  async toggleVisibility(name: string): Promise<void> {
    const item = this.items.filter({ hasText: name });
    // Buttons use title attribute: "Hide structure" or "Show structure"
    const visibilityButton = item.locator(
      'button[title="Hide structure"], button[title="Show structure"]'
    ).first();

    // Use dispatchEvent instead of click to avoid scroll/actionability issues
    await visibilityButton.dispatchEvent('click');
  }

  /**
   * Check if a structure is visible
   */
  async isStructureVisible(name: string): Promise<boolean> {
    const item = this.items.filter({ hasText: name });
    // Check button title - "Hide structure" means visible, "Show structure" means hidden
    const visibilityButton = item.locator(
      'button[title="Hide structure"], button[title="Show structure"]'
    ).first();

    const title = await visibilityButton.getAttribute('title');
    if (title === 'Hide structure') {
      return true; // Can hide = currently visible
    }
    if (title === 'Show structure') {
      return false; // Can show = currently hidden
    }

    // Fallback: check class for state
    const classes = await item.getAttribute('class');
    return !classes?.includes('hidden') && !classes?.includes('invisible');
  }

  /**
   * Delete a structure
   */
  async deleteStructure(name: string): Promise<void> {
    const item = this.items.filter({ hasText: name });
    // Button uses title attribute: "Remove structure"
    const deleteButton = item.locator('button[title="Remove structure"]').first();

    // Use dispatchEvent instead of click to avoid scroll/actionability issues
    await deleteButton.dispatchEvent('click');
  }

  /**
   * Check if mode toggle is visible
   */
  async hasModeToggle(): Promise<boolean> {
    return this.modeToggle.isVisible();
  }

  /**
   * Set loading mode to Add
   */
  async setAddMode(): Promise<void> {
    await this.addModeButton.dispatchEvent('click');
    await this.page.waitForTimeout(300);
  }

  /**
   * Set loading mode to Replace
   */
  async setReplaceMode(): Promise<void> {
    await this.replaceModeButton.dispatchEvent('click');
    await this.page.waitForTimeout(300);
  }

  /**
   * Check if Add mode is active
   */
  async isAddModeActive(): Promise<boolean> {
    const ariaPressed = await this.addModeButton.getAttribute('aria-pressed');
    if (ariaPressed !== null) {
      return ariaPressed === 'true';
    }
    const classes = await this.addModeButton.getAttribute('class');
    return classes?.includes('active') || false;
  }

  /**
   * Check if Replace mode is active
   */
  async isReplaceModeActive(): Promise<boolean> {
    const ariaPressed = await this.replaceModeButton.getAttribute('aria-pressed');
    if (ariaPressed !== null) {
      return ariaPressed === 'true';
    }
    const classes = await this.replaceModeButton.getAttribute('class');
    return classes?.includes('active') || false;
  }

  /**
   * Check if layout controls are visible
   */
  async hasLayoutControls(): Promise<boolean> {
    return this.layoutControls.isVisible();
  }

  /**
   * Set layout mode to Overlay
   */
  async setOverlayLayout(): Promise<void> {
    await this.overlayButton.click({ force: true });
  }

  /**
   * Set layout mode to Side-by-Side
   */
  async setSideBySideLayout(): Promise<void> {
    await this.sideBySideButton.click({ force: true });
  }

  /**
   * Check if Overlay layout is active
   */
  async isOverlayLayoutActive(): Promise<boolean> {
    const ariaPressed = await this.overlayButton.getAttribute('aria-pressed');
    if (ariaPressed !== null) {
      return ariaPressed === 'true';
    }
    const classes = await this.overlayButton.getAttribute('class');
    return classes?.includes('active') || false;
  }

  /**
   * Check if Side-by-Side layout is active
   */
  async isSideBySideLayoutActive(): Promise<boolean> {
    const ariaPressed = await this.sideBySideButton.getAttribute('aria-pressed');
    if (ariaPressed !== null) {
      return ariaPressed === 'true';
    }
    const classes = await this.sideBySideButton.getAttribute('class');
    return classes?.includes('active') || false;
  }

  /**
   * Wait for structure count to reach expected number
   */
  async waitForStructureCount(count: number, timeout = 10000): Promise<void> {
    await this.page.waitForFunction(
      ([selector, expectedCount]) => {
        const container = document.querySelector(selector);
        if (!container) return false;
        // Find the items container and count divs with role="button"
        // Note: Using descendant selector (not :scope >) because there may be wrapper divs
        const itemsContainer = container.querySelector('[class*="items"]');
        if (!itemsContainer) return expectedCount === 0;
        const items = itemsContainer.querySelectorAll('div[role="button"]');
        return items.length === expectedCount;
      },
      ['[class*="structureList"]', count] as const,
      { timeout }
    );
  }
}
