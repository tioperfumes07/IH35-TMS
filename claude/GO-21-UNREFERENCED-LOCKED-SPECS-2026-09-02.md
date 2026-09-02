# GO-21 — UNREFERENCED LOCKED SPECS · 2026-09-02

**FINDING:** `CLS-UNREFERENCED-LOCKED-SPECS`  
**Lane:** Cascade (unique FINDING). Cursor ran the grep on `origin/main` tip (do not re-derive).  
**Not a 246-document review.** Same failure mode as `GLOBAL-TYPE-SIZE-BASELINE.md`: a document that *is* locked, that no always-apply file names, so seats cannot see it.

## Method (verified)

Always-apply blob (concatenated):

- `.cursor/rules/00-IH35-LAW.mdc`
- `.cursor/rules/03-display-ids.mdc`
- `AGENTS.md` autoload banner
- `.windsurf/rules/00-IH35-LAW.md`
- `claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md`
- `docs/lockdown/PROJECT-INSTRUCTIONS-2026-09-02.md`

Universe: `docs/specs/*.md` = **253**. Named in that blob = **7**. Unreferenced by filename = **246**.

A hit is **self-declared lock** (this file *is* the lock), not a body mention of some other locked decision:

- filename contains `LOCKED`, or
- H1 contains locked, or
- first 12 non-empty lines carry `LOCKED 20xx` / `APPROVED BY JORGE` / `Locked UI Contract` / `do not modify without Jorge`

That filter yields **28** files. Loose whole-file `LOCKED|approved|Jorge` in the first 80 lines yielded **97** — too many false cites. Use 28.

## Same shape as the type-size miss (UI / every-screen)

These are the ones that will make seats invent again if left invisible:

| File | Why it matches |
|------|----------------|
| `docs/specs/QUALITY-STANDARD-LOCKED.md` | Filename + H1 LOCKED (Rule #0). **On-demand** in old AGENTS history, **not** in the GO-20 autoload banner. |
| `docs/specs/GLOBAL-SORT-RULE.md` | H1 “Locked UI Contract”. Status LOCKED 2026-06-07. Guard `scripts/verify-global-sort-rule.mjs` already exists. Twin of type-size (every column sortable). |
| `docs/specs/NAVIGATION-PATTERN-RULE.md` | H1 LOCKED. |
| `docs/specs/TIME-AND-TIMEZONE.md` | H1 “system-wide locked rule”. |
| `docs/specs/TBL-STANDARD-INVENTORY.md` | Not in the 28-regex (inventory, not titled LOCKED). It **is** the table-standard map and the **only** file that pointed at type-size before #19572. Unreferenced. |

## Other self-declared locks (on-demand money/ops — do not dump into always-apply)

ACCOUNTING-ARCHITECTURE.md · ACCT-DOM-01-JE-APPROVAL-SOD-DESIGN-2026-07-26.md · CASH-FORECAST-MANUAL.md · CASHFLOW-BLUEPRINT-ADDITION.md · CROSS-BORDER-DISPATCH.md · DISPATCH-GEOFENCE-TIMING-MODEL.md · DISPATCH-MODULE-SPEC.md · FACTORING-PACKET-AUTO-ASSEMBLY.md · INSURANCE-BLUEPRINT-ADDITION.md · INSURANCE-SAFETY-CONNECTION.md · LEGAL-FINANCE-OWNERSHIP-AND-FLIP-READINESS.md · LOAD-PROFITABILITY-AT-DELIVERY.md · PERMISSIONS-DESIGN.md · REQUIRED-DOCUMENT-TYPES.md · SIDEBAR-ARCH-UPDATE.md · TMS-QBO-PARALLEL-BOOKS.md · TMS-QBO-RECONCILIATION.md · catalogs-accounts-per-entity-DESIGN.md · plus a few design-HOLD / phase docs that matched the head regex (FH-2, GAP-EXPENSES phase notes, HOLD-REV-REC, master blueprint cite). Parallel books is **already inline** in `00-IH35-LAW.mdc` without the filename.

## Cascade NOW (one FINDING, not a sweep)

1. Confirm the 5 UI twins against `git grep` in the always-apply blob (already done here; re-check if main moved).
2. Propose **at most five** autoload *pointers* (one line each in AGENTS.md banner / `00-IH35-LAW.mdc`). Do **not** paste the documents. Do **not** restore the old always-apply diet.
3. Owner decides which of the five land. Default recommendation: `GLOBAL-SORT-RULE.md` (has a guard; same class as J1) + `QUALITY-STANDARD-LOCKED.md` as a pointer, not a second always-apply novel.
4. Do not implement J1, A2, money, or migrate 254 tables.

**Done for this FINDING** = owner-visible list (this file) + Cascade OUTBOX with the ≤5 pointer proposal. Wiring waits on Jorge.
