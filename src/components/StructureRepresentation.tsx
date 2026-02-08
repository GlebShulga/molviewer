import React from 'react';
import type { StructureRenderData } from '../store/selectors';
import { BallAndStick, Stick, Spacefill, Surface, Cartoon, ComponentRepresentation } from './representations';

export interface SurfaceSettingsType {
  type: 'vdw' | 'sas';
  opacity: number;
  color: string;
  wireframe: boolean;
  probeRadius: number;
  visible: boolean;
}

export interface StructureRepresentationProps {
  structureData: StructureRenderData;
  surfaceSettings: SurfaceSettingsType;
}

/**
 * Renders a single structure with its representation settings.
 * Supports both single-representation mode and smart defaults mode
 * (multiple component types for complex molecules).
 */
export const StructureRepresentation = React.memo(
  function StructureRepresentation({ structureData, surfaceSettings }: StructureRepresentationProps) {
    const { id: structureId, molecule, representation, colorScheme, classification, componentSettings } = structureData;

    // Surface-only mode: render just the surface without atoms
    // Check this FIRST before smart defaults mode
    const isSurfaceOnly = representation === 'surface-vdw' || representation === 'surface-sas';
    if (isSurfaceOnly) {
      const surfaceType = representation === 'surface-sas' ? 'sas' : 'vdw';
      return (
        <Surface
          molecule={molecule}
          type={surfaceType}
          opacity={1.0}
          colorScheme={colorScheme}
          probeRadius={surfaceSettings.probeRadius}
        />
      );
    }

    // Smart defaults mode: render each component separately for complex molecules
    if (classification?.hasMultipleTypes && componentSettings.length > 0) {
      return (
        <>
          {componentSettings.filter(c => c.visible).map(component => (
            <ComponentRepresentation
              key={`${structureId}-${component.type}`}
              molecule={molecule}
              atomIndices={component.atomIndices}
              residueFilter={component.residueFilter}
              representation={component.representation}
              colorScheme={component.colorScheme}
              structureId={structureId}
            />
          ))}
          {surfaceSettings.visible && (
            <Surface
              molecule={molecule}
              type={surfaceSettings.type}
              opacity={surfaceSettings.opacity}
              color={surfaceSettings.color}
              wireframe={surfaceSettings.wireframe}
              probeRadius={surfaceSettings.probeRadius}
            />
          )}
        </>
      );
    }

    // Single-representation mode (non-smart-defaults)
    return (
      <>
        {representation === 'ball-and-stick' && (
          <BallAndStick
            key={`${structureId}-${molecule.name}`}
            molecule={molecule}
            colorScheme={colorScheme}
            structureId={structureId}
          />
        )}
        {representation === 'stick' && (
          <Stick
            key={`${structureId}-${molecule.name}`}
            molecule={molecule}
            colorScheme={colorScheme}
            structureId={structureId}
          />
        )}
        {representation === 'spacefill' && (
          <Spacefill
            key={`${structureId}-${molecule.name}`}
            molecule={molecule}
            colorScheme={colorScheme}
            structureId={structureId}
          />
        )}
        {representation === 'cartoon' && (
          <Cartoon
            key={`${structureId}-${molecule.name}`}
            molecule={molecule}
            colorScheme={colorScheme}
            structureId={structureId}
          />
        )}
        {surfaceSettings.visible && (
          <Surface
            molecule={molecule}
            type={surfaceSettings.type}
            opacity={surfaceSettings.opacity}
            color={surfaceSettings.color}
            wireframe={surfaceSettings.wireframe}
            probeRadius={surfaceSettings.probeRadius}
          />
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison - check structureData reference and surfaceSettings values
    if (prevProps.structureData !== nextProps.structureData) return false;
    if (prevProps.surfaceSettings !== nextProps.surfaceSettings) {
      // Deep compare surfaceSettings (it's a small flat object)
      const prev = prevProps.surfaceSettings;
      const next = nextProps.surfaceSettings;
      return prev.type === next.type &&
             prev.opacity === next.opacity &&
             prev.color === next.color &&
             prev.wireframe === next.wireframe &&
             prev.probeRadius === next.probeRadius &&
             prev.visible === next.visible;
    }
    return true;
  }
);
