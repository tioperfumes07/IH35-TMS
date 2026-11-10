# ALL CODERS (CC-1, CC-2, CC-3, Cursor, Codex) — ROUND 8.9 — Owner order: complete all engine builds now
Posted 11-09-2026 10:08 PM CT (2026-11-10 04:08Z) · Lead
Owner, verbatim 10:07 PM CT: "you send instructions to coders, not me, i am not messenger. use tiered model, fast merge law, fast 4. minute weekend merge method. you and all coders. if testing in local and pass. do not drift, do not deviate, complete all engine builds now."

The bus is the only channel; the owner does not relay. Every seat reads docs/bus/lead/ on every cycle and executes its rounds without waiting.

LAW for every seat, tonight:
1. FAST 4-MINUTE MERGE (ROUND 8.6): local gate + your tests + touched verify-steps pass → push → PR → merge immediately. Money/migrations: Neon fork first.
2. TIERED MODEL: money, settlements, GL, migrations and guards on the strongest model. UI wiring, docs, tests and status refresh on the faster tier.
3. NO DRIFT: USMCA only. TRANSPORTATION/TRUCKING frozen. No QuickBooks sync of any kind. Engines only, never raw money SQL. Signed documents win.
4. Compile before merge: `cd apps/frontend && npx tsc --noEmit -p .` = 0; `node scripts/verify-ui-design-system-ratchet.mjs` PASS.

OPEN ROUNDS (execute now, deadline 2026-11-10 12:00Z unless the round says otherwise):
- CC-1: ROUND 8.7 — post signed settlements #5853–#5857, #5859–#5872 exactly as signed. The supersede engine is being built by the Lead lane; its "ENGINE READY" section will be appended to the 8.7 doc. Use it.
- CC-2: ROUND 8.8 — reefer >60 gal reclass (15 postings, $9,379.98) + 99149999 repair.
- CC-3: ROUND 8.3 items still open, plus engine status (docs/bus/lead/11-09-2026-ENGINE-STATUS-MEASURED.md): every engine failing or stale >48h, excluding the 32 QBO engines that are OFF by owner ruling.
- Cursor: ROUND 8.4 design build + 8.4a type scale.
- Codex: ROUND 8.5 parity verifier + 8.5a.
Report in your OUTBOX with proof: PR, sha, live row/screen.

## ROUND 8.9a — LOCAL GATE ADDITION (2026-11-09 10:40 PM CT / 11-10 04:40Z) — ALL CODERS

Measured: main went red twice tonight on UI merges that skipped two ratchets.
- #28764 broke step 10602 (ParityTable row-height pin). Fixed in #28766 `5dd4d04`.
- #28765 added `text-[11px]` and `text-[10px]` to `LoadsReportBoard.tsx`. `raw_font_sizes` went 129 -> 130 and `raw_text_off_locked_scale` went 0 -> 1. Fixed in #28768 `7c177a1`.

Rule, effective now. Any PR touching `apps/frontend/**` must have these exit 0 locally before the fast-merge PUT:
1. `node scripts/verify-ui-design-system-ratchet.mjs`
2. `node scripts/verify-go26-consolidation-ratchet.mjs`
3. `(cd apps/frontend && npx tsc --noEmit -p .)`

Type scale: 11 / 12 / 22 px only. Use `.text-section-header` (11px) or `text-xs` (12px). Never write a raw `text-[Npx]`.

If a ratchet is red on main after your merge, the merging seat fixes it inside 15 minutes. If it does not, Claude-Lead takes the fix.
