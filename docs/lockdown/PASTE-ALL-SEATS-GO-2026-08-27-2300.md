# GO-2300 · 2026-08-27 23:00 CT · OWNER TYPED B · IMPLEMENT EVENT 2

**THIS IS NOW.** Supersedes GO-2228 “blocked on A/B/C”. Law: `docs/lockdown/OWNER-DECISION-ACCT-F5692-OPTION-B-2026-08-27.md`.

ACK this turn:
- `CC-1 | ACK | GO-2300 | PORT=9223 | NOW=OPTION-B-EVENT2 | GO`
- `Cursor | ACK | GO-2300 | PORT=9222 | NOW=wave0-bind-4plus3 | GO`
- `CC-2 | ACK | GO-2300 | PORT=9224 | NOW=ledger-detectors | GO`
- `CC-3 | ACK | GO-2300 | PORT=9225 | NOW=/lists | GO`
- `Codex | ACK | GO-2300 | PORT=9226 | NOW=/customers | GO`
- `CASCADE | ACK | GO-2300 | NOW=lifecycle-slice | GO`
- `Devin-A | ACK | GO-2300 | NOW=/customers | GO`
- `Devin | ACK | GO-2300 | NOW=/vendors | GO`

Idle = defect. USMCA only. KEEP TEST. Never recertify U14. CC never `trigger_deploy`.

## Why prior scenarios did not close the books (read once)

Chrome + Book Load + invoice on TRANSP, then USMCA, did **not** post Event 2 A/R. The POD gate had **0** approved rows. Those walks proved create→canonical, not the receivable. B fixes the gate. TRANSP is not the launch entity.

## Seat NOW

| Seat | NOW |
|---|---|
| **CC-1** | Implement **B** (reuse `buildBillEvent2Postings`). Then void Event-2 reverse + unapplied-off-1100 + role UNIQUE. Exact steps in the Option B law file. **No new A/R poster.** |
| **Cursor** | Wave 0: C25/C27/C28/C31 on posting leaves; C26/C29/C30 on `economics.invariants` only; scenario.ap/dispatch declare; specific accident/claim/policy/legal_matter binds; safety/lists header honesty. **Do not bind all seven to 217 leaves.** Lead + deploy 5–10. |
| **CC-2** | Fail-first ledger detectors (1150+1090+clearing). No human close. Claim ≡3. |
| **CC-3** | Lists/legal unique chrome. Ledger Health UI later (after CC-2 table). |
| **Codex** | Unique leftover customers→drivers→fleet. No GL. No U14 restamp. |
| **Cascade** | One USMCA lifecycle **after** B is live: deliver + issue invoice + JE lines. Unique FINDING only. |
| **Devin-A / Devin** | `/customers` / `/vendors` unique. Not PARKED. |

LAUNCH-SAFE still requires B live + ar_diff $0.00 + void reverse + unapplied. **28 modules FULLY COMPLETE is not this GO.**
