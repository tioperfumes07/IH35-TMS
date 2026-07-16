# 29 — HELP

**Verdict:** Frontend-only help center with real markdown articles + operator runbooks (no backend — tenant N/A per CLAUDE.md). Module Guides articles exist in manifest/files but are **invisible in the category grid** because `CATEGORY_ORDER` omits `"Module Guides"`. Dual entry (`/help` articles vs `/help/overview` tiles) is KEEP; fix discovery, don’t delete.

## Live evidence notes
**REPO-ONLY.**

- Sidebar: `help` → `/help` (`sidebar-config.ts:139`); flyout Help Center / Overview / Runbooks (`:242-247`).
- Routes: `/help` → `HelpCenterPage`; `/help/overview` → `HelpPage`; `/help/runbooks` → `RunbooksIndex`; `/help/:slug` → `HelpArticlePage` (`manifest.tsx:2801-2830`).
- Content: `helpCenterContent.ts` loads `docs/help/*.md` (20 files present).
- Runbooks: `runbooks-data.ts` → `docs/runbooks/*.md` via `import.meta.glob` (CLOSE-OF-MONTH etc. exist).

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar HELP | Nav | `/help` (article center) | HAVE |
| Flyout | Help Center | `/help` | HAVE |
| Flyout | Overview | `/help/overview` tile hub | HAVE |
| Flyout | Runbooks | `/help/runbooks` | HAVE |
| Overview tiles | Help articles / Runbooks | Links to `/help`, `/help/runbooks` | HAVE (`HelpPage.tsx:11-21`) |
| Help center | Search | Fuse.js over title/body | HAVE (`HelpCenterPage.tsx:18-19`) |
| Help center | Category columns | Getting Started … Account & Billing | HAVE |
| Help center | Module Guides category | In `HELP_MANIFEST` / `helpArticlesByCategory` but **not in `CATEGORY_ORDER`** | **WILL FAIL discovery** (`HelpCenterPage.tsx:6-13` vs `helpCenterContent.ts:10,34-42`) |
| Article links | `/help/:slug` | Renders markdown body | HAVE |
| Module guide MD files | module-maintenance, fuel, safety, drivers, catalogs, factoring, form-425c, driver-pwa | On disk under `docs/help/` | HAVE files / MISSING from UI grid |
| Runbooks index | Links open bundled `.md` URL | New tab; “(file not found)” if glob miss | HAVE |
| Runbooks count | 10 entries in `RUNBOOKS` | Including operational-tuning-catalog | HAVE |
| Backend Help API | — | None (frontend-only) | N/A |

## HAVE / MISSING / DRIFT / WILL FAIL

**HAVE:** Searchable articles; runbook index with real docs; overview hub; flyout; Module Guides content files ready.

**MISSING:** Module Guides in `CATEGORY_ORDER` UI; richer QBO/McLeod-style contextual help (? icons on money screens) — not in this module’s scope but gap vs market.

**DRIFT:** Sidebar lands on articles (`/help`) while Overview (`/help/overview`) is the tile chooser — naming “Help Center” vs “Overview” is confusing but both kept. Category type includes Module Guides; page order list does not.

**WILL FAIL**
1. **Operators cannot browse Module Guides** from Help Center grid — 8 articles only reachable via search/slug knowledge (`HelpCenterPage.tsx:6-13`).
2. **Broken runbook path** shows gray “(file not found)” — if `docPath` / glob mismatch (currently CLOSE-OF-MONTH + operational-tuning verified present).
3. **Assuming Help is tenant-scoped API** — there is none; fine today, but do not invent RLS claims.

## Professional recommendation
Add `"Module Guides"` to `CATEGORY_ORDER` (one-line fix) so scaffold guides ship. Keep Overview + Center + Runbooks doors. Expand article bodies with owner-approved ops truth (especially Form 425C virtual-bank exclusion, settlements Bill+BillPayment). Never delete Help or runbook routes. When backend Help is added later, add tenant-scope verify per CLAUDE.md note.

## Sources
- `apps/frontend/src/pages/help/HelpCenterPage.tsx`
- `apps/frontend/src/pages/help/HelpPage.tsx`
- `apps/frontend/src/pages/help/RunbooksIndex.tsx`
- `apps/frontend/src/pages/help/runbooks-data.ts`
- `apps/frontend/src/help/helpCenterContent.ts`
- `apps/frontend/src/components/layout/sidebar-config.ts` (L139, L242-247)
- `docs/help/*.md` (20 files)
- `docs/runbooks/*.md`
- `docs/CLAUDE.md` (Help frontend-only note)
