# GO-1505 — WAKE + DEPLOY · 2026-08-27 15:05 CT

**THIS IS NOW.** Owner: WAKE THEM UP, LETS GO, DEPLOY.

**Live until land:** `5ecbc67`. **API IN FLIGHT** `dep-da89he4s728c73b4kbug` tip **`282777f`**. Hard-reload when healthz=`282777f`. Nobody else `trigger_deploy` on API. Skip #15546. Never restamp U14. Do not void TEST. TMS ON · QBO OFF.

**SPA:** `ih35-tms-web` **build_failed** on `282777f` — `FuelPlannerHome.tsx:546` TS2322 Combobox `onChange`. Codex owns that file. Do not second-kick SPA until tsc is green.

Ping ≠ ACK. Watching INBOX = idle = defect.

ACK: `SEAT | ACK | GO-1505 | NOW=<id> | SHA=<healthz> | GO`

---

## BOX — CC-1 · 9223

```
SEAT=CC-1 GO-1505 IDLE=DEFECT Never trigger_deploy Never /425c
NOW: hard-reload 282777f. /accounting TEST create (no void). Unique money after grep.
ACK: CC-1 | ACK | GO-1505 | PORT=9223 | NOW=accounting-live-chrome | SHA=<healthz> | GO
```

## BOX — CC-2 · 9224

```
SEAT=CC-2 GO-1505 IDLE=DEFECT Never GL Watching INBOX=defect
NOW: hard-reload 282777f. Unique hunt /reports /cash-flow /finance /tasks. Report N=. Do not remake P&L filter.
ACK: CC-2 | ACK | GO-1505 | PORT=9224 | NOW=unique-hunt-N | SHA=<healthz> | GO
```

## BOX — CC-3 · 9225

```
SEAT=CC-3 GO-1505 IDLE=DEFECT
NOW: Live Chrome #16774/#16776 after API 282777f. Exclusive unique leftover. Do not remake HOS/#16764/#16768.
ACK: CC-3 | ACK | GO-1505 | PORT=9225 | NOW=unique-leftover | SHA=<healthz> | GO
```

## BOX — Codex · 9226

```
SEAT=CODEX GO-1505 IDLE=DEFECT
NOW: FIRST — fix SPA red FuelPlannerHome.tsx:546 Combobox onChange TS2322 (F6907). Then Live Chrome FUEL-F6907 on 282777f. Next silent-cap.
ACK: Codex | ACK | GO-1505 | PORT=9226 | NOW=fuel-planner-tsc | SHA=<healthz> | GO
```

## BOX — Cascade / Devin

```
CASCADE NOW=/dispatch+/driver-hub unique on 282777f. ACK GO-1505. Not ping-only.
DEVIN NOW=/vendors re-prove on 282777f. ACK GO-1505. Not ping-only.
```
