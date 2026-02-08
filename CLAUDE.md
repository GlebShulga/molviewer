# Claude Code Instructions for MolViewer

## Package Manager
This project uses **pnpm** (not npm or yarn).

- Install dependencies: `pnpm install`
- Add a package: `pnpm add <package>`
- Add dev dependency: `pnpm add -D <package>`
- Run scripts: `pnpm run <script>` or `pnpm <script>`

## Project Overview
MolViewer is a molecular visualization application built with:
- React 19
- TypeScript
- Three.js / React Three Fiber
- Zustand (state management) + zundo (undo/redo)
- Vite (build tool)

## Key Directories
- `src/components/ui/` - UI components (SequenceViewer, ContextMenu, Toolbar, etc.)
- `src/components/viewer/` - 3D viewer components (Labels3D, etc.)
- `src/components/representations/` - Molecular representations
- `src/store/moleculeStore.ts` - Main Zustand store with temporal middleware
- `src/hooks/` - Custom React hooks

## Build Commands
- `pnpm dev` - Start development server
- `pnpm build` - Production build
- `pnpm preview` - Preview production build

## Performance Constraints
This is an **open-source project** with the following constraints:
- **No Web Workers**: Avoid suggesting Web Workers as they add complexity and bundle size for minimal benefit in this use case
- **Prefer simple, maintainable solutions** over complex optimizations
- Focus on algorithmic improvements (resolution, grid size) rather than architectural changes

## E2E Testing
- **Always use Playwright MCP** for e2e tests
- Run tests: `pnpm test:e2e`
- Tests located in `e2e/` directory

### WebGL Testing Best Practices

Playwright performs "actionability checks" before each action, including a stability check that waits for elements to maintain the same bounding box across animation frames. WebGL canvas constantly repaints at 60fps, causing these checks to hang.

**Key rules:**

1. **Use `force: true` for clicks near WebGL canvas**
   ```typescript
   // BAD - may hang on stability check
   await saveButton.click();

   // GOOD - bypasses stability check
   await saveButton.click({ force: true });
   ```

2. **Add `waitForTimeout()` after force clicks**
   ```typescript
   await button.click({ force: true });
   await page.waitForTimeout(300); // Allow React state to update
   ```

3. **Check `aria-pressed` for toggle buttons, not `isVisible()`**
   ```typescript
   // BAD - button is always visible, doesn't tell if it's active
   if (await replaceButton.isVisible()) { ... }

   // GOOD - checks actual toggle state
   if ((await replaceButton.getAttribute('aria-pressed')) !== 'true') {
     await replaceButton.click({ force: true });
   }
   ```

4. **DO NOT use `scrollIntoViewIfNeeded()`** - it hangs in headless mode with WebGL
   - `click()` already includes scroll functionality
   - See: https://github.com/microsoft/playwright/issues/18197

### Deprecated Playwright APIs

**NEVER use `networkidle` - it's deprecated.**

Use modern waiting strategies:

```typescript
// ❌ NEVER do this
await page.goto('/page', { waitUntil: 'networkidle' });

// ✅ Use these instead
await page.goto('/page', { waitUntil: 'domcontentloaded' });
await page.goto('/page', { waitUntil: 'load' });

// ✅ Or wait for specific conditions
await page.waitForSelector('[data-testid="content-loaded"]');
await page.waitForLoadState('domcontentloaded');
```

---

# MolViewer Improvement Plan

## Implementation Progress

### COMPLETED
| Priority | Feature | Status | Files Created/Modified |
|----------|---------|--------|------------------------|
| 1 | Sequence Viewer | DONE | `src/components/ui/SequenceViewer/` |
| 2a | Right-Click Context Menu | DONE | `src/components/ui/ContextMenu/` |
| 2b | Collapsible Panel Persistence | DONE | `CollapsibleSection.tsx` + 9 usages |
| 2c | Persistent 3D Labels | DONE | `src/components/viewer/Labels3D/` |
| 2d | Undo/Redo System | DONE | `moleculeStore.ts`, `Toolbar.tsx`, `useKeyboardShortcuts.ts` |
| 3 | Multi-Structure Support | DONE | `moleculeStore.ts`, `StructureList/`, `FileUpload.tsx` |

### REMAINING
| Priority | Feature | Status |
|----------|---------|--------|
| 2e | Touch/Mobile Improvements | Not started |
| 4 | Selection Language | Not started |

---

## Completed Features Detail

### 1. Sequence Viewer (Priority 1)
- Linear sequence display with one-letter amino acid codes
- Secondary structure color bars (helix=#ff69b4, sheet=#ffd700, coil=#808080)
- Bidirectional sync: click residue → highlight in 3D, click atom → scroll sequence
- Multi-chain support with chain selector tabs
- Legend showing SS color meanings

**Files:** `src/components/ui/SequenceViewer/`

### 2a. Right-Click Context Menu
- Actions: Focus, Measure From Here, Add Label, Select Residue, Select Chain
- Viewport boundary detection (menu stays within screen)
- ESC key and click-outside to close

**Files:** `src/components/ui/ContextMenu/`

### 2b. Collapsible Panel Persistence
- `storageKey` prop on `CollapsibleSection`
- State persists to localStorage with `mol3d-collapsed-` prefix
- Applied to all 9 CollapsibleSection usages

**Files:** `src/components/ui/CollapsibleSection.tsx`

### 2c. Persistent 3D Labels
- Labels appear above atoms using `@react-three/drei` Html
- Added via right-click context menu
- Deletable with × button

**Files:** `src/components/viewer/Labels3D/`

### 2d. Undo/Redo System
- Uses `zundo` package (Zustand temporal middleware)
- Keyboard: `Ctrl+Z` (undo), `Ctrl+Y` / `Ctrl+Shift+Z` (redo)
- Toolbar buttons with Undo2/Redo2 icons
- History limit: 50 states

**What's Tracked:**
- `representation` - Ball & Stick, Stick, Spacefill, etc.
- `colorScheme` - CPK, Chain, Residue Type, etc.
- `measurements` - Distance, Angle, Dihedral
- `labels` - 3D labels on atoms
- `surfaceSettings` - Surface opacity, type, visibility
- `componentSettings` - Per-component visibility

**What's NOT Tracked (transient):**
- `hoveredAtom`, `hoverPosition`
- `isLoading`, `error`
- `contextMenu`
- `selectedAtomIndices` (during measurement)

**Files:**
- `src/store/moleculeStore.ts` - temporal middleware, TemporalState, temporalStore export
- `src/components/ui/Toolbar.tsx` - Undo/Redo buttons
- `src/hooks/useKeyboardShortcuts.ts` - Ctrl+Z/Y shortcuts

### 3. Multi-Structure Support
- `Map<string, Structure>` store architecture with `activeStructureId`
- Add/Replace mode toggle in file upload (appears after first structure loaded)
- Structure list panel with visibility toggle and delete per structure
- Per-structure independent representation and color scheme settings
- Overlay vs Side-by-Side layout modes
- 10-structure limit (`MAX_STRUCTURES` constant)
- Full undo/redo integration for structure operations

**Files:**
- `src/store/moleculeStore.ts` - Structure map, actions for add/remove/visibility
- `src/components/ui/StructureList/` - Structure list panel with layout controls
- `src/components/ui/FileUpload.tsx` - Add/Replace mode toggle

---

## Remaining Features

### 2e. Touch/Mobile Improvements
- Test pinch-to-zoom in OrbitControls
- Test two-finger rotate
- Responsive sidebar (drawer on mobile < 768px)
- Larger touch targets
- Gesture hints overlay

### 4. Selection Language
Query-based atom/residue selection like PyMOL/Mol*:
```
chain A                    # All atoms in chain A
resname ALA                # All alanine residues
resid 10-20                # Residues 10-20
within 5 of resid 100      # Within 5Å of residue 100
protein                    # All protein atoms
backbone                   # CA, C, N, O atoms
```

**Files to Create:**
- `src/utils/selectionLanguage/parser.ts`
- `src/utils/selectionLanguage/evaluator.ts`
- `src/components/ui/SelectionInput.tsx`

---

## Current Capabilities

### What MolViewer Does Well
- Modern tech stack (React 19, Three.js, TypeScript)
- Multiple representations (Ball & Stick, Stick, Spacefill, Cartoon, Surfaces)
- Smart color schemes (CPK, Chain, Residue Type, B-factor, Rainbow, Secondary Structure)
- Measurement tools (Distance, Angle, Dihedral)
- Adaptive quality for performance
- Local storage persistence
- Dark/Light theme
- Keyboard shortcuts
- PDB ID lookup from RCSB
- Sequence Viewer with SS annotation
- Right-click context menu
- Persistent 3D labels
- Collapsible panel state persistence
- Undo/Redo system
- Multi-structure support (up to 10 structures, overlay/side-by-side layouts)