# 09-05-2026 · CLAUDE CODER 1 · LOAD COSTS COMPLETE VERTICAL — UPDATED (CORRECTIVE SEQUENCE)
Supersedes the sequencing in `09-04-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL.md`. That
document's PARTS 1–8 remain the spec; this file tells you where you are and the exact order.
Entity: USMCA ONLY `5c854333-6ea5-4faa-af31-67cb272fef80`. FAST-MERGE. Never POST Book Load as a probe.
`git pull --ff-only origin main` first.

## AUDIT OF YOUR WORK — tip 4d8b7fc7 + Neon prod, 2026-09-05 01:30 UTC (owner-verified, not your report)
| Spec part | State | Verdict |
|---|---|---|
| Part 1.1 crewed load never stays draft | 13508 was hand-UPDATEd to `assigned_not_dispatched` by Cursor under owner authorization at 01:24Z. WIZ-STATUS-01 exists in `update-load.service.ts:760-773` but fires ONLY on an Edit-Load PATCH. No guard exists. | OWED: durable fix + guard |
| Part 1.2 CoGS picker + fuel by ROLE | #20425 merged 01:24Z — regex gone, role bind, guards 10365/10369/10373 wired | DONE (deploy pending, Cursor) |
| Part 2 board 19 cols, bands, 5 guards | live | DONE |
| Part 2.3 board tab row | zero matches in `LoadCostsBoardPage.tsx` | NOT DONE |
| Part 3 Costs-tab register | still the stacked draft-card form; tab says "You never type the number" — opposite of spec | NOT DONE |
| Part 5 pre-settlements / settlements | Dispatch `settlements` subtab is a 2026-06 quick-link stub; `pre_settlements` is a flat DataTable; `DEFAULT_ESCROW_PER_SETTLEMENT_CONTRIBUTION_CENTS = 25_000` still consumed at `settlement-payrun-close.service.ts:523`; `pre-settlement.routes.ts` still 404s the empty state; 0/5 guards | NOT STARTED |
| Part 6 FARO + test customers | all 5 real customers assigned; 0 unflagged test customers | DONE |
| Part 7 mileage | not started | correct — after 1–6 |
| OUTBOX | no STEP checkoff, no ACK of SEQUENCE or the 20:01 owner order | SILENT — fix now |

You skipped the two blockers the owner was stuck behind and built the visible board first. That is
the deviation. The owner order of 2026-09-04 20:01 gives you the WHOLE Load Costs + settlements
vertical INCLUDING `LoadDetailCostsTab.tsx`. Post one line to OUTBOX-CURSOR:
`SURFACE-BREACH by owner order 2026-09-04 20:01 — CC-1 owns LoadDetailCostsTab.tsx for the Load Costs vertical`
and proceed. Do not wait for Cursor.

## STEP 0 — INTERRUPTION FIRST (your migration lane is open 00–11 UTC; three seats are gated on this)
Apply CC-3's FOUR migration drafts in `docs/audit/migration-drafts/` as ONE batch:
1. `SAMSARA-REMOTE-COUNTS-ADDRESSES-ENTITY-TYPE` (widen the CHECK to include `addresses`)
2. `SAMSARA-ADDRESSES-TABLE` (`integrations.samsara_addresses`)
3. the `geo.geofences` source-id draft from #20418 (`external_source`, `external_ref`, unique index)
4. `geo.geofence_vehicle_state` + `geofence_state_transitions.is_superseded/superseded_reason` — CC-3 is drafting it now; if it is not in the folder when you get there, apply 1–3 and tell CC-3 in one line.
Numbers strictly above main's max, re-checked at push. Idempotent. FORCED RLS + 0065 grants. Apply on
Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`. Post the sha to OUTBOX-CC-1 and ONE line to
OUTBOX-CC-3 (`CC-1 → CC-3 | migrations applied | <sha> | tables live`). Then return to Step 1.

## THE SEQUENCE — finish each step, post `CC-1 | STEP-N DONE | <sha> | NEXT N+1`, then the next
**STEP 1 — draft advance, durable.** The hand-UPDATE on 13508 is not the fix. (a) The book/assign
write path applies the same rule as the Edit PATCH: a load that ends any write with an assigned
unit + primary driver (or team), or that carries an open driver bill or a proforma invoice, can never
be `draft`. (b) A self-heal so any load already sitting in that state advances without waiting for a
human edit (service-level, not SQL by hand). (c) Guard `verify-load-with-crew-is-not-draft`, wired in
`scripts/verify-steps/`. Root cause per Cursor's read of `load-state-machine.ts`: `draft → dispatched`
is rejected 400, so pressing Dispatch on a draft silently leaves it draft — make that path advance
through `assigned_not_dispatched` or refuse LOUDLY with the reason on screen. Silent no-op is a defect.

**STEP 2 — DONE (#20425).** Post the checkoff line retroactively. Confirm live after Cursor's deploy:
Costs tab picker shows all 34 cost accounts; `+ Fuel advance` posts DR 5000 / CR 1000.

**STEP 3 — the Costs tab register** (spec Part 3; render `IH35-LOAD-COSTS-MASTER-RENDER.html` → "LOAD COSTS TAB"):
identity strip `LOAD 13508 · NCC Logistics México · ANGEL ALFONSO SOSA · Unit T156` + status badge;
four KPI cards (light bg `--kpi-bg`, darker border, centered) Line haul revenue · Costs on this load ·
Driver pay · Approximate margin, then the line "Approximate · before settlement. Nothing here has
posted to the general ledger — this tour is open."; action row `+ Add another cost` (primary) ·
`+ Fuel advance` · `+ From a receipt photo` · `Advance received · from broker` · `Save`, all 28px square;
register table `NUMBER · DATE · TYPE · VENDOR · CATEGORY · LATE FEE · LUMPER · FUEL · R&M EXP · OTHER ·
AMOUNT · STATUS`. NUMBER is EMPTY AND EDITABLE by default (QuickBooks): blank = system assigns the
load number, then -1, -2 (single digit, never zero-padded); typed value wins verbatim. The five
category columns are the same split as the board. STATUS = paid · owed · new, not saved. Void never
delete, edit path on every saved row, dash in every empty cell. Every picker is a Combobox with typed
filter and `+ Create`. Drawer ≥ 480px. Receipt photo lands back on this tab. Remove the sentence
"You never type the number."

**STEP 4 — board tab row + polish** (spec 2.3): above the KPIs `Costs · Expenses · Bills · Fuel
advances · Broker advances · Driver pay · Repairs & maintenance · Documents`, count badge when a tab
has rows, 12px muted, 2px bottom border on active — not pills. Filter pills apply inside the open tab.
Pills are square 2px (`rounded-full` is a design-law violation). Remove the Margin column from the
19 (spec 2.1 says remove margin). Every non-default tab is the flat register of that record type
across live loads with its own totals row and a link back to the load.

**STEP 5 — pre-settlements and settlements in Dispatch** (spec Part 5; renders
`09-04-2026-Pre-Settlement-Design-render.html` and `09-04-2026-Settlements-Consolidated-render.html`):
replace the `settlements` quick-link stub and the flat `pre_settlements` table. Consolidated by
default, expand on click, multiple rows open, state persists across refresh. Collapsed row:
`▸ · Settl # · Driver · Unit · Loads · Fuel stops · Revenue · Fuel · Loaded Mi · Empty Mi · Salary ·
Addl Pay · Reimbursed · Deductions · Total Due · M.P.G. · State`. Drop panel BLOCK 1 = load rows with
the 19 columns + Trailer + Customer and ONE ROW PER INDIVIDUAL COST beneath (never consolidated;
5784 = 3 load rows + 12 cost rows). BLOCK 2 = deductions one row each, tied to a load, footed.
BLOCK 3 = reconciliation + `Print driver settlement` · `Print company settlement` · `Reopen` VISIBLY
DISABLED. Pre-settlements tab adds `Close · becomes the settlement` as primary — the OWNER closes,
you never call it. Tabs `Pre-settlements · Settlements · Company settlements · Drivers · Advances ·
Documents · Audit` with count badges.
**ESCROW — verified by Cursor against all 36 driver settlements + company 5784 on 2026-09-05:**
escrow is **$25.00 (2,500¢) PER LOAD**, one `Driver-Escrow For Claims -25.00` line per load, and it is
CONDITIONAL — 12 of 36 settlements carry none (flat-rate / exempt drivers, e.g. 5766). Build a
per-load escrow column that READS the actual driver-bill escrow deduction; never hardcode it onto
every load. Retire `DEFAULT_ESCROW_PER_SETTLEMENT_CONTRIBUTION_CENTS = 25_000` ($250/settlement —
wrong grain and wrong amount) behind the per-load path — do not delete. The $2,500 balance cap
(`escrow_target` / `ESCROW_CAP_CENTS`) is a different thing and stays unchanged.
Also from the documents: driver pay = loaded @ rate + EMPTY @ the same rate, OR flat rate (5766) —
both models must render; `Driver Pay-Extra Delivery/Drop $25.00` is additional pay; `Admin fee – GAS
-$10.00` per settlement when present; company settlement waterfall = Invoiced − Quick Pay (factoring
0.50%) − Driver Salary − Additional Pay − Fuel − Company Expenses = Net Revenue (5784: $2,938.77).
`pre-settlement.routes.ts:180` empty state = 200 + named filter, never 404 (verify-step 10337 claimed).
Guards: `verify-settlement-rows-collapsed-by-default` · `verify-settlement-costs-never-consolidated` ·
`verify-closed-presettlement-leaves-presettlement-tab` · `verify-escrow-accrues-per-load-not-per-settlement` ·
`verify-settlement-reopen-disabled-not-hidden`. All in `scripts/verify-steps/`.

**STEP 6 — the 31-settlement feed** (`09-04-2026-Claude-Coder-1-FEED-THE-APP-REAL-SETTLEMENT-DATA.md`
+ `docs/bus/settlement-entry-2026-09-04/`): through the real UI write path, `is_sample_data=false`,
addresses only, every diesel/DEF/deduction its own row, real invoice numbers. NEVER close a
pre-settlement. Hands off 5766 / 5772 / 5776 / 5780 / 5783 / 5784 (owner's control group). Stop at
the first refusal and report it — do not hand-INSERT past it. 5789/13557 date 2026-09-29 → 2026-08-29
with memo (the only authorized correction).

**STEP 7 — mileage / three-mile schema** (spec Part 7 + `ORDER-2026-09-04-CC-1-THREE-MILE-CPM.md`):
after 1–6, and actual driven miles only after CC-3's geofence step 3.5.

## DONE
The owner opens Load Costs, sees 13508, opens the Costs tab, picks from all 34 cost accounts, records
an expense that saves and posts, clicks `+ Fuel advance` and it posts DR 5000 / CR 1000 with no driver
receivable; the board shows the tab row and 19 columns under the bands; Dispatch › Pre-settlements
shows the consolidated/expand shape. Live Chrome screenshot + live SQL pasted to OUTBOX-CC-1 per step.
Merged is not done. Filed-to-Cursor is not done. One line per step. No idle. No jumping.
Post `DEPLOY-REQUEST: <sha> — <why>` to OUTBOX-CURSOR; you deploy only if Cursor is down >15 min.
