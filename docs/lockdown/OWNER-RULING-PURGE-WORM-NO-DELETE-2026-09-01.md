# OWNER RULING — PURGE END STATE = VOID / DEACTIVATE / CANCEL · NO HARD DELETE · 2026-09-01

**Owner word (chat, relayed via CC-1 purge session):** CC-1 asked whether to pursue superuser hard DELETE for test rows. **Answered = closed.**

---

## The ruling (non-negotiable)

1. **Hard DELETE is forbidden** on financial and master-data tables — by design (WORM triggers on 51+ money tables; **no DELETE RLS policy** on `mdata.loads`, `mdata.drivers`, `mdata.vendors`, `mdata.customers`, `mdata.units`, `catalogs.accounts`). This is the same law as Rule 04 / Rule 07 — void and deactivate, never delete.

2. **Purge "done" means:**
   - **Money:** zero net GL impact (reversal JEs, void bills/expenses/settlements, cancel sample loads where API allows)
   - **Master data:** `deactivated_at` / `status` inactive / `cancelled` — rows may remain immutable
   - **Safety/compliance:** null `load_id` FK where event may be real; do not delete incident/fine/HOS/WO rows

3. **Do NOT request** neondb_owner superuser bypass or RLS-off DELETE for "cleanup." That is a **credentials escalation** the owner has **not** authorized and is **not** required for launch.

4. **CC-1 proceed now (no hold):**
   - Finish reversal/void/deactivate path for remaining bills, expenses, settlements, bank txns, entities
   - Unwind 10 entangled loads as far as cancel/null-FK allows
   - GL accounts: reverse-then-deactivate (UPDATE), not delete
   - Drivers/vendors/customers/units: deactivate per manifest (D1, SAM-85), not DELETE

5. **Acceptable end state:** every test fixture **financially zero**, **not presented as live** in app (inactive/deactivated/cancelled/voided). Rows physically present = **correct** under WORM.

---

## CC-1 already done (this session — keep going)

- 8 reversal JEs · zero-net scoped bills/expenses/settlements
- 13 untangled loads: child refs nulled; load row remains (DELETE 0 rows — expected)
- 33/43 loads had zero WORM-blocked dependents — proceed pattern for remainder where possible

**Script path:** `scripts/run-usmca-seat-junk-purge-once.mts --commit` (phases 4–6 JEs, sample load cancel, test policy cancel) — complements manual CC-1 unwind; both use void/cancel APIs, not DELETE.

---

## Supersedes

Any seat memo implying "purge = DELETE rows from prod." Purge = **remove contamination from live books and UI**, not erase history.
