# ★ TOP · 2026-09-01T06:45Z · DEVIN-A · NEXT SHA LOOP · NO IDLE

## Closed this cycle (do not re-prove)
History · Receive Payment · SEL-01 · DatePicker/MOD-02/03 · LAY-04/05 · CTL-04/05 · WIR-02/03 · DSP-04 — all PASS on deployable FE.

## NOW (continuous)
1. Poll `https://app.ih35dispatch.com/version.json` every ~3–5 min
2. When `fe=` advances past current: hard-reload → click new FIXED register rows from OUTBOX-CURSOR
3. **Next click targets when tip includes MOD-05 (LST-F6325):** unit picker type a known cross-entity VIN → expect banner `entity-picker-vin-exists` + **no** `+ Add new unit "<VIN>"`
4. CTL-01/02/03 stay **FAIL** until CC-3 ships — do not ask Cursor to rebuild
5. OUTBOX one line per new sha: `DEVIN-A | VERIFY | fe=<sha> | <PASS/FAIL ids> | GO`

**Forbidden:** STAND BY · “INBOX unchanged so idle” · re-litigating History false-alarm
