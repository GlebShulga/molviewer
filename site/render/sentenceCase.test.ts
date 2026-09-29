// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { toSentenceCase } from './sentenceCase';

describe('toSentenceCase', () => {
  it('converts real all-caps RCSB titles', () => {
    expect(toSentenceCase('CRYSTALLOGRAPHIC REFINEMENT AND STRUCTURE OF DNASE I AT 2 ANGSTROMS RESOLUTION')).toBe(
      'Crystallographic refinement and structure of DNase I at 2 Å resolution'
    );
    expect(toSentenceCase('THE CRYSTAL STRUCTURE OF HUMAN DEOXYHAEMOGLOBIN AT 1.74 ANGSTROMS RESOLUTION')).toBe(
      'The crystal structure of human deoxyhaemoglobin at 1.74 Å resolution'
    );
    expect(toSentenceCase('STRUCTURE OF UBIQUITIN REFINED AT 1.8 ANGSTROMS RESOLUTION')).toBe(
      'Structure of ubiquitin refined at 1.8 Å resolution'
    );
  });

  it('leaves mixed-case titles unchanged', () => {
    const t = 'Structure of the SARS-CoV-2 spike glycoprotein (closed state)';
    expect(toSentenceCase(t)).toBe(t);
    expect(toSentenceCase('The crystal structure of COVID-19 main protease in complex with an inhibitor N3')).toBe(
      'The crystal structure of COVID-19 main protease in complex with an inhibitor N3'
    );
  });

  it('keeps acronyms, digits and special spellings', () => {
    expect(toSentenceCase('SARS-COV-2 SPIKE IN COMPLEX WITH ACE2')).toBe('SARS-CoV-2 spike in complex with ACE2');
    expect(toSentenceCase('HIV-1 PROTEASE BOUND TO ATP AND NADPH')).toBe('HIV-1 protease bound to ATP and NADPH');
    expect(toSentenceCase('X-RAY STRUCTURE OF A ZN-BOUND DNA POLYMERASE')).toBe('X-ray structure of a ZN-bound DNA polymerase');
    expect(toSentenceCase('HUMAN IGG1 FAB FRAGMENT')).toBe('Human IgG1 FAB fragment');
  });

  it('keeps chain letters and roman numerals after identifier words', () => {
    expect(toSentenceCase('PHOTOSYSTEM II REACTION CENTER, CHAIN A')).toBe('Photosystem II reaction center, chain A');
    expect(toSentenceCase('CYTOCHROME C OXIDASE')).toBe('Cytochrome C oxidase');
  });

  it('keeps short parenthesised gene names and restarts sentences after full stops', () => {
    expect(toSentenceCase('POTASSIUM CHANNEL (KCSA) FROM STREPTOMYCES LIVIDANS')).toBe(
      'Potassium channel (KCSA) from streptomyces lividans'
    );
    expect(
      toSentenceCase('WATER STRUCTURE OF A HYDROPHOBIC PROTEIN AT ATOMIC RESOLUTION. PENTAGON RINGS OF WATER MOLECULES IN CRYSTALS OF CRAMBIN')
    ).toBe('Water structure of a hydrophobic protein at atomic resolution. Pentagon rings of water molecules in crystals of crambin');
  });

  it('collapses whitespace', () => {
    expect(toSentenceCase('  CRYSTAL   STRUCTURE  ')).toBe('Crystal structure');
  });
});
