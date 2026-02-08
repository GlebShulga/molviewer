# MolViewer

Interactive 3D molecular visualization built with React and Three.js.

## Features

### Visualization
- **Representations** - Ball & Stick, Stick, Spacefill, Cartoon, VDW Surface, SAS Surface
- **Color Schemes** - CPK, Chain, Residue Type, B-factor, Rainbow, Secondary Structure
- **Aromatic Rings** - Automatic detection and visualization

### Multi-Structure Support
- Load up to 10 structures simultaneously
- **Overlay** or **Side-by-Side** layout modes
- Per-structure visibility toggle and deletion
- Independent representation/color settings per structure

### Sequence Viewer
- Linear sequence with one-letter amino acid codes
- Secondary structure color bars (helix/sheet/coil)
- Bidirectional sync with 3D view (click residue ↔ highlight atom)
- Multi-chain support with chain selector tabs

### Measurements & Labels
- Distance, angle, and dihedral measurements
- Persistent 3D atom labels
- **Right-click context menu:**
  - Focus on atom
  - Measure From Here
  - Add Label
  - Select Residue
  - Select Chain

### User Experience
- **Undo/Redo** - Full history with 50-state limit (Ctrl+Z / Ctrl+Y)
- **Panel Persistence** - Collapsible panel states saved to localStorage
- **Themes** - Dark and light mode
- **Keyboard Shortcuts** - Quick access to common operations
- **Export** - High-resolution screenshots (1x, 2x, 4x) with customizable backgrounds
- **Auto-Rotate** - Toggle rotation for presentations
- **Camera Presets** - Quick view orientations

### File Support
- Drag & drop or browse for files
- **Formats:** PDB, CIF (mmCIF), SDF, MOL, XYZ
- **PDB ID Lookup** - Fetch directly from RCSB PDB (uses mmCIF format)
- **Sample Molecules** - Built-in caffeine, aspirin, and water

## Requirements

- Node.js >= 20
- pnpm (package manager)

## Quick Start

```bash
pnpm install
pnpm dev
```

Opens at http://localhost:5173

## Scripts

```bash
pnpm dev           # Start development server
pnpm build         # Build for production
pnpm preview       # Preview production build
pnpm typecheck     # Run TypeScript checks
pnpm lint          # Run ESLint
pnpm lint:fix      # Auto-fix linting issues
pnpm format        # Format code with Prettier
pnpm format:check  # Check formatting
pnpm test          # Run unit tests
pnpm test:coverage # Run tests with coverage
pnpm test:e2e      # Run Playwright e2e tests
```

## Project Structure

```
src/
├── components/
│   ├── ui/              # FileUpload, ControlPanel, Toolbar, SequenceViewer, ContextMenu, etc.
│   ├── viewer/          # MoleculeViewer, MeasurementOverlay, Labels3D
│   ├── representations/ # BallAndStick, Stick, Spacefill, Cartoon, Surface, AromaticRings
│   └── layout/          # Header, Sidebar, ViewerContainer
├── colors/              # Color scheme definitions
├── parsers/             # PDB, mmCIF, SDF, XYZ file parsers
├── constants/           # Element data (colors, radii for 30+ elements)
├── config/              # Rendering, export, UI, camera presets configuration
├── context/             # Theme context (dark/light mode)
├── hooks/               # Custom React hooks
├── utils/               # Bond inference, surface generation, measurements, export
├── store/               # Zustand state management with undo/redo
├── types/               # TypeScript interfaces
├── workers/             # Web workers for background tasks
└── styles/              # Global CSS
```

## Supported File Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| PDB | `.pdb` | Protein Data Bank format (with residue/chain support) |
| CIF | `.cif`, `.mmcif`, `.cif.gz` | PDBx/mmCIF format (preferred by RCSB, with secondary structure) |
| SDF | `.sdf`, `.mol` | Structure Data File |
| XYZ | `.xyz` | Cartesian coordinates |

## Representations

| Type | Description |
|------|-------------|
| Ball & Stick | Atoms as spheres connected by bond cylinders |
| Stick | Bonds only with larger radius for clarity |
| Spacefill | Van der Waals spheres showing molecular envelope |
| Cartoon | Protein secondary structure ribbons (helix, sheet, coil) |
| Surface (VDW) | Van der Waals molecular surface |
| Surface (SAS) | Solvent Accessible Surface (1.4Å probe radius) |

## Color Schemes

| Scheme | Description |
|--------|-------------|
| CPK | Element colors (carbon gray, oxygen red, nitrogen blue, etc.) |
| Chain | Distinct color per chain ID |
| Residue Type | Amino acid classification (hydrophobic, polar, charged, etc.) |
| B-factor | Temperature factor gradient (blue → red) |
| Rainbow | N→C terminus gradient |
| Secondary Structure | Helix (pink), Sheet (yellow), Coil (gray) |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Ball & Stick representation |
| `2` | Stick representation |
| `3` | Spacefill representation |
| `D` | Distance measurement mode |
| `A` | Angle measurement mode |
| `H` | Home view / Reset camera |
| `R` | Toggle auto-rotate |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Export screenshot |
| `Backspace` | Undo atom selection |
| `?` | Show shortcuts help |
| `Esc` | Cancel current operation |

## Tech Stack

- React 19
- Three.js / React Three Fiber / Drei
- Zustand + zundo (state management with undo/redo)
- Vite (build tool)
- TypeScript
- Vitest (unit testing)
- Playwright (e2e testing)

## License

MIT
