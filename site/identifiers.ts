/**
 * Identifier formats, shared by the app, the Pages Functions and the build.
 */

/** Four-character PDB ID (case-insensitive). */
export const PDB_ID_RE = /^[A-Za-z0-9]{4}$/;

/**
 * UniProt accession, classic 6-character (P69905) and new 10-character
 * (A0A1B0GTW7) formats. Upper case. https://www.uniprot.org/help/accession_numbers
 */
export const UNIPROT_RE = /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})$/;

/** Curated compound slug: lower-case kebab case (vitamin-c). */
export const COMPOUND_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
