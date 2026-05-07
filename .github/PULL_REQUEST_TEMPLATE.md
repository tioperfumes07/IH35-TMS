# Pull Request

## Block ID
<!-- e.g. P3-T11.6.1 -->

## Mandatory spec-review checklist (REQUIRED — PR cannot merge if any are unchecked)

- [ ] I read `docs/specs/CURSOR-PERMANENT-RULES.md`
- [ ] I read the relevant section of `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md`
- [ ] I read all relevant entries in `docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md`
- [ ] I checked the relevant module entry in `docs/specs/IH35_ARCHITECTURAL_DESIGN.md`
- [ ] I reviewed the relevant approved screen PNG in `docs/approved-screens/`
- [ ] If I added/removed/renamed a sub-nav tab, I updated `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` in this same PR
- [ ] If I introduced a new spec decision from chat, I updated `docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` in this same PR
- [ ] All locked invariants enforced (RLS, security_invoker, audit, append-only, idempotent migrations, etc.)
- [ ] Display IDs server-generated only (no frontend composition)
- [ ] No `+ New` or `+ Add` button text — only `+ Create` or `+ Book`
- [ ] Production never serves fake data (env-gated fixtures)
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm run verify:arch-design` passes (CI gate confirms)
- [ ] All `db:verify:*` pass (only known pre-existing failures acceptable)

## Spec sources reviewed
<!-- List the specific sections / files / PNGs you read. Be precise: section numbers, file paths, PNG names. -->

## New deviations from spec
<!-- If none, write "None". If any, list with rationale and link to where it's tracked. -->

## Tab additions / removals / renames
<!-- If this PR changes any module's tab count or names, list:
     - Module name
     - Tab name added/removed/renamed
     - Updated count vs architectural design
     - Confirmation that IH35_ARCHITECTURAL_DESIGN.md was updated in this PR
-->

## Audit events added
<!-- List any new audit event types this PR introduces -->

## Migration notes
<!-- If this PR includes a migration:
     - Migration number + filename
     - Idempotent confirmation (DO + IF NOT EXISTS)
     - Backfill row counts (or "N/A — schema only")
-->

## Smoke test results
<!-- List the smoke tests run + outcome. If blocked locally, note why and confirm production traffic will validate. -->
