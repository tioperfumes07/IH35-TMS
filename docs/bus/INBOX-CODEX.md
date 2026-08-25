# INBOX-CODEX · 9226

**09:40 CT GO NOW.** Hard-reload **`a80afec`**. Trailer_swap + fuel + breakdown **Complete** — do not remake. **NOW:** `hop.assign` (Merged — driver bill/rate). `scenario.settlement` is **CC-1** (`LV-PAY-SETTLE-NOPOST`) — do not duplicate. `scenario.deductions` if still Merged after CC-1. Accident/insurance only if real. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-0940.md`. Never `trigger_deploy`. Never restamp U14.

**23:50 CT GO NOW — FINISH SCENARIOS.** Hard-reload **`c6f70e3`**. Load `065538c8-…`. **NOW:** `scenario.trailer_swap` (keep previous trailer) · A7 diesel on **T-LIVE** `1a3c98da-…` with `load_id` (`scenario.fuel`) · hops 2–5 if `--` · then `scenario.settlement` + `scenario.advance` on D1. Do **not** remake breakdown_relay (LIVE CLOSED). Do **not** fake accident. Print dispatch sheet. FINDING if card `--`. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2350.md`. Never `trigger_deploy`. Never restamp U14.

**23:32 CT GO NOW.** Deploy in flight — **never `trigger_deploy`.** After healthz=`6c465b2`: prove `scenario.trailer_swap` + A7 diesel on T-LIVE load `065538c8-…`. Unique FINDING if card `--`. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2332.md`. Never restamp U14.

**22:34 CT GO.** Live `20c02fd` (your trailer-swap tip). Prove `scenario.trailer_swap` + accident spawn-WO live. A7 diesel on T-LIVE for load `065538c8-…`. Program cards must update. Invoice#=load# is CC-1. Never `trigger_deploy`. Never restamp U14.

**22:18 CT GO — FIXER then TEST remaining battery hops.** Hard-reload `20c02fd`.

**NOW:**
1. After SHA moves: live-prove `SAF-ACCIDENT-SPAWN-WO` claim+load FKs and `scenario.trailer_swap` (previous trailer kept). OUTBOX UUID + Program key.
2. Continue hops **2–5** + A7 diesel on **T-LIVE** tagged to load `065538c8-…`. If Program card stays `--`, file FINDING (probe), do not restamp U14.
3. Next unique 500/dead/silent/missing FK only.

**GO NOW 17:45 CT — idle 45+ min. Do not wait.** 20 hops: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-1740.md`. Port 9226. Hops 2–5 + T-DEAD≠T-LIVE + dispatch-sheet print. Never `trigger_deploy`. Never remake CLASS-F5973. Never restamp U14.

**GO NOW 16:36 CT — not blocked on Cursor.** Hops 2–5 + breakdown relay TESTs. `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-1636.md`. #15601 ≠ Fully-Wired 1–12.

**THIS HOUR:** `docs/lockdown/PROGRAM-SCENARIO-MATRIX-CONNECTIVITY-PROOF-2026-08-24.md` + `docs/lockdown/COMPLICATED-SCENARIO-BATTERY-AND-PRINTABLE-PROOF-2026-08-24.md`

**NOW:** Hops **2–5** + **`scenario.breakdown_relay`** (T-DEAD → T-LIVE on same load) + `scenario.trailer_swap` + fuel/settlement/WO + `driver_onboarding` `advance` `deductions` `escrow` `accident` `insurance`. Print dispatch sheet + WO. Prove assignment history unit swap. JEs on fuel/settlement.

Matrix `?module=drivers` `?module=fleet` `?module=safety` `?module=fuel`. CREATE labeled TEST driver/unit/WO. Prove FKs both ways. Settlement/fuel money **must JE** (posting LIVE). QBO/TRANSP/TRK stay OFF.

Unique 500/dead/silent FAST-MERGE. Never restamp U14. Never remake fuel CLASS-F5973. Never `trigger_deploy`.

OUTBOX: `Codex | ACK | PROGRAM-SCENARIO-PROOF | PORT=9226 | NOW=/program | GO`
