# ALL CODERS — ROUND 326.6 — MERGED IS NOT LIVE
Claude Lead 2026-10-02 · USMCA only · read this before your next commit

## WHAT HAPPENED, MEASURED

For about an hour, six merged engines were invisible to the owner. Two separate build breaks, both
landing on main through gates that passed.

**Backend dead 02:02Z → 02:23Z.** `apps/backend/src/mdata/canonical/canonical-entities.routes.ts`
merged with two unresolved conflict hunks — markers at lines 11, 13, 14, 34, 48, 49. `tsc` fails the
whole backend on TS1185, so `npm run build:backend` exited non-zero and Render never reached its
pre-deploy `db:migrate`. Three deploys died: `dep-davh1cpsrm7s73bvjoug` (#23954),
`dep-davh215g1s2s73afvm7g` (#23955), `dep-davh25idails738pb5k0` (#23956). CC-2 found it and landed
#23959 with a new guard, `verify-no-merge-conflict-markers`, wired first in the static list. That is
the right fix and it is credited — the guard is what stops a recurrence, not the marker removal.

**Frontend dead 01:16Z → now.** `ih35-tms-web` last updated 2026-10-02T01:16:52Z. Every build after
it failed: `dep-davh7tdg1s2s73aghn4g` (#23959), `dep-davh9qou01pc73eovr9g` (#23960),
`dep-davhb3gu01pc73ep3rg0` (#23961). Two causes, both mechanical:

1. `ListErrorState` declares `status: number` **required** and renders `HTTP {status}`. Three new
   profile surfaces pass only `{message, onRetry}` — `CustomerProfileOverview.tsx:47`,
   `DriverWholeProfile.tsx:72`, `VendorProfileOverview.tsx:51`. TS2741 on all three.
2. `LegalDeadlineAlertsPage.tsx` sits at `src/pages/legal/alerts/` — three levels below `src/` — but
   imports seven modules as `../../x`, which resolves to `src/pages/x`. Seven TS2307.

Lead fixed both: `status={0}` on the three callers (the existing house pattern in four sibling
components — status 0 renders `Error: <message>` with no HTTP code, an honest named error, not a
fabricated status), and the seven imports rewritten to `../../../` after confirming every target on
disk. `../LegalModuleTabs` was left alone; it correctly resolves to
`src/pages/legal/LegalModuleTabs.tsx`. `npx tsc -b` in `apps/frontend` exits 0.

## THE RULE THIS SETS, FOR EVERY SEAT

**A merged PR has shipped nothing until both services are live.** There are two:

| Service | id | Deploys on merge? |
|---|---|---|
| `IH35-TMS` backend | `srv-d7rpem7avr4c73fhp4n0` | yes |
| `ih35-tms-web` frontend | `srv-d7s46dbrjlhs7383i150` | **NO — `autoDeploy: no`, `autoDeployTrigger: off`** |

Your DONE line names the deploy id and its status for **both**, or the item is not done. "Merged
#239xx" is not proof. `dep-xxxx live` is proof.

And the reason neither seat caught its own break: the money gate runs `frontend-tsc` only when your
branch touches compiled code, and each of these branches compiled **in isolation**. The break was
the combination on main. So after your merge, check the deploy — do not assume your green gate
survived contact with someone else's merge.

## ASSIGNED, IN ORDER

**CC-1 — queue item 1, ahead of everything including the transportation delete.**
Make the frontend deploy on merge to main the way the backend does, or make a failed web build fail
loudly on the bus. Silent non-deployment is why six engines were invisible for an hour. While you
are there: `ih35-tms-web`'s build command is `cd apps/frontend && npm install && npm run build` —
confirm a failed `tsc -b` cannot be swallowed.

Then your item 2 stays E-17 fleet roster: **the fleet is 16 trucks, not 43 rows.** Seven of the 43
belong to IH 35 TRANSPORTATION. Every cost-per-mile and fleet baseline on the maintenance boards is
wrong until that lands.

**CC-2 — credited, and three things are yours.**
#23959's conflict-marker guard is the correct class of fix: it makes the defect impossible rather
than removing one instance. Keep working that way.
Your four ROUND 326.2 merges (#23950 banking KPI engine, #23951 banking redesign, #23954 canonical
vendors, #23956 factoring redesign) were **never live on the web**. Re-verify items 2, 3 and 4
against the web deploy that follows this hotfix, not against the merge. Your own commit bodies say
`Live=UNVERIFIED` — that was correct and it is still true.

**CC-3 — your three surfaces broke the frontend.**
`CustomerProfileOverview`, `VendorProfileOverview` and `DriverWholeProfile` are fixed, but the lesson
is yours to carry: when you call a shared component, read its `Props`. `ListErrorState` has required
`status` and has had it for the four sibling components that already pass it. Your #23960 driver
whole-profile work is good — 17 blocks, each a value or a named reason, 0 malformed across 18 drivers
— and none of it has been visible to the owner.

**CURSOR — `LegalDeadlineAlertsPage.tsx` was committed at the wrong depth.**
Seven broken imports is a file that was never compiled before it was pushed. Run
`npx tsc -b` in `apps/frontend` before every push that adds a page, regardless of what the gate asks
for.

## THE 19 AMBIENT STATIC FAILURES — WHO OWNS WHAT

`verify-static`'s fallback was judging every branch against the whole repo, because `block-ready` is
capability-skipped without a local verify database and the fallback then runs the full sweep —
including live-money guards that correctly fail closed with no DB.

Lead declared `REQUIRES_LIVE_DB` on the seven that are live-money guards, which is the mechanism
ruled 2026-09-23: excluded from the static sweep only, still run for real by
`money-pr-local-gate` against a live `DATABASE_URL`, and `verify-no-silent-db-skip` still fails any
guard that exits 0 without one. That guard still passes — 300 scanned, 0 new silent-skip
regressions, nothing weakened. The seven: `verify-bills-mdata-vendor-id-fk`,
`verify-factoring-reserve-escrow-subledger-gap`, `verify-fuel-card-gl-subledger-traceability`,
`verify-integrity-findings-attribution-rate`, `verify-invoice-amount-paid-matches-applications`,
`verify-invoice-header-requires-line-constraint`, `verify-qbo-connection-status-honest`.

The rest are **real static failures from merged work** and they block every seat's push. They are
not mine to guess at:

- **CC-3:** `verify-ct-timezone-rendering`, `verify-entity-picker-trailer-kind-sweep`,
  `verify-no-silent-list-caps`, `verify-new-units-have-gps-or-deactivation-reason`
- **CC-2:** `verify-reg010-011-settlement-identity`, `verify-reg040-resettlement`,
  `verify-reg041-source-load-dates`, `verify-no-new-deleted-at-columns`
- **CURSOR:** `verify-list-error-state-coverage`, `verify-no-raw-status-enum-in-ui`,
  `verify-no-double-encoded-api-body`, `verify-no-partial-optional-chain`

Run yours, fix the cause, do not add it to the baseline. The baseline is shrink-only and growing it
to hide a new failure is the exact anti-pattern it exists to prevent.

## FOUR THINGS WAITING ON THE OWNER — NOBODY GUESSES THESE

Stated plainly so no seat invents an answer:

1. **The canonical customer and vendor repoint `--apply`** waits for an AUTH code. 1,203 duplicate
   customer groups / 1,708 extra rows; rehearsed clean on throwaway branch
   `br-empty-lake-akqooohs` with A/R and A/P unchanged to the cent both ways.
2. **"LOVES" and "LOVES TRAVEL STOPS"** are separate vendor rows that do not normalize equal. The
   engine will not guess, and neither will any seat. LOVES is 494 of 523 vendor transactions and
   $177,911.29 of $185,914.44 — 95.7% of every vendor dollar — so this one matters.
3. **The 15 active TRANSPORTATION loads under USMCA** carry paid money. The owner ordered the
   complete delete route; the paid-money handling on those 15 is his call, not CC-1's.
4. **`factoring.reserve_movement` holds 5 pre-clean-slate Faro releases, net −$7,241.00**, with no
   GL and no funding purchase. Reported by CC-2, untouched, awaiting a Lead ruling that needs the
   owner's read first.

## STANDING, UNCHANGED

Nobody feeds data into USMCA, for any reason, including proof. Nobody verifies in Chrome — the owner
walks every screen himself. Engines, screens, filters and guards only. The app holds no voids, no
cancelled shells, no demo, test, E2E or sample data; where a record should not exist it is deleted,
not voided. A block with no linkage declaration, both directions, is not done.

And the design boards are the specification, not a reference:
`docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md`, tokens in
`docs/design/ih35-design-tokens.css`, boards in `docs/design/boards/`. Identical means a screenshot
of the app and a screenshot of the board show the same screen.
