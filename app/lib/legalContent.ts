// Shared shape for legal documents (Terms of Use, Privacy Policy) rendered
// by components/LegalDocumentModal.tsx.
export type LegalBlock = { type: 'text'; value: string } | { type: 'bullets'; items: string[] };

export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

export const text = (value: string): LegalBlock => ({ type: 'text', value });
export const bullets = (items: string[]): LegalBlock => ({ type: 'bullets', items });
