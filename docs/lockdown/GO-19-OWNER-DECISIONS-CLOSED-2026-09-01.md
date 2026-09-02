# GO-19 — OWNER DECISIONS CLOSED (Jorge 2026-09-01)

**Status: ANSWERED = CLOSED.** Do not re-ask. Do not list as owner-open. USMCA only. NO-SEAT prod money. Seats NEVER POST Book Load.

**Canonical artifacts:** `docs/lockdown/DECISIONS-AND-THIRTEEN.md` · `docs/lockdown/DECISIONS-AND-THIRTEEN.html`

Supersedes stale owner-open boxes in `docs/bus/PASTE-ALL-SEATS-GO-19-2026-09-01.md`.

---

## 1. Cutover — CLOSED (no opening entry)

**CLOSED.** `cpa_answers.txt` line 245: "The balances are 0." Locked decisions §8.5: USMCA TMS-authoritative from day one. Company cutover 04/01/2026 carves USMCA out. Zero balances + categorize Dec 2025 forward = books from first real txn. **NEVER raise again.**

---

## 2. Company settlement — CLOSED (5753 grain)

**CLOSED.** Design: `/Users/jorgemunoz/Downloads/Company_Settlement_5753.pdf` (5787 also in Downloads).

**Grain:** per settlement **PERIOD**, many loads (5753 covers 13471 and 13480). Mirror of driver settlement. Eight sections. P&L ties to the cent:

`8100 − 73.50 − 1897.95 − 100 − 3491.92 − 121.52 = 2415.11`

Coders build the table now — no further owner decision.

---

## 3. Accessorials — CLOSED (parent_id under 4200)

**CLOSED.** Account 4200 exists; 4210 Detention, 4220 Layover, 4230 Lumper, 4240 TONU already ratified.

**Defect:** four children have NO parent — sit flat beside 4200, P&L five lines, no roll-up. Chart already does this correctly at 4900 → 4910–4980.

**Fix:** ONE migration: four `parent_id` references under 4200. NO new account. CC-1 money serial.

---

## 4. Capitalize — CLOSED at **$7,000** (NEVER $7,500)

**CLOSED.** Owner: "capitalize use the fucking number that was already there" / "$7,000. Done — it was already right."

| Source | Number | Status |
|--------|--------|--------|
| Jorge chat **2026-09-01** | **$7,000** | **WINNING — CLOSED** |
| `cpa_answers.txt` line 300 A4-D6 | $7,000 | locked |
| `capitalize-threshold.ts` | `700_000` | keep |
| `verify-capitalize-threshold-7000.mjs` | $7,000 guard | keep |

**Do NOT change to 7500. Do NOT overwrite written record. Do NOT re-ask Jorge.**

**Real defect:** $7,000 rule is NEVER CALLED. `wo-ap-posting.service.ts` posts via generic category mapping and never reaches `capitalize-threshold.ts`. CC-1 wires after accessorial parent (one money PR at a time).

---

## 5. Escrow / samples / categorization — GO-19-02

**CLOSED.** Folded into GO-19-02. Escrow zeroed by VOID not DELETE (register keeps six rows). Samples quarantined not destroyed. Categorize Dec 2025–Jul 2026 owner-only; seats never invent GL.

---

## 6. Thirteen half-built — Today's Attention

**CLOSED as audit.** Detail: `docs/lockdown/DECISIONS-AND-THIRTEEN.md` · `docs/lockdown/GO-19-THIRTEEN-HALF-BUILT.md`

**P0 one-liner:** 425C score-100 queries `legal.form_425c_filings` (missing); real table `compliance.form_425c_reports`. Header claims warning-on-skip — no warning logged. Cursor/CC-3 can ship 425C fix without stealing CC-1 money lane.

---

## 7. Book Load — Jorge tests; seats never POST

Seats NEVER create loads. NEVER POST Book Load. Jorge types the first Load #.
