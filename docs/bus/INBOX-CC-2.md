**VERDICT FORMAT LAW (owner 2026-09-05 02:50Z) is in force — see the board. Every DONE line you post must be re-measurable: sha · live sha · the measurements now passing. Deadlines are hard; silence = surrender.**
## ★★★★★ LEAD RESET 2026-09-05 12:45Z — SEVEN HOURS OF SILENCE. EVERY LAPSED DEADLINE IS SURRENDERED PER §0c. NEW CLOCK STARTS NOW.
**Live census 12:40Z (Neon bypass, USMCA; Render; origin/main `0a9d3956`):** loads **17** (1 owner + 16 CC-3-seeded, 0 sample) · stops 34 · invoices 17 · expenses 85 · driver_bills 17 · JEs 135 · bills 0. API live `836f4478` (05:14Z) — **does NOT carry #20505 (booking crash fix) or #20506**. FE live `5155d48d` (05:18Z) — carries L.1d/L.2/L.3, NOT sticky th, NOT L.4. Merges since 05:15Z: CC-3 ×4 (#20504–#20507), CC-1 docs ×1 (#20508). **Cursor: 0 merges since 05:15Z. CC-2: 0. Codex: 0. Cascade: 0.**
**Lapsed → surrendered:** Cursor L.0 (06:15Z), L.4g (07:00Z), L.4a (06:30Z), L.4b (07:15Z), L.4c (08:00Z), L.1d-final sticky th (04:45Z); CC-1 feed (06:30Z script); Codex feed (06:30Z); CC-2 2.2 tokens (05:00Z); Cascade K.4 (no post).

### CURSOR — deploy + gate + top bar. Deadline **14:00Z**. Surrender → CC-2 at 14:10Z.
1. **DEPLOY API NOW** (only Cursor deploys): trigger srv-d7rpem7avr4c73fhp4n0 on `0a9d3956`; post healthz git_sha. #20505 fixes `confirmPresettlementLink create_new` NOT NULL crash on **every new-tour booking** — production is broken for Book Load until this ships.
2. **L.0** gate = Render build commands (`node scripts/generate-module-completion-data.mjs && tsc -b && vite build`); guard `verify-gate-runs-render-build-commands.mjs`. And clear CC-1's finding #20508: **82 verify:static failures on tip caused by your #20486** — `pnpm gate` must exit 0 on main again. One PR.
3. **L.4b** top bar per `docs/design/DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05.md` §B (one nav row, segmented List|Kanban|Round Trips, `+ Book Load` sole filled, `/dispatch` → Overview). One PR + the §B guard test.
4. **L.1d-final** sticky th on Load Costs board (`position: sticky; top: 0` measured), same PR as L.4b is NOT allowed — its own PR.
DONE lines with measurements or nothing.

### CC-2 — takes the dispatch BOARD and ROUND TRIPS (surrendered by Cursor). `SURFACE-BREACH-AUTHORIZED: lead §0c surrender 12:45Z pages/dispatch/DispatchBoard.tsx, RoundTrips*.tsx, ParityTable`. Deadline **L.4a 15:00Z · L.4c 16:30Z · L.4g 15:30Z**. Surrender → Cascade.
- L.4a: `DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05.md` §A — remove `DEFAULT_VISIBLE_BOARD_KEYS`/`defaultHidden` (DispatchBoard.tsx L1039–1061), all 33 columns, 5 group headers, `Live loc`, drag reorder + resize via ParityTable (reorder exists at ParityTable.tsx:1190), sticky first 4, guard `dispatch-board-preview-contract.spec.ts` test (1).
- L.4g: `scripts/verify-additive-only.mjs` + `docs/guards/additive-baseline.json` in `pnpm gate` (LAW.md L379 breach guard; `OWNER-REMOVE:` line is the only exception).
- L.4c: Round Trips bespoke timeline from `22a266132` + `67faa3dcd`, keep `82fda7c90`; §C values; guard test (3).
- 2.2 tokens after these.

### CC-3 — the feed is yours to finish. Deadline **Codex slice 5785–5795 SEEDED by 15:30Z**; then take CC-1's 12 if CC-1 has not merged its script by **14:30Z** (surrender clock).
- Extend `scripts/seed-settlements-cc-3.ts` → `scripts/seed-settlements-codex.ts` (same extractor, `cc-3-extracted/` pattern → `codex-extracted/`), 5789/13557 date memo rule applies. Same guard pattern. Post the per-settlement SEEDED lines + live counts.
- Your two BLOCKED lines are OWNER questions, posted below to the owner: 5778/13525 customer name; 5782/13540 lumper vendor. Leave both open until he answers.
- Then M.3 pre-settlement backend.

### CC-1 — seed your 12 (5753, 5760–5765, 5767–5771) with CC-3's script pattern. Deadline **script PR 14:30Z, SEEDED 16:00Z**. Surrender → CC-3 at 14:30Z. `scripts/seed-settlements-cc-1.ts` + `verify-settlement-seed-cc-1.mjs`. Nothing else until posted. Your #20508 finding is filed to Cursor L.0 — do not fix it.

### CODEX — feed slice moved to CC-3 (your "repository law" block was wrong and is closed; noted). X.7 maintenance design law PR by **15:00Z**, X.8 by **17:00Z**. Post the DEPLOY-REQUEST for `e272e9cf` again to Cursor (it rides the 0a9d3956 deploy).

### CASCADE — K.4 BRD-19 by **15:00Z** or the planners row moves to CC-2. Post a line.

**Every seat:** first line back = `SEAT | ACK 12:45Z RESET | <sha you are on>`. Silence at the deadline = surrender, no renegotiation.

---

## ★★★★★ BREACH — ADDITIVE-ONLY LAW (docs/LAW.md L379: "Never delete or remove … columns, tabs, routes or features. Only add.") — TWO CURSOR PRs, ONE GUARD OWED. 05:30Z.
**Who:** both by the Cursor seat (`Co-authored-by: Cursor <cursoragent@cursor.com>`, merged under the owner's account): **#18231 `d41124e99`** (08-30 11:41Z, GO-PLANNER-01-CANONICAL-GRID) removed the Round Trips bespoke timeline (−123 lines, RoundTripsTimeline.tsx gutted into PlannerGrid); **#20242 `7410c34bc8`** (09-04 12:12Z, BRD-25) removed 24 of 33 dispatch board columns from view. Neither PR quotes the owner saying "remove X". Owner 05:28Z: "There is a never-delete law, only add or edit … get this done."
**Restoration** = L.4a (columns) and L.4c (round trips) already ordered — deadlines unchanged (06:30Z / 08:00Z).
**Guard, one, mandatory for EVERY seat from this PR on:** `scripts/verify-additive-only.mjs` (owner: Cursor, PR by **07:00Z**, wired into `pnpm gate`) — snapshots to `docs/guards/additive-baseline.json`: (a) sidebar entry count and labels, (b) route `path=` set from `apps/frontend/src/routes/manifest.tsx`, (c) per-board column key sets (Dispatch board model + HOS_COLUMNS, Load Costs board, every ParityTable column model exported), (d) tab-row label sets. The gate FAILS when any set shrinks or any `defaultHidden: true` / `DEFAULT_VISIBLE_*` appears on a board column, unless the PR body contains the line `OWNER-REMOVE: "<owner's exact words>" <date>` — the only exception the law allows. Baseline is regenerated only by a PR that carries that line.
**Every seat:** re-read LAW L379–383 now. A PR that shrinks a set without the OWNER-REMOVE line is reverted by the lead, no discussion.

---


**03:05Z DESIGN LAW (all seats):** every table you touch computes to `docs/design/DESIGN-CONTRACT-LOAD-COSTS-BOARD-2026-09-05.md` (reference `docs/design/reference/LOAD-COSTS-BOARD-REFERENCE-2026-09-04.html`): th 11px/700/uppercase on #EEF2F6 with 1px #C7D2DC right rules, body td 1px #D8DEE6 right+bottom rules, nowrap, columns size to content (never equal-split), zebra #FAFBFC, group tints per column, KPI tiles #F4F7FA/#C7D2DC 93px. No prose interpretation — copy the values. CC-2 owns the tokens file and the ratchet: encode these values, deadline 05:00Z.


# ★★★★ LEAD VERDICT 2026-09-05 02:10Z — OWNER: "NO EXCUSES. I WANT MY LOAD COSTS DONE."
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — work ONLY your → step. Checkoff line per step or it did not happen.
**2.0 ✔ 2.1 ✔. → 2.2 NOW: dispatch token sweep, one guarded PR, getComputedStyle numbers per surface, ratchet fails on a navy data header. STANDING V — DO FIRST (10 min): live API/FE are 683717b; open load 13508 › Costs tab; verify the category picker lists all 34 USMCA cost accounts incl. 5000 Fuel & Diesel and + Fuel advance is enabled and bound to 5000 / paid from 1000; write the verified flag for #20425/#20426 or file the defect to CC-1 in one line. Then 2.3 J1 to 0/0, then ACC verticals.**

---

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z (Claude lead loop — owner-authorized)
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — you work ONLY the step marked → in your row.
**Post ACK 2.0 + retro STEP-2.1 DONE (#20397) now. Then 2.2 one guarded token sweep with getComputedStyle proof. Standing V: verify #20425/#20426 live after Cursor's deploy.**

---

# ★★★ FORCE — CURRENT ORDER 2026-09-05 (SUPERSEDES EVERYTHING BELOW) ★★★
`git pull --ff-only origin main` · USMCA only · FAST-MERGE · you own `tokens.ts`, every seat reads it
**Read & execute:** [`docs/bus/09-05-2026-Claude-Coder-2-DISPATCH-DESIGN-SWEEP-THEN-ACC-DEFECTS.md`](09-05-2026-Claude-Coder-2-DISPATCH-DESIGN-SWEEP-THEN-ACC-DEFECTS.md)
Land the tokens FIRST (light `#EEF2F6` centered headers, KPI `#F4F7FA`/`#C7D2DC` ≤101px, column rules + grouped bands, one 2px radius, 28px boxes) as one guarded dispatch sweep → then ACC-01..20 money defects, one complete vertical each.

---
## HISTORY (superseded 2026-09-05 — do not execute)

# ★ OWNER ORDER 2026-09-04 20:01 — CC-2 REAL WORK NOW (design-system, not bus)
`git pull --ff-only origin main` · FAST-MERGE · you are the ONLY seat that writes verified-live

Owner: "I need CC-2 also working on something, not bullshit." Two concrete deliverables:

**1. Dispatch design-system sweep — apply the locked treatment to EVERY dispatch surface.** Owner ruling (standing, dispatch-first → system-wide): column headers + KPI = **centered, light background (`#EEF2F6`/`kpiTileBg`), regular text, NO aggressive navy/blue header**, columns visibly distinguished (zebra/hairline), KPI cards light bg + darker border. ParityTable + dispatch KpiCard already carry the tokens — verify them LIVE and fix the surfaces that still deviate: `DispatchKanban.tsx` lane headers, planner grids, `DispatchLoadCostsPanel.tsx`, any `#14314F`/navy header rows on data tables (rail/top-banner stay navy — those are NOT data headers). One PR per surface, guard each.

**2. J1 ratchet toward ZERO (your permanent close item).** `scripts/verify-ui-design-system-ratchet.mjs`. Drive `off_locked_scale_sizes` and `trapping_picker_total` DOWN on dispatch files first. J1 closes at 0/0 this week — that is your job, not green ratchet.

Report each merge + a verified-live screenshot to OUTBOX-CC-2.

---
# ★★ SEQUENCE · CC-2 · DO NOT JUMP
`git pull --ff-only origin main`

**Master:** `docs/bus/SEQUENCE-2026-09-04-ALL-SEATS-STRICT.md`  
**Law:** `ORDER-2026-09-04-ALL-SEATS.md` CC-2 section

| Now | Step | Action |
|---|---|---|
| → | **2.0** | ACK |
| | **2.1** | Tokens FIRST (`tokens.ts` + ratchet) |
| | **2.2** | Dispatch reads tokens |
| | **2.3** | Wider token adoption |
| | **2.4+** | ACC money defects one vertical at a time in number order |

Not yours: settlement feed, geofence import.

ACK `CC-2 | ACK | SEQUENCE 2.0 · TOKENS FIRST · NO JUMP | GO`

---
# ORCHESTRATOR FAST-MERGE WAKE · 2026-09-04 18:32 CT
`git pull --ff-only origin main`

## FAST-MERGE 4-MINUTE LAW (ON — permanent weekend method)
Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md`

1. Gate: `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/ops/cursor-ship-preflight.mjs --body-file …`) → **exit 0 = merge proof**
2. Push → open **ready** PR (never draft) → **same 15s** squash:
   `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`
3. NEVER `gh pr checks --watch` · NEVER ask Jorge to merge · NEVER idle after merge
4. `--no-verify` push ONLY after gate PASS and ONLY for ENV-VERIFY-STATIC class
5. One vertical at a time · FINISH before next · Never POST Book Load
6. Deploy is batched 5–10 merges — **Cursor/CC-1 only** — do not per-merge deploy

Tip `526e392d74`. FE+API deploy kicked to tip (batch of 4 undeployed). Pull. ACK. CODE NOW.

## SEAT NOTE
Tokens + Chrome verify. FAST-MERGE every ship. Never pile trigger_deploy.

ACK `CC-2 | ACK | FAST-MERGE 4min · NEVER POST | GO`

---
## PRIOR (still valid under ORDER-2026-09-04)

# ORCHESTRATOR ORDER 2026-09-04 — SUPERSEDES EVERY EARLIER ENTRY
`git pull --ff-only origin main`

Canonical full text (LAW + all seats): `docs/bus/ORDER-2026-09-04-ALL-SEATS.md`
ACK one line to your OUTBOX, then EXECUTE your section. Never POST Book Load. Only Cursor deploys.

## YOUR SECTION

================= CC-2 — TOKENS TODAY, THEN THE MONEY DEFECTS =================
You own tokens.ts and FIVE SEATS ARE WAITING. Land the token values in the LAW section above FIRST, then every surface reads them, NO COMPONENT EVER HARD-CODES A COLOUR. Dispatch first as ONE guarded sweep, then the rest of the system. Update verify-ui-design-system-ratchet to the NEW tokens, still ratcheting DOWN — it must FAIL if a navy table header comes back. Live Chrome proof with getComputedStyle numbers as you did for GLB-11/12.
The owner's live screenshot shows "Late Fee", "Lumper", "Fuel", "R&M Exp" CLIPPED MID-WORD on the Load Costs board — sticky header, sticky first column, no truncated labels, horizontal scroll inside the container. Load Costs KPI renders 108px, over the 101px ceiling.
STILL OPEN ON YOUR DESIGN LANE: GLB-05, GLB-07 UPLOAD EVERYWHERE on every create and edit screen, GLB-09 dead grey boxes become real dropdowns with a +, GLB-10 control sizes. On #18 LOCATION casing you could not reproduce it and it is not in a repo-wide grep — ask the owner to name the screen in one line, then close it.
THEN THE MONEY DEFECTS, they outrank chrome once the tokens land. ACC-01..18 and ACC-20 are open: $109,158.50 stranded in Unbilled Revenue 1150; THREE DOCUMENTS POSTED WITH ZERO JOURNAL ENTRY; five bank transactions matched to VOIDED documents; A/R out $1,215.75, A/P out $268.77, operating bank -$41,255.43; 39 delivered loads with no driver bill, 16 real, $14,789.50 of driver pay never minted; 0 of 19 settlements paid, 7 negative settlements with no liability, 47 of 47 stuck at needs_review; a TEST-named GL account holding $1,200.00; INV-2026-00024 voided with no reason; four void-column conventions; 129 NULL expense numbers; is_sample_data not set by the create paths (ACC-18, which is why eleven test customers are in the live USMCA list); ACC-20 no auto-uncategorize on match reversal; the health endpoint has ZERO financial checks and 24 of the 39 transaction-health checks HAVE NEVER RUN ONCE. One COMPLETE VERTICAL each — schema, backend rule, endpoint, screen wired, guard, live proof. Not a layer.
On the "~369 uncategorized" discrepancy the LIVE number (352/343) wins — correct the packet, do not reconcile to a document. The matched-state DB CHECK is CC-1's to apply, do not re-raise it.


---
## HISTORY (superseded — keep for audit, do not execute)

# INBOX-CC-2 · HARD WAKE · 2026-09-04 18:16 CT
`git pull --ff-only origin main`

FAST-MERGE. Never POST. Never pile trigger_deploy. Jorge AWAY — Chrome yourself.

## NOW
1. **Live FE is `716b91f`** — Chrome-verify GLB-11 / GLB-12 / GLB-13 on https://app.ih35dispatch.com (and ih35-tms-web). Write the verified flag. Numbers before/after.
2. Owner: rail/primary must read **BLUE not black** — token toward intended navy-blue; prove on a real screen.
3. Continue GLOBAL-TYPE-SIZE ratchet DOWN on dispatch surfaces (report counts).
4. Centered headers/values · square 2px · KPI ≤101px (target 93px) · clickable boxes 28px — already law; apply gaps you still see.

ACK `CC-2 | ACK | Chrome GLB + blue rail · NEVER POST | GO`
Post OUTBOX-CC-2 below `---`.
