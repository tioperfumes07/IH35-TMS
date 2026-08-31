# CURRENT GO — THIS SHIFT ONLY (amend in place · never spawn another THIS IS NOW)

Canonical handoff: `docs/lockdown/IH35-HANDOFF-2026-08-31/` (from `~/Downloads/IH35-HANDOFF-2026-08-31`).

**Urgent 6 = 119 of 128.** Nine remain: six empty `scripts/tieout/*.mjs` stubs + VEND-CERT-01 + BANK-ECON-04 + BANK-SURF-04. Repo-measured 2026-08-31.

**Only blocking Chrome item:** 016 = `$4,200` invoice → `$400` CM `unknown_pending_backup` → factor `$3,800`. Face stays **$95,075**. HOLD 016 is VOID. Zero live factoring advances until this exists.

**Deploy is Cursor-only and parallel.** Keep **5–10 min / 5–10 PRs** (faster than a 20-minute timer). No seat waits for healthz.

**Pull default:** `bash scripts/next-work-item.sh` if your assigned file is done. Two lanes: BLOCKING then FREE. Announcing blocked and stopping = defect.

| Seat | BLOCKING | FREE (no deploy) |
|------|----------|------------------|
| CC-1 | 016 in Chrome | `scripts/tieout/settlement-pdf-5753.mjs` |
| CC-2 | grade 016 cause; only CC-2 writes `prod_verified` | fill `scripts/tieout/faro-factoring-statement.mjs` (expect −$3,800 until 016; do not shrink expected) |
| CC-3 | stay off books | `vendors-ap-aging.mjs` then VEND-CERT-01 |
| Codex | stay off books | `bank-ledger-closing.mjs` then honest BANK-ECON-04 / BANK-SURF-04 (zero-diff rec — do not fake PASS) |
| Cascade | unique FINDING | `dispatch-delivered-revenue.mjs` |
| Cursor lead | merge · deploy · census · **no new product PRs this shift** | after seats are moving: `accounting-trial-balance.mjs` + users/safety board-honesty |

Never `complete:true` until that module’s tie-out passes at tolerance 0. Never TMS→QBO write-back. Skip #15546 #16895. Never recertify U14.
