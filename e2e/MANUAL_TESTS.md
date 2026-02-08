# Manual Testing Checklist

This document lists features that require manual testing on real devices because they cannot be reliably automated with Playwright.

## Touch Gestures (Mobile/Tablet)

These gestures work correctly for real users but cannot be programmatically simulated in automated tests.

### Pinch-to-Zoom
- [ ] **iOS Safari**: Two-finger pinch in/out zooms the 3D molecule view
- [ ] **Android Chrome**: Two-finger pinch in/out zooms the 3D molecule view
- [ ] **iPad Safari**: Two-finger pinch in/out zooms the 3D molecule view

**Expected behavior:** Molecule smoothly zooms in/out. Camera position updates. No errors in console.

### Two-Finger Rotation
- [ ] **iOS Safari**: Two-finger drag rotates the molecule in 3D
- [ ] **Android Chrome**: Two-finger drag rotates the molecule in 3D
- [ ] **iPad Safari**: Two-finger drag rotates the molecule in 3D

**Expected behavior:** Molecule rotates smoothly following finger movement. No jitter or lag.

### Single-Finger Pan (if implemented)
- [ ] **iOS Safari**: Single-finger drag pans the view
- [ ] **Android Chrome**: Single-finger drag pans the view

**Expected behavior:** View pans smoothly. Returns to center on double-tap (if implemented).

---

## Why These Tests Are Skipped in Automation

1. **Safari WebKit** restricts programmatic `TouchEvent` constructor usage for security
2. **Chrome mobile emulation** runs a desktop browser with simulated touch - complex multi-touch gestures don't translate reliably to WebGL canvas
3. **Three.js OrbitControls** expects native browser touch events, not simulated ones

## When to Run Manual Tests

- Before major releases
- After changes to:
  - `src/components/viewer/MoleculeViewer.tsx`
  - OrbitControls configuration
  - Touch event handlers
  - Camera/zoom logic

## Test Devices Recommended

- iPhone (any recent model with Safari)
- Android phone (Chrome)
- iPad (Safari)
- Android tablet (Chrome)
