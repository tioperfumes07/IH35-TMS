# IH35-TMS — VERIFIED FINANCIAL STATE OF RECORD (2026-08-01)

**This document is canonical and overrides any older doc, skill, tracker, code comment, or memory that
contradicts it.** Every fact below was verified read-only on the live Neon **prod** branch
`br-fancy-credit-akjnd07a` on 2026-08-01 (`SET app.bypass_rls='lucia'`, entity-scoped). **Prod wins.**
If a file says otherwise, the file is stale — fix the file, do not re-open the question.

Purpose: stop the same stale premises from resurfacing every session and forcing the owner to re-answer.

---

## FACT 1 — There is NO CPA. The owner (Jorge) is the sole financial authority.
Retire every `owner + CPA`, `CPA sign-off`, `CPA tie-out`, `pending CPA`, `with your accountant` gate in
every doc/skill. The financial approval authority is **the owner, alone.** Where a control historically read
"CPA sign-off gates X," it now reads "**owner** sign-off gates X." Do not ask who the CPA is.

## FACT 2 — Revenue-recognition posting is ON (live) for TRANSP and USMCA. It is NOT off.
`REVENUE_RECOGNITION_POST_ENABLED`:
- `lib.feature_flags` global `default_enabled = false` — **IRRELEVANT to the effective state.**
- `lib.feature_flag_overrides` (the layer that actually decides): **TRANSP `enabled=true`**, **USMCA
  `enabled=true`**, **TRK `enabled=false`** — all set **2026-07-26**.
- The poster passes `operating_company_id` to `isEnabled()`, and `resolveFlagEnabled()` returns the
  **per-entity override before** ever consulting the global default. So the effective flag is **ON for TRANSP
  and USMCA, OFF for TRK.**
- **RETIRE these stale claims wherever they appear:** "flag OFF / default OFF", "needs flipping",
  "build-and-hold / inert", "flipping without the account = runtime 500". All false vs prod.
- Reading `default_enabled=false` and concluding "OFF" is a **masked-scope error** — you MUST read
  `lib.feature_flag_overrides` per entity. This mistake has recurred; do not repeat it.

## FACT 3 — The Unbilled Revenue account EXISTS. Do not create or "seed" it.
`catalogs.accounts`, active + postable: **TRANSP `1240`**, **USMCA `1150`**. TRK has none, by design
(excluded). Retire "Unbilled Revenue does not exist on prod / seed it before flip." Creating another one is a
**duplicate-account defect** — do not.

## FACT 4 — The chart-of-accounts roles are bound and active. Resolution works.
`accounting.chart_of_accounts_roles`, active:
- TRANSP: `unbilled_revenue`→1240, `revenue_default`→4100 Freight Revenue, `ar_control`→QBO-45.
- USMCA: `unbilled_revenue`→1150, `revenue_default`→4000 Freight/Line-haul Income, `ar_control`→1100.
- TRK: `revenue_default`→42000-LEASE, `ar_control`→TRK-1100 (no unbilled; flag off).

`resolveRoleAccount()` resolves all three roles for TRANSP + USMCA. The latch migration
(`202609290000_disp_01_revrec_two_event_latch.sql`) is applied; the poster
(`accounting/revrec-delivery-posting/poster.service.ts`) is live.

*Note observed in the same read:* TRANSP `ar_control` also has a superseded inactive row (`1100`,
`is_active=false`) alongside the active `QBO-45`; TRK likewise has an inactive `1100`. Only the active rows
resolve, which is consistent with §7 (A/R = QBO-45).

## FACT 5 — The latch has posted, correctly, live.
Smoke test 2026-07-30, load **L-20260624-0083, $15,000**, both entries balanced:
- Earn JE `7d459959-8a92-43c6-8cf0-ae1eb9adb02d`: DR Unbilled Revenue 1240 / CR Freight Revenue 4100.
- Bill JE `020ad2e1-15dc-4d6f-84b6-75cc44a2cd2f`: DR A/R QBO-45 / CR Unbilled Revenue 1240.

`accounting.load_revenue_recognition_postings`: TRANSP = 2 rows (this test), USMCA = 0. No other organic
postings yet. Both JEs are `status='posted'` with `voided_at` NULL — i.e. **still live on the books.**

---

## OPEN DEFECT (this is a real live bug, not a stale premise)
The live latch triggers on **load STATUS, not on captured delivery evidence**, and is **under-wired**:
- `postLoadRevenueLatch` has exactly ONE caller: the office transition endpoint
  `dispatch/loads.routes.ts:1330`, which **never reads `mdata.load_stops`.**
- The driver arrive/depart handlers — the only code that captures `actual_departure_at` — **never call the
  latch.** The path that captures evidence doesn't recognize; the path that recognizes captures nothing.
- Consequence: TODAY a TRANSP/USMCA load advanced to `delivered_pending_docs` via the office endpoint would
  post an earn JE off `rate_total_cents` with **no delivery evidence.** Only near-zero volume through that
  path has kept it from firing organically.

**Evidence measured the same day:** all **20** `mdata.load_stops` rows carry **0** `actual_arrival_at` and
**0** `actual_departure_at`; the 10 delivery stops have **0** departures. The one live load at
`completed_docs_received` (L-20260624-0083 above) has both of its stops still `pending` — that is the $15,000
posting, made with no delivery evidence behind it.

**Scope note (verified, wider than first reported):** `mdata.loads.status` is written from **8** backend
files, and **3** can reach `delivered_pending_docs`+ on a status graph alone without reading a stop row —
`dispatch/loads.routes.ts`, `dispatch/loads-bulk.routes.ts` (BULK; references `load_stops` 0 times), and
`mdata/loads.routes.ts`. Only one of the eight calls the latch. This is why the evidence gate belongs in the
**poster**, not in a caller.

**Fix in progress (Claude Coder):** (1) poster refuses earn unless the final active delivery stop has
`actual_departure_at` (fail-closed, refuse-only) — the interim safety for a LIVE flag; (2) wire the latch to
fire from the driver capture path so it recognizes WITH evidence; (3) multi-drop fix (final active delivery
stop only). Flag remains ON per owner; the evidence-gate is the protection.

**Not addressed by the fix, owner decision:** the already-posted $15,000. Reversal is a prod financial write —
owner only. If the load genuinely delivered, the revenue is real and the correct remedy is capturing the
evidence as an attributed manual entry, not a reversal; if it did not, it needs reversal. The POD decides.

---

## Provenance
Read-only on Neon prod `br-fancy-credit-akjnd07a`, 2026-08-01, `app.bypass_rls='lucia'`. Tables:
`lib.feature_flags`, `lib.feature_flag_overrides`, `catalogs.accounts`,
`accounting.chart_of_accounts_roles`, `accounting.load_revenue_recognition_postings`,
`accounting.journal_entries`, `accounting.journal_entry_postings`, `mdata.loads`, `mdata.load_stops`.
Read completeness checked against `pg_stat_user_tables` (`lib.feature_flag_overrides` 213 visible ==
`n_live_tup` 213). Code verified on `origin/main`: `poster.service.ts`,
`lib/feature-flags/service.ts` (`resolveFlagEnabled():277-282` — tenant override returns before the global
default).
