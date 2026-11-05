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
  readonly moleculeName: Locator;
  readonly atomCount: Locator;
  readonly bondCount: Locator;

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

    // Molecule info (the MoleculeMetadata panel, below the control panel)
    this.moleculeName = page.getByTestId('metadata-name');
    this.atomCount = page.getByTestId('metadata-atoms');
    this.bondCount = page.getByTestId('metadata-bonds');
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
   * Get molecule name from the Molecule Info section (MoleculeMetadata)
   */
  async getMoleculeName(): Promise<string> {
    return ((await this.moleculeName.textContent()) ?? '').trim();
  }

  /**
   * Get atom count from the Molecule Info section
   */
  async getAtomCount(): Promise<number> {
    const text = await this.atomCount.textContent();
    return parseInt((text ?? '0').replace(/\D/g, ''), 10);
  }

  /**
   * Get bond count from the Molecule Info section
   */
  async getBondCount(): Promise<number> {
    const text = await this.bondCount.textContent();
    return parseInt((text ?? '0').replace(/\D/g, ''), 10);
  }
}
