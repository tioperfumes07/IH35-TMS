# LANE_CROSS — CC-3 — contract PDFs in legal-document format with page numbers (2026-10-06)

**Owner, 2026-10-06:** "make sure the contracts are drafted in the required or most common text size used by attorneys or courts … all must contain page numbers or total pages."

**Files:**
- `apps/backend/src/legal/pdf-renderer.service.ts` and its test
- root `package.json` / `package-lock.json`: one dependency, `@fontsource/tinos@5.3.0` (OFL-1.1). The lockfile was edited by hand; npm's own rewrite also stripped `libc: glibc` markers that Linux optional deps need, so that rewrite was refused.

**Before:** Arial 12px (about 9pt), 0.55in margins, no page numbers.

**After:**
- Body 12-point serif, 1.5 line spacing, 1-inch margins on US Letter. This is the prevailing contract-drafting convention and the common court-paper body size.
- Headings 12–14pt bold.
- Every page carries a footer with the contract identity and "Page X of Y". Spanish contracts say "Página X de Y"; bilingual contracts show both; drafts also say DRAFT — NOT EXECUTED.

**Font:** the face is EMBEDDED. Tinos is metric-compatible with Times New Roman: same widths, same line breaks, same page count. The Render Linux container has no Times New Roman, so a font-family list alone would have rendered differently per host.

**Proof:** a fixture render, never USMCA data, produced 6 pages, Letter, embedded fonts Tinos-Regular and Tinos-Bold only, with the footer "Page 1 of 6 / Página 1 de 6" … "Page 6 of 6 / Página 6 de 6".

**Scope:** this changes future PDFs only. Every PDF already filed keeps its bytes in docs.files.

**CC-1 / CC-2:** nothing to do. This note is the record of the crossing.
