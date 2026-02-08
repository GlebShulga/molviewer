import { Page, Locator } from '@playwright/test';

type RepresentationType = 'ball-and-stick' | 'stick' | 'spacefill' | 'cartoon' | 'surface-vdw';
type ColorScheme = 'cpk' | 'chain' | 'residueType' | 'bfactor' | 'rainbow' | 'secondaryStructure';

/**
 * Page object for the ControlPanel component (sidebar controls)
 */
export class ControlPanelPage {
  readonly page: Page;
  readonly panel: Locator;

  // Representation buttons
  readonly representationSection: Locator;
  readonly ballAndStickButton: Locator;
  readonly stickButton: Locator;
  readonly spacefillButton: Locator;
  readonly cartoonButton: Locator;
  readonly surfaceButton: Locator;

  // Color scheme buttons
  readonly colorSchemeSection: Locator;
  readonly cpkButton: Locator;
  readonly chainButton: Locator;
  readonly residueTypeButton: Locator;
  readonly bfactorButton: Locator;
  readonly rainbowButton: Locator;
  readonly secondaryStructureButton: Locator;

  // Molecule info
  readonly moleculeInfo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.panel = page.locator('[class*="controlPanel"]');

    // Representation section
    this.representationSection = this.panel.locator('[class*="controlSection"]').filter({ hasText: 'Representation' });
    this.ballAndStickButton = this.representationSection.getByRole('button', { name: 'Ball & Stick' });
    this.stickButton = this.representationSection.getByRole('button', { name: 'Stick', exact: true });
    this.spacefillButton = this.representationSection.getByRole('button', { name: 'Spacefill' });
    this.cartoonButton = this.representationSection.getByRole('button', { name: 'Cartoon' });
    this.surfaceButton = this.representationSection.getByRole('button', { name: 'Surface' });

    // Color scheme section
    this.colorSchemeSection = this.panel.locator('[class*="controlSection"]').filter({ hasText: 'Color Scheme' });
    this.cpkButton = this.colorSchemeSection.getByRole('button', { name: 'CPK' });
    this.chainButton = this.colorSchemeSection.getByRole('button', { name: 'Chain' });
    this.residueTypeButton = this.colorSchemeSection.getByRole('button', { name: 'Residue' });
    this.bfactorButton = this.colorSchemeSection.getByRole('button', { name: 'B-factor' });
    this.rainbowButton = this.colorSchemeSection.getByRole('button', { name: 'Rainbow' });
    this.secondaryStructureButton = this.colorSchemeSection.getByRole('button', { name: 'Structure' });

    // Molecule info
    this.moleculeInfo = this.panel.locator('[class*="moleculeInfo"]');
  }

  /**
   * Check if control panel is visible
   */
  async isVisible(): Promise<boolean> {
    return this.panel.isVisible();
  }

  /**
   * Set representation
   */
  async setRepresentation(rep: RepresentationType): Promise<void> {
    const buttons: Record<RepresentationType, Locator> = {
      'ball-and-stick': this.ballAndStickButton,
      'stick': this.stickButton,
      'spacefill': this.spacefillButton,
      'cartoon': this.cartoonButton,
      'surface-vdw': this.surfaceButton,
    };
    await buttons[rep].click({ force: true });
  }

  /**
   * Set color scheme
   */
  async setColorScheme(scheme: ColorScheme): Promise<void> {
    const buttons: Record<ColorScheme, Locator> = {
      'cpk': this.cpkButton,
      'chain': this.chainButton,
      'residueType': this.residueTypeButton,
      'bfactor': this.bfactorButton,
      'rainbow': this.rainbowButton,
      'secondaryStructure': this.secondaryStructureButton,
    };
    await buttons[scheme].click({ force: true });
  }

  /**
   * Check if a representation button is active
   */
  async isRepresentationActive(rep: RepresentationType): Promise<boolean> {
    const buttons: Record<RepresentationType, Locator> = {
      'ball-and-stick': this.ballAndStickButton,
      'stick': this.stickButton,
      'spacefill': this.spacefillButton,
      'cartoon': this.cartoonButton,
      'surface-vdw': this.surfaceButton,
    };
    return (await buttons[rep].getAttribute('aria-pressed')) === 'true';
  }

  /**
   * Check if a color scheme button is active
   */
  async isColorSchemeActive(scheme: ColorScheme): Promise<boolean> {
    const buttons: Record<ColorScheme, Locator> = {
      'cpk': this.cpkButton,
      'chain': this.chainButton,
      'residueType': this.residueTypeButton,
      'bfactor': this.bfactorButton,
      'rainbow': this.rainbowButton,
      'secondaryStructure': this.secondaryStructureButton,
    };
    return (await buttons[scheme].getAttribute('aria-pressed')) === 'true';
  }

  /**
   * Check if a representation is available (not disabled)
   */
  async isRepresentationAvailable(rep: RepresentationType): Promise<boolean> {
    const buttons: Record<RepresentationType, Locator> = {
      'ball-and-stick': this.ballAndStickButton,
      'stick': this.stickButton,
      'spacefill': this.spacefillButton,
      'cartoon': this.cartoonButton,
      'surface-vdw': this.surfaceButton,
    };
    return !(await buttons[rep].isDisabled());
  }

  /**
   * Check if a color scheme is available (not disabled)
   */
  async isColorSchemeAvailable(scheme: ColorScheme): Promise<boolean> {
    const buttons: Record<ColorScheme, Locator> = {
      'cpk': this.cpkButton,
      'chain': this.chainButton,
      'residueType': this.residueTypeButton,
      'bfactor': this.bfactorButton,
      'rainbow': this.rainbowButton,
      'secondaryStructure': this.secondaryStructureButton,
    };
    return !(await buttons[scheme].isDisabled());
  }

  /**
   * Get molecule name from info section
   */
  async getMoleculeName(): Promise<string> {
    const nameElement = this.moleculeInfo.locator('p').filter({ hasText: 'Name:' });
    const text = await nameElement.textContent();
    return text?.replace('Name:', '').trim() ?? '';
  }

  /**
   * Get atom count from info section
   */
  async getAtomCount(): Promise<number> {
    const atomsElement = this.moleculeInfo.locator('p').filter({ hasText: 'Atoms:' });
    const text = await atomsElement.textContent();
    const count = text?.replace('Atoms:', '').trim();
    return parseInt(count ?? '0', 10);
  }

  /**
   * Get bond count from info section
   */
  async getBondCount(): Promise<number> {
    const bondsElement = this.moleculeInfo.locator('p').filter({ hasText: 'Bonds:' });
    const text = await bondsElement.textContent();
    const count = text?.replace('Bonds:', '').trim();
    return parseInt(count ?? '0', 10);
  }
}
