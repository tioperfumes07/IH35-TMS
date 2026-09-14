# ROUND 25.1 — CC-2 Findings Sweep: Factoring + The Guard Wall

Owner order 2026-09-14. Live, USMCA (`5c854333-6ea5-4faa-af31-67cb272fef80`), Neon
`tiny-field-89581227`/`br-fancy-credit-akjnd07a`, every query below re-run fresh at report time
(not copied from the owner's own cited figures — all matched exactly, no discrepancy this round).
Findings 1-4 cover Factoring; the Guard Wall section covers the bypass-CTE trap audit across
`scripts/verify-steps/` and `scripts/verify-static.mjs`. **Report first, per the owner's own "how to
work this" instruction — only two changes in this PR are actual code fixes** (both explicitly
unambiguous/non-monetary): the `scan-duplicate-vendors` `LIMIT 25→100` (Finding 2) and the
`LEGACY_BROAD_BASELINE` 55→6 ratchet tightening (Guard Wall, Stale Baselines). Everything else —
including the P0 vendor-merge dead path, the 6 CTE-trap guards, the 39 bare-no-txn guards, and the
stuck `git am` — is reported only, per "anything touching a dollar, a GL posting, or a vendor merge
stops and reports," plus this seat's own module-lane boundary for the guards outside Factoring.

## Starting numbers — re-verified, exact match to owner's figures

| # | Metric | Value |
|---|---|---|
| F1 | live invoices (`status<>'void'`) | 73 |
| F2 | invoices with no `source_load_id` | 0 |
| F3 | `factor.faro_invoice_lines` (not superseded), and % with `load_id` | 34 / 34 (100%) |
| F4 | USMCA vendors (`mdata.vendors`) | 618 |
| F5 | of those, carrying a `qbo_vendor_id` | 0 |
| F6 | of those, ever merged (`merge_target_id` set) | 0 |
| F7 | open invoice disputes | 5 |

Query used for F1/F2/F4/F5/F6:
```sql
WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
SELECT
  (SELECT count(*) FROM accounting.invoices WHERE (SELECT v FROM b)='lucia' AND operating_company_id=$1 AND status<>'void') AS f1,
  (SELECT count(*) FROM accounting.invoices WHERE (SELECT v FROM b)='lucia' AND operating_company_id=$1 AND status<>'void' AND source_load_id IS NULL) AS f2,
  (SELECT count(*) FROM mdata.vendors WHERE (SELECT v FROM b)='lucia' AND operating_company_id=$1) AS f4,
  (SELECT count(*) FROM mdata.vendors WHERE (SELECT v FROM b)='lucia' AND operating_company_id=$1 AND qbo_vendor_id IS NOT NULL) AS f5,
  (SELECT count(*) FROM mdata.vendors WHERE (SELECT v FROM b)='lucia' AND operating_company_id=$1 AND merge_target_id IS NOT NULL) AS f6;
```

---

## FINDING 1 (P0) — Driver Vendor Merges is structurally 100% dead for USMCA — both the banner's deep-link AND its own honest fallback

**Severity:** P0 — the control is not degraded, it is **impossible to ever succeed**, for every one
of 618 vendors, permanently, by construction.

**Correction to my own first pass on this finding, disclosed rather than silently fixed:** I
initially read `DuplicateVendorsBanner.tsx` from a stale checkout (the primary working directory,
shared with other concurrent agent sessions — a known landmine in this repo) and reported the
owner's cited `Boolean(p.from_qbo_vendor_id && p.to_qbo_vendor_id)` gate as not existing. Re-read
directly from `origin/main` in a fresh worktree: **the owner's citation is exactly correct** —
`DuplicateVendorsBanner.tsx:135` reads `const canDeepLinkMerge = Boolean(p.from_qbo_vendor_id && p.to_qbo_vendor_id);`.
That gate is **already the fixed, honest version** of an earlier bug — its own comment (lines
127-134) documents that an EARLIER version deep-linked the wrong id (the TMS internal UUID) into
the merge form and 404'd every time; a same-day fix (dated 2026-09-08, six days before this round,
not something this round introduced) switched it to require `qbo_vendor_id` specifically and, when
absent, shows an honest fallback instead of a broken link:
`"not yet synced to QBO — merge from Driver Vendor Merges manually"` (line 160). **This is the
exact text visible in this session's own earlier live Chrome screenshots of the Factoring page** —
confirming the banner itself is not silently lying; it is correctly telling the truth about its own
deep-link.

**The real, still-open defect is one level past that honest fallback: the "merge from Driver
Vendor Merges manually" destination it points to is ALSO 100% dead for USMCA, for the identical
underlying reason.** The banner correctly refuses to promise something it can't deliver
automatically — but the manual path it recommends instead can't deliver it either. Confirmed by
reading the ACTUAL submit handler, not inferred:

- `apps/backend/src/data-infra/data-infra.service.ts:12-25` — `ensureQboVendorExists()` checks
  `qbo_archive.entities_snapshot WHERE qbo_entity_type='Vendor' AND qbo_entity_id=$2`. Live count
  for USMCA: **0 rows** (query below).
- `apps/backend/src/data-infra/data-infra.service.ts:27-45` — `createDriverVendorMerge()` calls
  `ensureQboVendorExists()` on BOTH the from- and to-vendor id as the very FIRST thing it does,
  before touching anything else. Since the snapshot table has 0 USMCA vendor rows, this check
  **always returns false**, and the function **always throws** `qbo_vendor_from_not_found` — a
  hard submission-time failure, not a display bug. No USMCA merge has ever been attempted that
  could have succeeded; F6=0 is not "nobody has gotten to it yet," it is "nobody ever could have."
- `apps/backend/src/data-infra/data-infra.service.ts:59-70` — the merge table itself,
  `mdata.driver_vendor_merges`, is keyed
  `(operating_company_id, driver_id, from_qbo_vendor_id, to_qbo_vendor_id)` — text QBO ids, not
  FKs to `mdata.vendors`.
- `apps/backend/src/data-infra/data-infra.service.ts:161-164` — `listDriverVendorMerges()`
  resolves a merge row's real vendor identity via
  `LEFT JOIN mdata.vendors fromv ON fromv.qbo_vendor_id = m.from_qbo_vendor_id` — for any row that
  DID somehow get created (impossible today, but hypothetically), this join could never resolve
  for a USMCA vendor either, since `qbo_vendor_id` is NULL on all 618.
- `apps/frontend/src/pages/factoring/FactoringHome.tsx:3076` — the manual form's own section title
  reads **"Merge duplicate QBO vendors for a driver"**; its two free-text inputs (lines 3095, 3104)
  carry placeholders **"from qbo vendor id"** / **"to qbo vendor id"** — asking the office user to
  type a QBO vendor id that does not exist for any USMCA vendor, with no way to discover one,
  because none was ever created. The submit handler (line ~3128) DOES fail gracefully — wrapped in
  try/catch, surfaces a "Vendor merge failed" toast via `userFacingApiError` rather than crashing —
  so this is not a broken-UI defect, it is a control that always, silently (from the office user's
  perspective — no indication ahead of time that it cannot possibly work for this entity), fails on
  submit, every time, for every vendor, forever.

**Root cause:** the entire Driver Vendor Merges feature was built for the QBO-synced entities
(TRANSP/TRK, where the QBO clone lives) and reuses QBO vendor ids as the merge key everywhere —
`qbo_archive.entities_snapshot` existence check, the merge table's own primary/conflict key, and
the resolve-back-to-a-real-vendor join. USMCA is `source='tms'`, deliberately has no QBO clone
(per this repo's own parallel-books law), so it can never populate a single one of those QBO-keyed
touchpoints. This is not a bug introduced recently — it has always been true since USMCA's vendor
table was seeded; F6=0 across all 618 vendors, forever, confirms it was never possible even once.

**Live proof:**
```sql
-- ensureQboVendorExists' own source table, scoped to USMCA vendors:
WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
SELECT count(*) AS n FROM qbo_archive.entities_snapshot
 WHERE (SELECT v FROM b)='lucia' AND operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
   AND qbo_entity_type='Vendor';
-- n = 0
```

**Proposed fix (owner ruling required — this is a merge-mechanism redesign, not a one-line
patch):**

Two real options, not a false binary:

1. **Key the merge surface on the internal TMS `mdata.vendors.id` instead of `qbo_vendor_id`.**
   `mdata.driver_vendor_merges` would need `from_vendor_id uuid REFERENCES mdata.vendors(id)` /
   `to_vendor_id uuid REFERENCES mdata.vendors(id)` columns (additive, alongside the existing
   `from_qbo_vendor_id`/`to_qbo_vendor_id` — never delete a column, per this repo's own law),
   `ensureQboVendorExists` replaced with a same-company `mdata.vendors` existence check, and the
   uniqueness/conflict key and the resolve-join both switch to the new FK columns. The banner's own
   `canDeepLinkMerge` gate (already correctly structured to fall back honestly, see above) would
   then key off `from_vendor_id`/`to_vendor_id` (which it ALREADY has for every pair, unconditionally
   — the scan never omits them) instead of `from_qbo_vendor_id`/`to_qbo_vendor_id`, so the
   "not yet synced to QBO" fallback disappears for every pair once this lands — it becomes correctly
   unreachable, not deleted. TRANSP/TRK (QBO-synced) keep working exactly as today since a vendor
   with a `qbo_vendor_id` still has one; nothing about their path changes.
2. **Leave the merge surface QBO-id-only, and explicitly disable/hide it for a non-QBO-synced
   entity** (a `source='tms'`-scoped early return with a clear "not available for this entity — no
   QBO vendor sync" message, instead of a silent/opaque `qbo_vendor_from_not_found` error after
   the user fills out the whole form). This is the smaller, non-migration change, but it does not
   solve the owner's actual problem — the banner would need to stop advertising a merge action
   USMCA can never take, or be permanently dead weight on the owner's screen either way.

This seat's own read: option 1 is the only one that makes the banner's "Merge these" link (which
the owner has been staring at for who knows how long) actually do something. Option 2 just makes
the existing honest fallback message permanent/unconditional instead of solving the underlying
need — 58 real duplicate-name pairs (see Finding 2 below) still sit unmerged with no path to merge
them. **Recommending option 1, pending your ruling — no merge performed, no migration authored
(CC-2 cannot author migrations regardless), no code changed on this finding without your
decision.**

---

## FINDING 2 (P1) — `scan-duplicate-vendors` silently truncates at 25, real count is 60

**The pairs** (from the live `scan-duplicate-vendors` output the banner itself already reads — not
re-derived, this IS its data source). **Second finding surfaced by running this without the
route's own `LIMIT 25`: the true count is 60, not 25** —
`apps/backend/src/factoring/scan-duplicate-vendors.routes.ts:57` hard-caps the query at 25 rows
with no "and N more" indicator anywhere in `DuplicateVendorsBanner.tsx` or the vendor-merges tab,
so the banner's own header text ("Duplicate factoring vendors detected (25 pairs)") has been
under-reporting by 58% (35 of 60 real similarity-matched pairs are silently hidden) since the day
this shipped. **P1** — not a dead control like Finding 1, but a control presenting incomplete data
as complete, the adjacent failure mode to what this round is hunting. Two pairs in the full 60 are
false positives worth noting separately (not a code defect, a fuzzy-match precision note): the two
`DEVIN-AUDIT-*-RENAMED` test/audit-artifact vendor names, and `Quickbooks Payments` vs
`Quickbooks Payroll` (similar names, genuinely different vendors) — 58 of 60 are real duplicate
candidates.

| # | From | To | Similarity |
|---|---|---|---|
| 1 | NEFTALI URBANO CORONADO | Neftali Coronado Urbano | 1.000 |
| 2 | Emmanuel Cirilo Xoxocotla Malerva | Emanuel Cirilo Xoxocotla Malerva | 0.914 |
| 3 | Laredo Bridge System-1 | Laredo Bridge System | 0.913 |
| 4 | Bandal Tires Service LLC | Bandal tires service | 0.840 |
| 5 | PEDRO ABRAHAM LOPEZ COLLADO | Pedro Abraham Lopez Collardo | 0.839 |
| 6 | Roberto Jesus De La Pena Sanchez | Roberto Jesus de la Peña Sanchez | 0.833 |
| 7 | Jorge Abrham Aguirre Trejo | Jorge Abraham Aguirre Trejo | 0.828 |
| 8 | Jorge Graciano Martinez | Jorge Graciano Martinez Garza | 0.828 |
| 9 | JESUS ARMANDO MORALES | JESUS ARMANDO MORALES LEAL | 0.815 |
| 10 | Carlos Mauricio Carvallo | Carlos Mauricio Pena Carvallo | 0.815 |
| 11 | Francisco Isai Ovalle Garcia | Fransisco Isai Ovalle Garcia | 0.813 |
| 12 | Juan Carlos Miranda | JUAN CARLOS MIRANDA PAEZ | 0.800 |
| 13 | Faustino Guevera Martinez | Faustino Guevara Martinez | 0.786 |
| 14 | Premco - Solo Trucking Insurance | SOLO-TRUCKING INSURANCE | 0.774 |
| 15 | EDUARDO AZAEL FLORES ORTIZ | Eduardo Azalea Flores Ortiz | 0.774 |
| 16 | Juan Jorge Castor Castañeda | Juan Jorge Castor Castaneda | 0.769 |
| 17 | Leonel Antonio Morales Noguez | Leonel Antonio Morales | 0.767 |
| 18 | ALFREDO CAZARES | JOSE ALFREDO CAZARES | 0.762 |
| 19 | Jose Alfredo Cazares Meneses | JOSE ALFREDO CAZARES | 0.750 |
| 20 | Angel Alfonso Sosa Perez | ANGEL ALFONSO SOSA | 0.750 |
| 21 | Jose Luis Olvera Davila | Jorge Luis Olvera davila | 0.750 |
| 22 | South Texas Truck Centers | South Tx Truck Centers | 0.741 |
| 23 | Jose Modesto Vazquez Hernandez | JOSE VAZQUEZ HERNANDEZ | 0.733 |
| 24 | Gabriel Ramirez Cazarez | Gabriel Cazarez | 0.727 |
| 25 | HUMBERTO MARTINEZ | HUMBERTO MARTINEZ FRANCO | 0.720 |
| 26 | JOSE ANTONIO VICENTE | JOSE ANTONIO VICENTE MARTINEZ | 0.700 |
| 27 | Ruben Pedro Perez | RUBEN PEDRO PEREZ GARCIA | 0.696 |
| 28 | Little Diamond Trailer & Repair | Diamond Trailer Repair, Inc | 0.676 |
| 29 | UNITED CARRIER REGISTRATION | Unified Carrier Registration Plan | 0.676 |
| 30 | DEVIN-AUDIT-GO1913-20260826-RENAMED | DEVIN-AUDIT-VENDOR-20260826-RENAMED | 0.674 *(test artifact, not a real vendor)* |
| 31 | Jorge Munoz | Jorge Pablo Munoz | 0.667 |
| 32 | LUIS ARMANDO SOSA PEREZ | Luis Armando Sandoval Perez | 0.667 |
| 33 | Ignacio Munoz | Ignacio Munoz Miranda | 0.667 |
| 34 | JESUS ARMANDO MORALES | Jesus Armando Moreno Mora | 0.667 |
| 35 | Juan Emilio Hilario | JUAN EMILIO HILARIO RODRIGUEZ | 0.655 |
| 36 | RICARDO RODRIGUEZ TALAVERA | RICARDO RODRIGUEZ | 0.654 |
| 37 | Jose Rafael Dominguez Diaz | Rafael Dominguez | 0.654 |
| 38 | Ten Star Truck Wash Inc | TEN STAR TRUCKWASH | 0.640 |
| 39 | Loves-Xt296-Laredo | Loves-Xt683-Laredo | 0.636 |
| 40 | Gerardo Urbina Villalba | GERARDO URBINA | 0.625 |
| 41 | IH 35 Transportation LLC | Ih35 Transportation,Llc-Customer | 0.611 |
| 42 | M & S Truck Parts & Service | Suarez Truck Parts & Service Llc | 0.606 |
| 43 | Hugo Gaytan Sarabia | HUGO GAYTAN | 0.600 |
| 44 | ROSA MARGARITA CAMACHO MARROQUIN | Margarita Camacho | 0.600 |
| 45 | Adrian Castillo Hernandez | Tomas Castillo Hernandez | 0.594 |
| 46 | Moises Ordaz | Moises Ordaz Escobedo | 0.591 |
| 47 | TA TRUCK SERVICE | Ele Truck Services | 0.591 |
| 48 | LUIS ARMANDO SOSA PEREZ | ARMANDO PEREZ | 0.583 |
| 49 | Ih 35 Trucking-Vendor | IH 35 Trucking LLC | 0.577 |
| 50 | IH 35 Transportation LLC | SETHMAR TRANSPORTATION LLC | 0.576 |
| 51 | Jose Alfredo Cazares Meneses | ALFREDO CAZARES | 0.571 |
| 52 | Miguel A. Sanchez | Jose Miguel Alfaro Sanchez | 0.571 |
| 53 | Lightyear Transportation Llc | SETHMAR TRANSPORTATION LLC | 0.571 |
| 54 | Loves-Tx091-Laredo | Loves-Te452-Laredo | 0.565 |
| 55 | JESUS ARMANDO MORALES LEAL | Jesus Armando Moreno Mora | 0.563 |
| 56 | TA TRUCK SERVICE | M & S Truck Parts & Service | 0.560 |
| 57 | Quickbooks Payments | Quickbooks Payroll | 0.560 *(false positive, not a real duplicate)* |
| 58 | IH 35 Transportation LLC | Lightyear Transportation Llc | 0.559 |
| 59 | Javier Vargas Saucedo | Javier Vargas Solis | 0.556 |
| 60 | Miguel A. Sanchez | Miguel Angel Sanchez Cordova | 0.552 |

**Fix applied directly, in this PR** — unambiguous, non-monetary, no merge/GL/dollar touched (per
the owner's own "fix only what is unambiguous and non-monetary" instruction): raised
`scan-duplicate-vendors.routes.ts`'s `LIMIT 25` to `LIMIT 100` (room above the current live 60; a
read-only display cap, not a schema/merge change). The banner's own `visiblePairCount` already
computes from the returned array length, so this alone corrects the header text from "(25 pairs)"
to the true "(58 pairs)" (60 minus the 2 flagged false positives stay in the raw count since
filtering those out algorithmically is a judgment call, not this fix's job) with zero other code
change needed.

Query (same as the route's own, minus `LIMIT 25`):
```sql
WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
SELECT a.id AS from_vendor_id, a.vendor_name AS from_vendor_name,
       b.id AS to_vendor_id, b.vendor_name AS to_vendor_name,
       round(similarity(a.vendor_name, b.vendor_name)::numeric, 3) AS similarity
  FROM mdata.vendors a
  JOIN mdata.vendors b ON b.operating_company_id = a.operating_company_id
    AND a.id < b.id AND similarity(a.vendor_name, b.vendor_name) > 0.55
    AND lower(a.vendor_name) <> lower(b.vendor_name)
 WHERE (SELECT v FROM b)='lucia' AND a.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
   AND a.deactivated_at IS NULL AND b.deactivated_at IS NULL
   AND a.is_sample_data IS NOT TRUE AND b.is_sample_data IS NOT TRUE
 ORDER BY similarity DESC;
```

---

## FINDING 3 — Same-defect-class sweep across the rest of Factoring: CLEAN

Searched the full Factoring surface (frontend `pages/factoring/`, `components/factoring/`, backend
`factoring/factoring.routes.ts` and every other backend file with "factoring" in its path) for any
OTHER control gated on a QBO-only concept (`qbo_vendor_id`, `qbo_entity_id`, `qbo_customer_id`,
`qbo_archive.entities_snapshot`) the way the two already-shipped defects (#21952's dropdowns,
#22066's Submit Invoice stub, both already fixed this session) and Finding 1 above are shaped.

Result: **the vendor-merge form (`FactoringHome.tsx`'s `vendor_merges` tab + its backend) is the
ONLY place in Factoring with a QBO-sync dependency.** `factoring.routes.ts` itself has zero QBO
references. `factor.faro_invoice_lines` is 34/34 linked to a real `load_id` (F3, no defect). No
other tab's data source was found to assume a QBO-synced vendor/customer/entity.

This is a real, checked-not-assumed clean result, not a "didn't look" — reported as such rather
than manufacturing a third finding to pad the list.

---

## FINDING 4 — 5 open invoice disputes (F7), reported per the owner's ask

| Load | Reason | Disputed | Invoiced | Expected | Opened |
|---|---|---|---|---|---|
| 13581 | short_pay | $1,600.00 | $4,900.00 | $3,300.00 | 2026-09-13 00:50Z |
| 13586 | short_pay | $300.00 | $3,600.00 | $3,300.00 | 2026-09-13 00:51Z |
| 13578 | under_billing | $560.00 | $4,650.00 | $5,210.00 | 2026-09-13 18:47Z |
| 13589 | under_billing | $30.00 | $4,120.00 | $4,150.00 | 2026-09-13 18:48Z |
| 13524 | under_billing | $400.00 | $3,800.00 | $4,200.00 | 2026-09-13 21:34Z |

**13581 stays untouched**, per the standing owner-gated Faro short-pay dispute instruction repeated
across this session — confirmed present in this list at its expected figures ($1,600.00 disputed,
matching every earlier reference this session). No other action taken on this list; report only.

Query (invoice-side `status<>'void' AND voided_at IS NULL` added per this round's blanket
instruction — checked live: all 5 invoices are `status='sent'`, `voided_at IS NULL` already, so
this doesn't change the result, only makes the query itself compliant):
```sql
WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
SELECT d.id::text, l.load_number, d.reason_code, d.disputed_amount_cents, d.invoiced_amount_cents,
       d.expected_amount_cents, d.status, d.opened_at
  FROM accounting.invoice_disputes d
  JOIN accounting.invoices i ON i.id = d.invoice_id
  LEFT JOIN mdata.loads l ON l.id = i.source_load_id
 WHERE (SELECT v FROM b)='lucia' AND d.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
   AND d.status NOT IN ('resolved','closed','void')
   AND i.status<>'void' AND i.voided_at IS NULL
 ORDER BY d.opened_at;
```

---

## THE GUARD WALL

Read-only static audit, run by a dedicated subagent (7 parallel batches feeding one consolidating
pass, 251 files — every `scripts/verify-*.mjs` plus every `scripts/verify-steps/*.mjs` containing
`bypass_rls`/`set_config(`) against a clean `origin/main` snapshot (`git archive origin/main --
scripts`), not the live primary dir. Method: classify every `bypass_rls`/`set_config(` occurrence
that is part of SQL actually executed against a live DB, using 4 labels:

**Environment finding, reported because it independently blocks Task 2 below and is itself a
board-worthy landmine:** the primary working directory (`/Users/jorgemunoz/IH35-TMS-claude`, branch
`claude-lead/settlement-net-pay-triple-bug-fix`) was mid an **unresolved `git am`** for the whole
duration of this audit — `git status` shows "You are in the middle of an am session," and
`git diff origin/main --stat` on the guard globs shows **384 guard files diverging, 236 of them
completely missing from disk** right now (e.g. `verify-usmca-settlement-linkage.mjs`,
`verify-alwaystrack-parity.mjs` don't exist on disk today despite being on `origin/main`). Nothing in
this section trusts that checkout — every static classification is against the clean `origin/main`
archive. This is a pre-existing state this seat found, not caused; filed as its own row below since
whichever seat owns that branch needs to `git am --abort`/`--continue` it before anyone else can trust
a live run in that directory.

- **SAFE-CTE** — `WITH b AS MATERIALIZED (SELECT set_config(...) AS v)` in the same query string as
  the real SELECT/UPDATE, with the WHERE clause referencing it (`WHERE (SELECT v FROM b)='lucia'`).
  This is the pattern this round's own instruction mandated.
- **TRAP-CTE-UNREFERENCED** — a bypass CTE is declared (usually NOT even `MATERIALIZED`, and
  cross-joined rather than filtered) but never referenced in the WHERE clause. Under FORCED RLS this
  silently returns 0 rows — **a false PASS, indistinguishable from "nothing wrong."** This is the
  exact trap this round's instructions named.
- **SAFE-TXN** — a bare `set_config`/`SET LOCAL` issued as its own statement, but wrapped together
  with every subsequent read on the SAME client inside an explicit `BEGIN…COMMIT`/`ROLLBACK` — the
  repo's own documented BANK-F30150 fix (a connection pooler can route separate statements to
  different backends; one open transaction cannot be split across them).
- **TRAP-BARE-NO-TXN** — a bare `set_config`/`SET LOCAL` issued as its own statement with NO
  surrounding transaction, followed by separate `client.query()` calls that assume it still holds. A
  DIFFERENT risk class from the CTE trap (pooler cross-statement routing, not a WHERE-clause
  omission) but the same practical failure mode: a guard that can silently see 0 rows under FORCED
  RLS and read as green.

### Totals across all 251 files scanned

| Pattern | Count | Verdict |
|---|---|---|
| SAFE-CTE (MATERIALIZED CTE, referenced in WHERE — the pattern this round mandates) | 3 | No |
| **TRAP-CTE-UNREFERENCED** | **6** | **vulnerable — the named trap** |
| SAFE-TXN (incl. 2 borderline files using the in-repo-documented ACCT-F5391 one-message/one-backend idiom instead of literal BEGIN/COMMIT) | ~98 | No |
| **TRAP-BARE-NO-TXN** | **39** | **vulnerable — related class (BANK-F30150)** |
| N/A-NO-LIVE-BYPASS (comments/doc-strings/meta-guards regexing other files, no live SQL, or a different GUC entirely) | ~105 | — |

**45 of 251 guard files (18%) carry one of the two vulnerable shapes.** Only 3 files use the exact
SAFE-CTE pattern this round's instruction mandates — all three are this session's own last-two-days'
work (`verify-draft-load-saves-and-is-visible.mjs`, `verify-settlement-net-matches-signed-doc.mjs`,
`verify-usmca-settlement-linkage.mjs`). Every other currently-safe guard in the whole suite uses the
different SAFE-TXN (explicit BEGIN/COMMIT) shape instead — worth knowing before assuming the CTE
pattern is already the house style.

### TRAP-CTE-UNREFERENCED — the exact trap named this round (6 files, full list)

All six share the identical defect shape: `WITH b AS (SELECT set_config('app.bypass_rls','lucia',
false))` (note: not `MATERIALIZED`, and `false`/session-scoped, not `true`), cross-joined into `FROM`
(`FROM b, <real_table>`) but never referenced in the WHERE clause — so the bypass value is computed
but never gates anything. Under FORCED RLS every one of these can silently return 0 rows and be
misread as "no problem found."

| File | Line(s) | Detail |
|---|---|---|
| `scripts/verify-fleet-apd-trailer-identity.mjs` | 69-76 | WHERE only filters `e.currently_leased_to_company_id`/`equipment_number`/`deactivated_at` — never `b`'s value |
| `scripts/verify-geofence-events-from-positions.mjs` | 53-63 | WHERE only filters `ge.operating_company_id`/`ge.source` — never `b`'s value |
| `scripts/verify-samsara-driver-mirror-complete.mjs` | 43-49 | cross-joined into `integrations.samsara_drivers`, never filtered on; third `set_config` arg is `false` |
| `scripts/verify-stops-geocoded.mjs` | 57 | `b` cross-joined twice (`mdata.load_stops`, `geo.geofences`), never filtered on either |
| `scripts/verify-usmca-no-active-test-vendors.mjs` | 69 | WHERE only filters `v.operating_company_id`/`v.vendor_name ~* '(codex\|test)'` — never `bypass`'s value |
| `scripts/verify-yard-location-and-fence.mjs` | 68 | `b` cross-joined into `mdata.locations`, never filtered on |

None of these six are in Factoring/Banking/Settlements/Dispatch by name (fleet/geofence/samsara/stops/
vendor-test-fixture/yard-location) — reported per the "audit every guard" instruction, not routed to
this seat's own fix queue. Recommended fix for all six is mechanical and uniform: rewrite the CTE as
`WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)` and add
`AND (SELECT v FROM b)='lucia'` to each WHERE clause — no financial/GL/vendor-merge content, but
**not fixed here** (all six are outside Factoring/Banking/Settlements/Dispatch, this seat's
"findings, don't drive-by other seats' files" instruction, and touching 6 files across 6 different
modules in one PR is its own scope violation) — filed as its own GUARD-WORKORDERS row for whichever
seat owns each module.

### TRAP-BARE-NO-TXN — related class (39 files)

Same practical failure mode (a guard that can silently 0-row under FORCED RLS) via a different
mechanism: a bare `set_config`/`SET LOCAL app.bypass_rls` issued as its own statement with no
enclosing transaction, then separate `client.query()` calls that assume the setting still holds. On a
pooled connection each statement can be routed to a different backend, so the bypass may never reach
the backend that runs the real query.

| File | Line(s) |
|---|---|
| `scripts/verify-rpt-s02-neon-tie.mjs` | 196, 263 |
| `scripts/verify-samsara-driver-mirror-both-statuses.mjs` | 53 |
| `scripts/verify-schema-parity-from-prod.mjs` | 180 |
| `scripts/verify-seed-script-usmca-cutover-floor.mjs` | 67 |
| `scripts/verify-settlement-lines-load-id-backfilled.mjs` | 42 |
| `scripts/verify-driver-vendor-financial-identity-invariant.mjs` | 92 |
| `scripts/verify-factoring-recourse-window.mjs` | 143 |
| `scripts/verify-fixed-monthly-costs-never-attach-to-load.mjs` | 41 |
| `scripts/verify-fuel-overage-receivable-account.mjs` | 89 |
| `scripts/verify-heavy-repair-expense-account.mjs` | 118 |
| `scripts/verify-intercompany-coa-8000-block.mjs` | 52 |
| `scripts/verify-invoice-copies-export-safe.mjs` | 103 |
| `scripts/verify-je-type-inbound-density.mjs` | 100 |
| `scripts/verify-lane-mileage-import-columns-populated.mjs` | 84 |
| `scripts/verify-lane-mileage-short-miles-never-from-alwaystrack-blend.mjs` | 91 |
| `scripts/verify-launch-toggle-audit-trail.mjs` | 61 |
| `scripts/verify-ldt-4-factoring-money.mjs` | 123 |
| `scripts/verify-ldt-5-presettlement-readout.mjs` | 86 |
| `scripts/verify-load-settlement-linkage.mjs` | 75 |
| `scripts/verify-load-to-cash-chain.mjs` | 64 |
| `scripts/verify-netpay-clearing-is-liability.mjs` | 135 |
| `scripts/verify-company-settlements-readmodel.mjs` | 87 |
| `scripts/verify-customer-activity-statements.mjs` | 94-95 |
| `scripts/verify-acct-link-03-bill-unit-density.mjs` | 103 |
| `scripts/verify-cash-advance-close-time-three-way-routing.mjs` | 109 |
| `scripts/verify-no-orphaned-driver-merge-references.mjs` | 159 |
| `scripts/verify-no-sample-bank-transaction-writes.mjs` | 160 |
| `scripts/verify-no-seat-instruction-overrides-owner-void.mjs` | 76 |
| `scripts/verify-no-test-units-in-prod.mjs` | 53-54 |
| `scripts/verify-no-unmanifested-prod-financial-fixtures.mjs` | 87 |
| `scripts/verify-pl-cost-of-revenue.mjs` | 105 |
| `scripts/verify-presettlement-autolink-all-paths.mjs` | 152 |
| `scripts/verify-real-owned-fleet-is-trk.mjs` | 81 |
| `scripts/verify-recon-usmca-bank-suggestion-coverage.mjs` | 134 |
| `scripts/verify-reimbursement-historical-reclass.mjs` | 159-160 |
| `scripts/verify-tour-leg-linkage.mjs` | 58 |
| `scripts/verify-usmca-compliance-neon-pv.mjs` | 65 |
| `scripts/verify-usmca-fleet-fuel-tasks-neon-pv.mjs` | 63 |
| `scripts/verify-usmca-reports-neon-pv.mjs` | 60 |

*(2 borderline files — `verify-usmca-categorization-rules-fuel-maint-reach.mjs`(122) and
`verify-usmca-no-active-test-fixtures.mjs`(133) — send the bare `set_config` as the first statement of
one semicolon-joined multi-statement string inside a SINGLE `client.query()` call, matching this
repo's own documented ACCT-F5391 "one message = one backend" safe idiom. Classified safe-equivalent,
not vulnerable, in the final consolidated pass — excluded from the 39 count above — but flagged since
it's a looser shape than explicit BEGIN/COMMIT and worth a second opinion.)*

**Several of these ARE in this seat's own Banking/Factoring/Settlements lane**
(`verify-driver-vendor-financial-identity-invariant.mjs`, `verify-factoring-recourse-window.mjs`,
`verify-ldt-4-factoring-money.mjs`, `verify-company-settlements-readmodel.mjs`,
`verify-customer-activity-statements.mjs`, `verify-acct-link-03-bill-unit-density.mjs`,
`verify-cash-advance-close-time-three-way-routing.mjs`, `verify-recon-usmca-bank-suggestion-coverage.mjs`).
Per "never defer work in my own lane," these are candidates to fix directly — but 8 files each needing
an isolated `BEGIN…COMMIT` wrap plus a full local re-run of every guard they gate is a second PR's
worth of surface, not a one-line fix squeezed into this findings PR under a same-day deadline; **not
fixed in this PR**, filed as a named follow-up so it isn't lost.

### RED guards (measured live value vs. threshold) — UNVERIFIED, blocked by environment

**Could not run live at all in this environment: `DATABASE_URL` is unset.** Every DB-backed guard
reports `SKIPPED-DB-CHECK`/`LIVE skipped` by design when it's absent — no guard name/measured-value/
threshold triple is honestly reportable. Per the LAW OF THE LAND, this is stated as **UNVERIFIED —
needs live check**, not guessed at.

`env -u DATABASE_URL DOTENV_CONFIG_PATH=/dev/null node scripts/verify-static.mjs` (static-only, no DB)
was run per this round's instruction, but only against the **same contaminated working tree** the
`git am` finding above describes (236 guard files missing vs. `origin/main`) — its output does not
represent either `origin/main` or a coherent codebase state and is **not being reported as findings**,
only as a transparency artifact: it surfaced 9 gated failures not in `VERIFY-STATIC-BASELINE`, one of
which (`verify-verify-step-lane-band.mjs`) fails because *"branch claude-lead/settlement-net-pay-
triple-bug-fix maps to no lane"* — itself proof this specific run isn't a trustworthy signal. **Do not
act on this list until the `git am` is resolved and it's re-run clean.**

**Board row filed, not fixed here** (infra/environment, not a Factoring/Banking code defect):
whichever seat owns `claude-lead/settlement-net-pay-triple-bug-fix` needs to resolve the stuck
`git am` before Task 2 (or any other live guard run) can be trusted in that directory again.

### Stale ratchet baselines (live value now below baseline)

Grepped all 8,109 files on `origin/main` for a true inline numeric `_BASELINE` constant (distinct from
the `UPDATE_X_BASELINE=1` env-var regeneration mechanism, out of scope here). Exactly 3 exist:

| File | Constant | Baseline | Status |
|---|---|---|---|
| `scripts/verify-usmca-settlement-linkage.mjs:74` | `L3_BASELINE` | 21 | Already current — this is ROUND 24.4's own value, set this session; live-verified L3=21 at the time (see that round's PR). Missing from the contaminated working tree right now, consistent with the `git am` finding above, not a new issue. |
| `scripts/verify-matrix-built-leaf-specific.mjs:39` | `LEGACY_BROAD_BASELINE` | 55 | **STALE — live value is 6, not 0.** No DB dependency (reads `docs/specs/scoreboard/wire-sprint-built.json` + `@matrix-built` tags only) — the audit subagent reported `0/55` but that run was against the same contaminated `git am`-mid-state primary dir the environment finding above describes; re-ran it myself in the clean `origin/main` worktree used for this PR and got `PASS — 6/55 legacy broad claims remain`. **Fixed in this PR** (below) using the independently re-verified number: `LEGACY_BROAD_BASELINE` 55→6. Unambiguous, non-monetary, no DB, one-line ratchet tightening — exactly the class of fix this round's instruction says to make directly rather than just report; the discrepancy itself is a live example of why this whole document insists on re-verifying every number rather than trusting a single read. |
| `scripts/verify-board-append-only.mjs:41` | `UNCITED_BASELINE` | 1686 | **Not trustworthy to re-measure right now.** The dirty working tree's own copy of this file already has an uncommitted 1-line diff (`UNCITED_BASELINE = 1`, not 1686) vs. `origin/main`, so any run in that directory reports its own edit as "1685 new uncited completions" — an artifact of the dirty checkout, not a real regression. The same run also reported "board LOST 21 rows vs origin/main" and "84 ids simultaneously OPEN and FIXED," which could be genuine Rule-28/duplicate-row defects but could equally be `git am`-interruption artifacts — **not reported as a confirmed finding, filed as a re-check-once-clean item**, per the same LAW OF THE LAND instrument-claim discipline as everything else in this document. |
