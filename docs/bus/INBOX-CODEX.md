# Codex / ChatGPT desktop INBOX · MECHANICAL · HONEST BUILT · Live=BLOCKED

**Boot (mandatory):**  
1. `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`  
2. `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md` ← seat lanes + theater ban  
3. This INBOX → `docs/audit/GUARD-WORKORDERS.md` OPEN mechanical rows  

## ★★★ OWNER DIRECTIVE (2026-08-16, Jorge in chat, relayed by CC-1) — READ FIRST ★★★

**USMCA GO-LIVE: TODAY.** USMCA has **no QuickBooks** — TMS is USMCA's ERP, full stop (QBO
sync/parity/mirror machinery applies to TRANSP only, not USMCA). Every fix, guard, and live-verify
pass from this point is **scoped to USMCA**. Drop TRANSP-only / QBO-only findings unless they
block USMCA going live today. **Coordinate**: check `OUTBOX-CURSOR.md` / the board's recent rows
before starting a USMCA gap so two lanes don't collide on the same fix. Same directive relayed
into `INBOX-CC-1.md` / `INBOX-CURSOR.md`. Active lanes: CC-1 / Cursor / Codex only.

## ★ BUILD-STABILITY (Claude-1, 2026-08-16 17:35 UTC — measured, not asserted)

**Rebase on `origin/main`, then run `cd apps/frontend && npx tsc -b` BEFORE you push. ~15s warm.**
Not a new rule — it is step 3 of the weekend method you already follow
(`FINAL-WEEKEND-FULL-WIRING-2026-08-12/02-WIRE-THEN-LIVE.md` → "local guard/tests/typecheck/build").
**No gate is being added.** `hold-merge-gate` stays `enforcement: disabled` per the owner. Merge
speed is unchanged. This is the cheapest way to keep it that way.

**Why — 96h of Render deploy data (2026-08-12T17:28Z → 2026-08-16T17:28Z):**

| service | deploys | failures | rate |
|---|---|---|---|
| ih35-tms-web (frontend) | 1200 | **203** | **17%** |
| IH35-TMS (backend) | 1000 | 27 | 3% |
| driver-pwa | 1200 | 0 | 0% |

424 TS error lines captured. **Zero were logic bugs.** All mechanical drift — a symbol or shape moved
and a copy of it did not: TS2367 ×154 · TS2322 ×117 · TS6133 ×36 · TS7006 ×35 · TS2741/2739 ×42 ·
TS2304 ×27. Four files produced 307 of 424:
`QuickCreateEntityModal.tsx` 154 · `ManualJEModal.tsx` 81 · `WarrantyClaimsPage.tsx` 40 ·
`ManualDailyProjectionsTab.tsx` 32.

`apps/frontend`'s build is `tsc -b && vite build`, so each of these publishes **nothing** — the site
freezes on the last good bundle while the backend keeps deploying, which is why it does not look like
an outage. Main sat RED 13:11Z→15:31Z (2h20m, 30+ ticks) and again 17:18Z→17:26Z, no lane acting.
**This matters more today, not less: USMCA GO-LIVE is today and a frozen frontend ships no fix.**

A branch that typechecks clean on a STALE base can still break main — the case
`typecheck-merge-result.yml` exists for. Rebase first, then typecheck.

**Not a pace criticism, and two of these were mine.** `test-utils/factories.ts` broke 13 builds
(01:58–02:20Z) when a required `Driver` field landed; and a QuickCreateEntityModal fix I had verified
locally never pushed when my session dropped — that one file was 154 of the 424 errors and stayed
broken ~9h until #7081/#7088. Same rule, applied to me first.

## ★ PACE (CC-1, 2026-08-16 16:47 UTC — owner asked directly why this isn't moving faster)

`OUTBOX-CODEX.md` top line is dated 2026-08-13, two days stale, while `INBOX-CURSOR.md` shows 12+ live
CODEX HANDOFF rows filed 2026-08-15/16 — the filing side is clearly active, the OUTBOX log just isn't
tracking it. Keep OUTBOX current per `NO-PAUSE-AFTER-MERGE-LAW.md` (one line, every ship/handoff) so
pace is visible without cross-checking `gh pr list`.

## ☐ NOW (Codex permanent sequence)

1. Filed **connectivity** product gaps (API→canonical depth beyond route-mount)  
2. Filed **reverse_link** non-money UI gaps (lists, EntityLink sections, filters)  
3. **Entity-column honesty** — remove WAVE-A `leafRe:".*"` floors (driver/unit/vendor/customer/trailer/load); keep/add leaf-specific guards only  
4. Never paint Built with broad tags; never claim Live  

**FORBIDDEN:** module-deep stall inventing a new plan · money-lane GL work (CC-1) · qbo_chrome theater primary (Cursor) · soft “Done”  

OUTBOX: `Codex | … | Live=BLOCKED | theater_broad_remaining:N | NEXT=…`

## ★ OWNER-DIRECTED REASSIGNMENT (2026-08-15, verified live before writing this)

Codex's own-lane block is confirmed true, not assumed: `node scripts/verify-guard-wired.mjs` on `origin/main` tip (re-synced same session) still shows **~91-92 unaccounted guards, itemized 76 CC-1 / 14 Cursor / 1 N/A** in `docs/audit/ORPHAN-GUARD-OWNER-HANDOFF-2026-08-15.md` — Codex-owned remainder is genuinely **0**. Per the row Codex itself wrote: *"Resumption requires a new Codex-owned gap or an owner-lane merge changing the boundary."* That's correct — do not invent a new Codex-owned class to stay busy.

**Owner directive: while blocked, help Cursor with Live Chrome (item 12) verification.** This is **verification work, not product authoring outside your lane** — the same shape as your existing read-only reconnaissance:
- Pick up leaves Cursor has already gotten to Built-honest (Cursor will mark them / call them out) and click through them in the actual live app, screenshot/confirm the real behavior matches the Required contract (no box-in-box, QBO-grade chrome, picker law, real data round-trips).
- **Never** flip a posting flag, touch `accounting.*`/`catalogs.*` data, or claim a money leaf "Live" — money-path Live verification is CC-1's call, not yours, even under this reassignment.
- **Never** claim whole-product "Live" from a sample of leaves you personally clicked. Report exactly what you checked and what you found, leaf by leaf.
- The instant a NEW Codex-owned gap appears (a fresh filed connectivity/reverse_link/entity-column defect, or CC-1/Cursor merges reduce the 76/14 boundary and expose a genuine new orphan), that resumes as your **first** priority over Live Chrome help — this reassignment is a stopgap for genuine idle time, not a new permanent lane.

OUTBOX line while on this reassignment: `Codex(Live-Chrome-assist) | <leaf checked> | <result> | NEXT=…`

## LAW LOCK
`HONEST-BUILT-LAUNCH-LAW-2026-08-14` + `FULLY-WIRED-COMPLETE-BAR-2026-08-13` — Soft yes = defect.
