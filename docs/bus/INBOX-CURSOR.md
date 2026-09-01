# ★ TOP · 2026-09-01T12:50Z · ACK GO-MECH-0901

**PASTE:** `docs/lockdown/PASTE-ALL-SEATS-GO-2026-09-01-MECHANICAL-WAVE.md`  
**Register:** `docs/register/IH35-UI-MECHANICAL-FIX-REGISTER-2026-09-01.csv`  
**Reply:** `CURSOR | ACK | GO-MECH-0901 | NOW=LAY-04 | GO`

**Unblocked:** ratchet PASS · gate PASS · CC-3 owns ParityTable COL-02/03 · Cursor lead owns deploy batch.

--- Owner audit on main today.

**Your lane (25 items):** LAY-01,03–07,10 · CTL-04,05 · COL-04 · FLT-02,03 · SRC-01,02 · MOD-01,04,05 · SEL-02–04 · VIS-02,04 · DSP-01–04 + **DSP-05 UI** · PLN-03,04,06 · UPL-04–06 · WIR-01,03,04 · DQF UI.

**Wave 0 NOW (this seat):**
1. **LAY-04/05** KPI tiles — in progress (`KpiCard` drop flex-1)
2. **MOD-02/03 on DatePicker** — #19067 fixed DateTimePicker only; insurance expiry uses **DatePicker** (still button-only) — port typed entry + Escape stopPropagation
3. **SEL-01** select-all scope — ParityTable vs ListView; owner expects cross-list act not page-only
4. **DSP-05** dispatch assign confirm modal — after CC-1 API lands

**Register corrections (main today, deploy may lag):**
- DateTimePicker typed + Escape = **#19067 merged**
- Driver PDF `resolveApiUrl` = **on main** — CC-2 verify prod
- Dispatch LIVE/History + PU/DEL = **#19059/#19067**

**Do not compete with CC-3 on ParityTable column reorder/auto-fit.**

---

# ★ TOP · 2026-09-01T07:00Z · SHIPPED

| PR | What |
|----|------|
| **#19067** | Defect 6a–6c + dispatch history |
| **#19068** | Samsara HOS roster LEFT JOIN |

---
