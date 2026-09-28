# Load Import Defect Register — USMCA — 2026-09-28

ROUND 173 JOB 1 (Lead, P0, deadline 18:00 CT). Register only — no row repaired in this PR,
per standing order. Scope: all 136 active (non-soft-deleted) USMCA loads, cross-checked against
47 signed rate-confirmation PDFs in `~/Downloads/loads_*.pdf` (parsed with `pdftotext -layout`)
and the owner's Faro daily purchase report (`~/Downloads/faro daily purchase report.csv`).

**A live correction landed on two of these rows while this register was being built** (owner,
`changed_by_role='Owner'`, `audit.row_changes`, 2026-09-28 12:49-12:51 UTC) — see the note under
(b) before reading 13615/13619 as static facts.

## (a) Placeholder lanes — 27 loads

Every load whose stop set is a single city, pickup city = delivery city, or fewer than 2 stops.

| load_number | wo | po | customer | unit | stops | lane | status | invoice? | FA (notes-mention)? |
|---|---|---|---|---|---|---|---|---|---|
| 13544 | 66006 | — | Hawkeye Transportation Services | T148 | 2 | Laredo, TX | closed | yes | no |
| 13563 | 66174 | — | Hawkeye Transportation Services | T148 | 2 | LAREDO, TX | closed | yes | yes |
| 13570 | 2501086 | — | XPR LOGISTICS LLC | T164 | 2 | no city captured | closed | yes | yes |
| 13572 | — | — | EGRO TRANSPORT LLC | T152 | 2 | no city captured | invoiced | yes | no |
| 13574 | ES6884 | — | ES Logistics International LLC | T177 | 2 | no city captured | closed | yes | yes |
| 13575 | ES-6883 | — | ES Logistics International LLC | T152 | 2 | no city captured | closed | yes | yes |
| 13578 | — | — | Refrigerx Transportation LLC | T156 | 2 | no city captured | invoiced | yes | no |
| 13581 | SMX14610 | — | Semares Forwarding Services | T168 | 2 | no city captured | closed | yes | yes |
| 13582 | — | — | Semares Forwarding Services | T177 | 2 | no city captured | invoiced | yes | no |
| 13587 | 131527406 | — | KEY GLOBAL LOGISTICS | T156 | 2 | no city captured | closed | yes | yes |
| 13589 | 712370 | — | Kirsch Transportation Services INC | T176 | 2 | no city captured | closed | yes | yes |
| 13592 | ES6888 | — | ES Logistics International LLC | T177 | 2 | no city captured | closed | yes | yes |
| 13595 | — | — | PAYPA TRANSPORT | T148 | 2 | no city captured | invoiced | yes | no |
| 13596 | SEM66525 | — | Semares Forwarding Services | T175 | 2 | no city captured | closed | yes | yes |
| 13597 | SEM66526 | — | Semares Forwarding Services | T176 | 2 | no city captured | closed | yes | yes |
| 13600 | 1233617 | — | RLS LOGISTICS | T170 | 2 | no city captured | closed | yes | yes |
| 13602 | SEM66528 | — | Semares Forwarding Services | T168 | 2 | no city captured | closed | yes | yes |
| 13604 | SMX14651 | — | Semares Forwarding Services | T177 | 2 | no city captured | closed | yes | yes |
| 13607 | 2584270 | — | CIRCLE LOGISTICS, INC | T168 | 2 | no city captured | closed | yes | yes |
| 13608 | ES6900 | — | ES Logistics International LLC | T177 | 2 | no city captured | closed | yes | yes |
| 13610 | 1013737 | — | Refrigerx Transportation LLC | T152 | 2 | LAREDO, TX | closed | yes | yes |
| 13611 | 1013707 | — | Refrigerx Transportation LLC | T171 | 2 | no city captured | closed | yes | yes |
| 13612 | SEM66514 | — | Semares Forwarding Services | T176 | 2 | LAREDO, TX | closed | yes | yes |
| 13613 | 1013583-2 | — | Refrigerx Transportation LLC | T164 | 2 | LAREDO, TX | closed | yes | yes |
| 13615 | SEM66529 | SEM66529 | Semares Forwarding Services | T177 | 2 | LAREDO, TX | closed | yes | yes |
| 13619 | 34217 | 34217 | ON POINT LOGISTICS | T152 | 2 | LAREDO, TX | closed | yes | yes |
| 90007 | 68747 | — | ITS Logistics LLC | T175 | 2 | Unknown, TX | cancelled | no | no |

**Count: 27.** `90007` is already resolved (ROUND 166 — fabricated load voided, real invoice
detached and preserved). The other 26 are real freight with a real signed rate confirmation
somewhere (17 of 26 verified below in (b)); the defect is that `mdata.load_stops` never
received real pickup/delivery city text at booking time, not that the load itself is fake.
"FA (notes-mention)" is a `LIKE '%loadnumber%'` scan of `factoring_advances.notes/memo` — a
weak signal, not a real linkage column (none exists between `factoring_advances` and `loads`);
listed for triage only, not to be trusted as proof of a funded advance.

## (b) Foreign PO — cross-checked against 47 signed rate confirmations

Method: every load's `customer_wo_number`/`customer_po_number` was searched verbatim across all
47 PDFs (`pdftotext -layout`); where found, the PDF's own broker name and total rate were read
directly from the document text (not inferred). 49 of the 54 candidate load×reference pairs
resolved cleanly (PDF broker name and amount agree with Neon). **One confirmed foreign-PO
defect, one live in-progress partial fix caught mid-flight, one inconclusive:**

| load_number | the PO/WO | Neon customer + amount | PDF customer + amount | PDF filename |
|---|---|---|---|---|
| **13616** | `66607` | Refrigerx Transportation LLC · $5,700.00 | **HAWKEYE TRANSPORTATION SERVICES INC · $6,800.00**, Laredo Cold Storage → B&B Trading, Stoughton MA | `loads_5645316.pdf` |
| 13619 | `34217` | ON POINT LOGISTICS · **$5,210.00** | ONPOINT LOGISTICS (MC 1582979) · **$4,400.00**, Hanover MD → San Antonio TX, Truck T152 | `loads_5650227.pdf` |
| 13565 | `488` | Hummingbird Logistix, LLC. · $4,000.00 | inconclusive — `488` is too short/generic to trust a substring match; it collided with 5 unrelated PDFs (ONPOINT, TTS, Westgate ×3) in the raw search. No rate confirmation naming "488" or Hummingbird was found among the 47. Needs the actual document, not a string search. |

**13616 is a corrupted row — confirmed independently of the Lead's own read.** PO 66607 belongs
to Hawkeye Transportation, a different customer, a different amount, and a different lane
(Laredo → Stoughton MA, not Laredo → Quakertown PA). This directly confirms the Lead's REFUSAL
of my earlier 100→13616 match: that match was wrong, and the row it would have been booked
against is itself already wrong. **Do not book Faro invoice 100/10136752 anywhere until 13616
is repaired or a replacement load is created; 10136752 stays an orphan (see (c)) in the
meantime.**

**13619 is a live partial fix, caught mid-flight, not a static defect.** While this register was
being built, the owner directly corrected 13619's `customer_wo_number`/`customer_po_number`/
`customer_id` from Refrigerx/`1013272-2` to ON POINT LOGISTICS/`34217` (`audit.row_changes`,
`changed_by_role='Owner'`, 12:49:01-12:51:00 UTC) — exactly the load-level correction the Lead's
own rate-con read calls for. **The correction propagated to the load AND to the existing SENT
invoice's `customer_id`** (both now read ON POINT LOGISTICS), **but the invoice's `total_cents`
is still 521000 ($5,210.00) — the old Refrigerx amount, not ON POINT's real $4,400.00 per the
signed rate confirmation.** A sent invoice currently exists, correctly named to ON POINT
LOGISTICS, for the wrong amount. Flagging for the owner/Lead to finish — not repaired here, per
the register-only order, and because a SENT invoice's amount is not something to change without
an explicit ruling on how to correct it (credit memo vs. edit vs. void-and-reissue).

Every other cross-checked pair (13545, 13551, 13564, 13571, 13573, 13574, 13576, 13577, 13579,
13580, 13609, 13610, 13613, 13615, 13617, 13618, 13620, 13622, 13624, 13626, 13628, 13629,
13630, 13631, 13632, 13633, 13634, 13635, 13636, 13637, 13639) matches its own signed rate
confirmation on customer name and amount. Full parse output: `crosscheck.json` (not committed —
regenerate via the script below; a de-duplicated version of this table is the durable record).

## (c) Orphaned references — named, not silently dropped

References that exist in a signed rate confirmation or the Faro daily purchase report but match
NO USMCA load by WO or PO:

| Reference | Source | Customer | Amount | Notes |
|---|---|---|---|---|
| `SEM66542` | Faro daily purchase report, invoice 102, purchase date 09/25/2026 | Semares (flat-rate customer) | $4,900.00 | No rate confirmation for this WO found among the 47 PDFs either. Every Semares load is a flat $4,900, so amount cannot disambiguate a candidate — this needs the actual signed document, not a guess. |
| `10136752` | Faro daily purchase report, invoice 100, purchase date 09/25/2026 | Refrigerx Transportation LLC | $5,700.00 | No rate confirmation found among the 47 PDFs. This was my own earlier (wrong) candidate for 13616 — ruled out in (b). Stays unmatched. |
| `31453-48423` (Shipment ID) | `loads_5641654.pdf`, Gampac/US Foods, Sep 18 2026 | US Foods Austin (via Gampac) | $2,500.00 | Flowers-Lineage McDonough GA → US Foods Austin, Buda TX. No load in Neon carries this reference under `customer_wo_number` or `customer_po_number`. |
| `669182` (Load #) | `loads_5658449.pdf`, SunBelt Xpress Logistics | (broker: SunBelt Xpress) | $6,250.00 | Delivery window 2026-09-25. No load in Neon carries this reference. |
| `SEM66538` | Was `13615`'s `customer_wo_number` until 12:50:58 UTC today (see (b) note) | Semares | $4,900.00 (per Faro invoice 87, funded 09/21) | **Newly orphaned by the live correction above**, not a pre-existing gap. Faro invoice 87 was funded specifically against this reference; no rate-confirmation PDF naming `SEM66538` was found among the 47 on hand, so the underlying shipment's own signed document is not in this batch. Needs the Lead/owner to confirm SEM66538 was a genuine mislabel of the SEM66529 shipment (in which case this is resolved) or a second, real, separate shipment (in which case it needs its own load). |
| `1013272-2` | Was `13619`'s `customer_wo_number` until 12:49:01 UTC today | Refrigerx | $5,210.00 (Faro invoice 88, funded 09/21, FAC-2026-00097) | **Also newly orphaned by the same edit.** Faro's own funded invoice 88/1013272-2 was a real, correctly-tied $5,210 Refrigerx advance — the load that reference used to point to has now been relabeled ON POINT LOGISTICS. If the underlying Refrigerx freight is real (and Faro already funded $5,210 against it), it has no load to attach to until one is created or restored. |

**Count: 6 orphaned references** (2 from the current Faro batch, 2 from otherwise-unmatched
rate confirmations, 2 newly created by the live correction caught mid-register). The last two
are the most urgent: real money (a funded $5,210 Faro advance) now points at a load record that
no longer carries its identifying reference.

## (d) Addendum, 2026-09-28 — incomplete stop sets (seeded by the Lead: 13628)

Not an address gap (see JOB 2) — a whole leg of the signed route is missing from
`mdata.load_stops` entirely. **Load 13628** (Armstrong Transport GR, ref 4690712-1,
`loads_5654578.pdf`) is a real 3-stop route per its own rate confirmation:

1. 9/25/2026 PICKUP — White Toque (Frozen Warehouse), 11 Enterprise Ave N, Secaucus NJ 07094 — 516
   cases, 9,220 lbs
2. 9/25/2026 PICKUP — White Toque (Dry Warehouse), **1 County Rd, Secaucus NJ 07094** — 1,042
   cases, 9,995 lbs
3. 9/28/2026 DROPOFF — Houston, 8622 Fairbanks North Houston Rd, Houston TX 77064 — 1,042 + 516 =
   1,558 combined cases, matching both pickups' totals exactly.

Neon carries only 2 stops for this load (sequence 1 pickup = stop 1 above; sequence 2 delivery =
stop 3 above). **Stop 2 — the entire "1 County Rd / White Toque Dry Warehouse" pickup leg — was
never created.** The delivery stop's own case/weight totals (confirmed against the document)
already reflect both pickups combined, so this isn't a case of the wrong total being booked; it's
a missing intermediate stop row, which means any per-stop mileage/geofence/arrival logic for this
load is running against an incomplete route.

Not repaired here (JOB 1 stays register-only, and inserting a stop mid-sequence has downstream
effects — stop_arrivals, mileage-from-stamps, geofence creation — this register doesn't own).
Flagged for whoever builds the actual fix: insert a pickup stop (sequence 2, city Secaucus NJ
07094, address_line1 "1 County Rd") and renumber the existing delivery to sequence 3.

**Cross-checked seed set (13613, 13615, 13616, 13619) — no new findings beyond (b) above.**
13613 (Refrigerx, WO 1013583-2, `loads_5636303.pdf`) matches its own signed document exactly on
customer, amount and lane; already correctly funded by Faro invoice 92. 13615/13616/13619 are
unchanged from the (b) findings above — cited, not re-derived.

## (f) Addendum, 2026-09-28 — cancelled load still bundled into a live tour pre-settlement (13623)

Seeded by the Lead's ROUND 176 settlement-guard ruling (`docs/bus/00-LEAD-ROUND-176-SETTLEMENT-GUARD-RULING.md`),
posted here per that ruling's instruction. Confirmed live, `bypass_rls='lucia'`:

- **Load 13623** — `status = 'cancelled'`.
- **Tour `ec4023fd-f208-4553-907c-b967fae9b418`** bundles exactly two loads: **13623 (cancelled)**
  and **13631 (dispatched, in-flight)**.
- **Pre-settlement P-0012** (`855834c2-652d-4957-bf96-43d79ba80ecf`, `status = 'open'`,
  `is_presettlement = true`) is minted for that tour. Its `first_load_id`/`last_load_id` both point
  to 13631 and its one real `settlement_lines` row (`earnings`, "Load 13631", $606.24) is for 13631
  only — 13623 contributes zero lines, correctly, since it never delivered.

**The defect:** cancelling 13623 never touched the tour or its pre-settlement. P-0012 is not itself
wrong (it correctly reflects only the surviving leg, 13631), but nothing recorded that the tour lost
a leg — a cancelled load stays silently bundled into a tour whose other leg is still being settled.
Not repaired here, per this register's own standing scope (register-only, no row fixed in this PR).
Flagged for whoever owns tour/settlement cascade logic: a load cancellation should either detach the
load from its tour explicitly or stamp the tour/pre-settlement with a visible note that a leg was
cancelled, so the gap doesn't have to be re-discovered by cross-referencing three tables by hand.

## Reproduce

```
for f in ~/Downloads/loads_*.pdf; do pdftotext -layout "$f" "/tmp/.../$(basename "$f" .pdf).txt"; done
python3 crosscheck.py   # cross-checks every load's WO/PO against the PDF corpus
```
Scripts are in this PR's `scripts/registers/` directory (see below) so the next run doesn't
require re-deriving the method.
