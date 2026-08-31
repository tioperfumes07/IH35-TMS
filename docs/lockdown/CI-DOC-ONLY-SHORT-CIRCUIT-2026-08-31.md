# CI DOC-ONLY SHORT-CIRCUIT (owner 2026-08-31 — suspend matrix burn)

**Why:** ~520 merges/day; ~43% doc-only (`docs/`, bus, `.block-ready/`, `.cursor/`) still ran the full 22-workflow matrix. That burn made merge-before-CI inevitable (#18571+).

**Safe pattern (NOT workflow-level `paths-ignore` on required checks):**
- `scripts/ci-detect-doc-only.mjs` classifies the PR diff.
- Heavy work moves to `*-heavy` jobs gated by `doc_only != true`.
- Thin aggregators keep the **exact required context names**:
  - `ci / build-typecheck`
  - `locked-guards / locked-guards`
  - `security-checks / security-audit`
- Doc-only → aggregator exits 0 in seconds. Code → heavy must be success.
- Push to `main` never short-circuits (full verify after merge).

**Also:** `closure-checks` PR trigger uses `paths-ignore` for docs (not a required context).

**Do not** put `paths-ignore` on required jobs — that leaves PRs stuck "Expected — waiting for status".

Canonical delivery: `docs/lockdown/GO-TO-CURSOR-2026-08-31.md` §3.
