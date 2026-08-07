FINDING: <!-- e.g. SAF-C01 / ACCT-F95 — REQUIRED labelled line -->
LANE: <!-- FINANCIAL | NON-FINANCIAL | DOCS — never HOLD / never owner-approval label -->

ROOT CAUSE: <!-- mechanism, not symptom — REQUIRED labelled line -->

FIX: <!-- root fix + files — REQUIRED labelled line -->

DOD-A: <!-- PASS | N/A -->
DOD-B: <!-- PASS | N/A -->
DOD-C: <!-- PASS | N/A -->
DOD-D: <!-- PASS | N/A -->
DOD-E: <!-- PASS | N/A -->
VERIFY-1: <!-- PASS | N/A -->
VERIFY-2: <!-- PASS | N/A -->
VERIFY-3: <!-- PASS | N/A -->
VERIFY-4: <!-- PASS | N/A -->
VERIFY-5: <!-- PASS | N/A -->
VERIFY-6: <!-- PASS | N/A -->
VERIFY-7: <!-- PASS | N/A -->
VERIFY-8: <!-- PASS | N/A -->
MODULE_PROGRESS: <!-- module N of M — must match docs/module-completion/*.json -->
ITEMS_TOUCHED: <!-- finding id -->
MIGRATE: <!-- N/A | filename -->

GUARD: <!-- scripts/verify-<name>.mjs + scripts/verify-steps/NNNN-verify-<name>.mjs -->
LIVE PROOF: <!-- node scripts/verify-<name>.mjs --selftest exit 0; … OR UNVERIFIED: <named blocker> -->
REMAINING: <!-- honest open work — never claim module done while N of M incomplete -->

---

## Spec / checklist (after the evidence block)

- [ ] **Rule 30** — body is FINDING-first Claude-green (`docs/templates/CLAUDE-GREEN-PR-BODY.md`); ran `node scripts/cursor-pr-body-gate.mjs --body-file …` before open/edit
- [ ] **Rule 29** — `node scripts/money-pr-local-gate.mjs` PASS before push; one commit on `origin/main` (no stack / no soft-reset)
- [ ] Worked `docs/specs/PER-PR-CHECKLIST.md`
- [ ] Architectural design + approved screens reviewed if UI
- [ ] No `+ New` / `+ Add` — only `+ Create` / `+ Book`
- [ ] Production never serves fake data

## Block ID
<!-- e.g. P3-T11.6.1 -->

## Tab additions / removals / renames
<!-- If any: module, tab, design updated in same commit -->

## Migration notes
<!-- If any: number, idempotent, never edit applied-on-prod -->
