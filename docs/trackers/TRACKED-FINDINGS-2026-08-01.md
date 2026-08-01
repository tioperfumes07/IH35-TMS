# Tracked findings — 2026-08-01 (surfaced during the 425-C / RLS work, deliberately NOT bundled)

Each of these is real, prod-verified, and out of scope for the PR that found it. They are recorded
here so they are not lost and not silently folded into an unrelated change.

---

## 1. BILL-DISPLAY-ID-01 — all 16,236 bills have a NULL `display_id` (owner-gated)

**Severity:** real, live, affects money surfaces. **Not** a cosmetic issue.

`accounting.bills.display_id` is NULL on **16,236 of 16,236** rows on prod — every bill ever created.
This violates the server-generated-display-ID law, and it degrades every surface that reads it. The
symptom differs by how each caller handles the null, which is why it went unnoticed:

| Surface | Reads | Renders today | Status |
|---|---|---|---|
| `reports/form-425c/exhibits/exhibit-f-supporting-docs.ts` | `display_id` in a template literal | `"Bill null"` on every bill row of a **court exhibit** | **FIXED** — PR #3938 (reads `bill_number`) |
| `cash-advances/cash-advances.routes.ts:202` | `COALESCE(display_id, id::text)` | the **raw uuid** for every option in the Create-Cash-Advance bill picker — a user cannot tell two bills apart except by amount | **OPEN** |
| `accounting/transaction-register.routes.ts:103` | `COALESCE(NULLIF(b.bill_number,''), b.display_id, 'Bill')` | correct — falls back to `bill_number` first | already correct |

The transaction register proves the correct pattern already exists in this codebase; the other two
call sites simply did not follow it.

**The real field is `bill_number`** — the vendor's own external reference (e.g. `13401-5723`), which
is what a trustee, auditor or creditor matches against. Populated on **15,693 of 16,236** (96.7%).

**Scope of the block (owner-gated):** decide whether bills get a server-generated `display_id`
backfill (a migration over 16,236 rows = financial cluster), or whether `display_id` is formally
retired for bills in favour of `bill_number` and every reader is repointed. Either way the
cash-advance picker must stop surfacing a bare uuid.

**Evidence:** prod `br-fancy-credit-akjnd07a`, 2026-08-01 —
`count(*)=16236, count(display_id)=0, count(bill_number)=15693`.

**Landmine for whoever takes this:** `accounting.bills.vendor_id` is **TEXT holding QBO vendor ids**
(`"2115"`), not a uuid. Joining it to `mdata.vendors.id` fails with
`operator does not exist: uuid = text`. Vendor names resolve through `mdata.qbo_vendors` on
`qbo_id` + `operating_company_id` (180/180 on the June TRANSP sample).

---

## 2. FLT-02-SEED-DRIFT — `verify:local-ci` is permanently RED on `main`

**Severity:** process integrity. It is training everyone toward `--no-verify`.

`verify-real-owned-fleet-is-trk` (verify-step 1559) fails on a fresh migration-built database:
`12 units visible; 6 real unit(s) not owned by TRK`. Confirmed **byte-identical on `origin/main`
with no local changes**, so it is not any one branch's fault.

**Prod is clean:** 186 units visible (positive control `n_live_tup = 186`), and all **87** real
(non-sample) units are owned by **TRK**, nothing else. So FLT-02 holds in production — the 6
mis-owned units exist only in the seed data the migration chain produces.

**Why it matters more than the defect:** the guard's live check only runs when `DATABASE_URL` is
present, so GitHub CI is green while every local `verify:local-ci` is red. A gate that is always red
is a gate people learn to skip, and skipping the local gate is how "fix present, guard blind"
failures reach main.

**Fix direction:** make the migration-chain seed reproduce prod's ownership invariant (or mark those
6 seed units `is_sample_data = true`, which the guard already excludes).

---

## 3. GEOFENCE-WATCHER-DEAD — money-chain linkage, not just a dead worker

`verify-geofence-state-machine` requires `initializeGeofenceStateWatcher` in
`apps/backend/src/index.ts`. It is **absent (0 occurrences) on `main`** — the routes are registered,
the worker never starts.

**Why this is a linkage defect and not a dead worker:** with the watcher dead,
`load_stops.actual_arrival_at` / `actual_departure_at` may never auto-populate — and that is the
source the **revenue-recognition delivery event** derives from (blueprint §18, the two-event latch:
earn at delivered → DR Unbilled Revenue / CR Line-Haul Income). A dead arrival timestamp is an
un-triggered revenue event.

**Also note:** this guard has **no `scripts/verify-steps/NNNN-*.mjs` wrapper**, so CI never executes
it — it only surfaces in the local static fallback. Same class as finding 2: a real guard that no
workflow runs.

**Route:** dispatch/linkage wave. Not bundled.

---

## 4. Latent — the invoice path repeats the Exhibit F pattern

`exhibit-f-supporting-docs.ts` still builds the invoice label by interpolating `display_id`
(`Invoice ${row.display_id}`) and falls back to `?? row.id`. This is safe **today** only because
`accounting.invoices.display_id` has zero nulls. If that ever changes, invoices render `"Invoice
null"` exactly as bills did. Left unchanged deliberately (no live defect, and changing correct
behaviour to prove a point is its own risk) — recorded so the next reader knows it is load-bearing
on a data property, not on a guarantee.
