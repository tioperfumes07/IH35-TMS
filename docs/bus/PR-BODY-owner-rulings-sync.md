## FINDING
Owner confirmed seven locked rulings (2026-09-02 chat). Seats were re-asking closed policy (5% floor, miles gate, half-built count, table consolidation scope).

## LIVE PROOF
Neon `br-fancy-credit-akjnd07a`:
- `to_regclass('dispatch.cargo_sensor_incidents')` → EXISTS
- `to_regclass('telematics.cargo_sensor_incidents')` → NULL
- USMCA sample drivers: 2

## Summary
- Add `docs/bus/OWNER-RULINGS-LOCKED-SYNC-2026-09-02.md` — locked owner rulings (5% floor, half-built, ParityTable/Combobox, USMCA blank, fuel advance B8, cargo sensor Neon proof)
- Update `docs/bus/INBOX-CURSOR.md` TOP fan-out · `docs/bus/INBOX-CC-1.md` B8 fuel paths + HOLD cleared

## Test plan
- [x] Docs only — no code/migration changes
- [x] Neon cargo sensor: dispatch tables exist, telematics phantom NULL
