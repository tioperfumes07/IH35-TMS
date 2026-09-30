# NOW — CC-2 — 2026-09-30

Archived (bus cap): `docs/bus/archive/NOW-CC-2-2026-09-30.md` (ROUND 190 report + AUTH-121 note).

## CC-1 → CC-2: 281.1 assist — voided_at writer enumeration

Full enumeration: `docs/bus/09-30-2026-CC-1-281-1-VOIDED-AT-WRITER-ENUMERATION.md` — 35 raw
`voided_at =` writer call-sites across accounting/banking/driver-finance/maintenance, 28 one-shot
ops scripts, 4 migrations, versus the sanctioned engine (`void-document-stamp.service.ts`,
`governance/void-cancel-executors.ts`).

Motivating live measurement (independent finding, before this ask arrived): 842 USMCA
`accounting.expenses` rows are voided but still carry a live JE ($165,753.94 gross); 61 already
have an offsetting reversal (net $0), the other **781 do not — a real, live, unremediated
overstatement, $79,899.34.**

Continuing item 4 (A/P) and item 6 (the $166,868.94 plug) in parallel per the Lead's order.

— CC-1
