import { Page, Locator } from '@playwright/test';

/**
 * Page object for the Sequence Viewer component
 */
export class SequenceViewerPage {
  readonly page: Page;
  readonly container: Locator;

  // Structure selector (for multi-structure)
  readonly structureSelector: Locator;

  // Chain tabs
  readonly chainTabs: Locator;

  // Residue elements
  readonly residues: Locator;

  // Secondary structure bar
  readonly ssBar: Locator;
  readonly ssBlocks: Locator;

  // Residue numbers
  readonly residueNumbers: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[class*="sequenceViewer"]');

    // Structure selector for multi-structure support - use specific select element to avoid matching wrapper div
    this.structureSelector = this.container.locator('select[class*="structureSelect"]');

    // Chain tabs
    this.chainTabs = this.container.locator('[class*="chainTab"], button[data-chain]');

    // Residue elements - buttons with data-residue-key attribute
    this.residues = this.container.locator('[data-residue-key]');

    // Secondary structure bar
    this.ssBar = this.container.locator('[class*="ssBar"]');
    this.ssBlocks = this.ssBar.locator('[class*="ssBlock"]');

    // Residue numbers
    this.residueNumbers = this.container.locator('[class*="residueNumber"]');
  }

  /**
   * Check if sequence viewer is visible
   */
  async isVisible(): Promise<boolean> {
    return this.container.isVisible();
  }

  /**
   * Wait for sequence viewer to be visible
   */
  async waitForVisible(timeout = 5000): Promise<void> {
    await this.container.waitFor({ state: 'visible', timeout });
  }

  /**
   * Get all chain IDs from chain tabs
   */
  async getChainIds(): Promise<string[]> {
    const tabs = await this.chainTabs.all();
    const chainIds: string[] = [];
    for (const tab of tabs) {
      const text = await tab.textContent();
      if (text) chainIds.push(text.trim());
    }
    return chainIds;
  }

  /**
   * Check if chain tabs are displayed
   */
  async hasChainTabs(): Promise<boolean> {
    const count = await this.chainTabs.count();
    return count > 0;
  }

  /**
   * Click a chain tab by chain ID
   */
  async selectChain(chainId: string): Promise<void> {
    const tab = this.chainTabs.filter({ hasText: chainId });
    await tab.click();
  }

  /**
   * Check if a chain tab is active
   */
  async isChainActive(chainId: string): Promise<boolean> {
    const tab = this.chainTabs.filter({ hasText: chainId });
    const classes = await tab.getAttribute('class');
    return classes?.includes('active') || false;
  }

  /**
   * Get the active chain ID
   */
  async getActiveChainId(): Promise<string | null> {
    const activeTab = this.chainTabs.locator('[class*="active"], .active').first();
    if (await activeTab.isVisible().catch(() => false)) {
      return activeTab.textContent();
    }
    return null;
  }

  /**
   * Click a residue by chain ID and residue number
   */
  async clickResidue(chainId: string, resNumber: number): Promise<void> {
    const residue = this.container.locator(
      `[data-residue-key="${chainId}-${resNumber}"], [data-chain="${chainId}"][data-residue="${resNumber}"]`
    );
    await residue.click();
  }

  /**
   * Hover over a residue by chain ID and residue number
   */
  async hoverResidue(chainId: string, resNumber: number): Promise<void> {
    const residue = this.container.locator(
      `[data-residue-key="${chainId}-${resNumber}"], [data-chain="${chainId}"][data-residue="${resNumber}"]`
    );
    await residue.hover();
  }

  /**
   * Check if a residue is highlighted/selected
   */
  async isResidueHighlighted(chainId: string, resNumber: number): Promise<boolean> {
    const residue = this.container.locator(
      `[data-residue-key="${chainId}-${resNumber}"], [data-chain="${chainId}"][data-residue="${resNumber}"]`
    );
    const classes = await residue.getAttribute('class');
    return classes?.includes('highlight') || classes?.includes('selected') || classes?.includes('active') || false;
  }

  /**
   * Get the total residue count
   */
  async getResidueCount(): Promise<number> {
    return this.residues.count();
  }

  /**
   * Get residue one-letter codes
   * Uses evaluateAll to avoid actionability checks that hang with WebGL
   */
  async getResidueSequence(): Promise<string> {
    // Get only the residue code span, not the number spans
    return this.residues.evaluateAll(elements =>
      elements.map(el => {
        // Find the residueCode span specifically
        const codeSpan = el.querySelector('[class*="residueCode"]');
        return codeSpan ? (codeSpan.textContent || '').trim() : '';
      }).join('')
    );
  }

  /**
   * Check if secondary structure bar is visible
   */
  async hasSecondaryStructureBar(): Promise<boolean> {
    return this.ssBar.isVisible();
  }

  /**
   * Get secondary structure block types (helix, sheet, coil)
   * Blocks use inline backgroundColor, so we parse the title attribute which contains SS type
   * Uses evaluateAll to avoid actionability checks that hang with WebGL
   */
  async getSecondaryStructureTypes(): Promise<string[]> {
    return this.ssBlocks.evaluateAll(elements =>
      elements.map(el => {
        const title = el.getAttribute('title') || '';
        if (title.includes('helix')) return 'helix';
        if (title.includes('sheet')) return 'sheet';
        if (title.includes('coil')) return 'coil';
        return '';
      }).filter(t => t !== '')
    );
  }

  /**
   * Check if structure selector is visible (multi-structure mode)
   */
  async hasStructureSelector(): Promise<boolean> {
    return this.structureSelector.isVisible();
  }

  /**
   * Select a structure from the structure selector dropdown
   */
  async selectStructure(structureName: string): Promise<void> {
    await this.structureSelector.selectOption({ label: structureName });
  }

  /**
   * Get selected structure name
   */
  async getSelectedStructure(): Promise<string | null> {
    const select = this.structureSelector.locator('select');
    if (await select.isVisible().catch(() => false)) {
      return select.inputValue();
    }
    return null;
  }

  /**
   * Check if residue numbers are displayed
   */
  async hasResidueNumbers(): Promise<boolean> {
    const count = await this.residueNumbers.count();
    return count > 0;
  }

  /**
   * Get displayed residue number labels
   */
  async getResidueNumberLabels(): Promise<number[]> {
    const labels = await this.residueNumbers.all();
    const numbers: number[] = [];
    for (const label of labels) {
      const text = await label.textContent();
      if (text) {
        const num = parseInt(text.trim(), 10);
        if (!isNaN(num)) numbers.push(num);
      }
    }
    return numbers;
  }
}