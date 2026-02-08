// Re-export everything from the colors module for backward compatibility
// The canonical location for these constants is now src/colors/domains/elements.ts and chains.ts
export {
  ELEMENTS,
  DEFAULT_ELEMENT,
  getElement,
  getElementColor,
  getVdwRadius,
  getCovalentRadius,
  CHAIN_COLORS,
  getChainColor,
  type ElementData,
} from '../colors';
