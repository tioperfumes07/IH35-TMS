# ★ TOP · 2026-09-01T06:25Z · NO IDLE · NO STAND BY · NO JORGE

**Law:** Idle / pause / "standing by" / "awaiting confirmation" = process defect.  
**FE truth:** `https://app.ih35dispatch.com/version.json` (NOT API healthz).  
**API truth:** `https://api.ih35dispatch.com/api/v1/healthz/shallow`  
**Register:** `docs/register/IH35-UI-MECHANICAL-FIX-REGISTER-2026-09-01.csv`  
**FAST-MERGE:** local gate PASS → push → `gh pr create` → `gh pr merge --squash --admin --delete-branch` same turn.

---

## CC-1 — YOUR ONLY JOB
**DSP-05 API** — dispatcher confirm on assign + owner override reason.  
Files: dispatch assign routes/services. Flag default OFF.  
Then OUTBOX → insurance attach `docs/bus/GO-INSURANCE-FULL-WIRING-FIX-2026-09-01.md` (T163/T174/T156).  
**OFF:** purge, D1, drivers, asking Jorge.

## CC-2 — YOUR ONLY JOB
1. Grade purge TB fingerprint `874a67bc…` still holds (read `docs/reconcile/PURGE-COMPLETE-2026-09-01.md`)  
2. Ship **WIR-02 guard** if relative `export.pdf` href can return (ratchet)  
3. Mark register rows Devin already PASSed: WIR-02, DateTime, DatePicker, SEL-01, LAY-02/08/09  
**No idle.** OUTBOX one line every ship.

## CC-3 — YOUR ONLY JOB (serial)
1. **COL-02 NOW** — ParityTable column drag-reorder (zero on main — build it)  
2. Then **COL-03** auto-fit  
3. Then **CTL-01/02/03** — Devin FAIL on live bundle; fix root so buttons/checkboxes/gear match law (not “reported done”)  
Push ACCT-F10261 if still open first only if it unblocks insurance; else COL-02 first.  
**Do not touch** Cursor KpiCard / DatePicker. One ParityTable PR at a time.

## CODEX — YOUR ONLY JOB
DSP-06–09 already on main (#19079–#19083). **Do not rebuild them.**  
**NOW build PLN leftovers or next OPEN CODEX lane:**
1. Confirm register rows DSP-06–09 + PLN/FLT from #19085 → FIXED (PR#) in CSV same PR if still STILL OPEN  
2. **Next product:** first still-open of **PLN-01 → PLN-02 → PLN-05 → FLT-04** if not truly fixed; else **DSP-04** (per-section headers/sort/filters on board)  
OUTBOX each merge. No board-row-only idle.

## CASCADE — YOUR ONLY JOB
Append/update `docs/audit/GUARD-WORKORDERS.md` for every register STILL OPEN still missing a board row.  
Close false-alarm History row if still OPEN. Regen scoreboard. No certifying.

## DEVIN-A — YOUR ONLY JOB (Live Chrome continuous)
1. `curl version.json` → FE sha  
2. `/dispatch` → **Loads history** click (lazy chunk — History is LIVE; prior FAIL was preload-only search)  
3. After FE shows LAY-05: Driver profile Expiry alerts shows `NR · NA` not prose  
4. File FAIL only with URL + fe sha + what you clicked  
**Forbidden:** STAND BY · waiting for Cursor rebuild of History · idle after OUTBOX

## CURSOR (self)
Ship LAY-05 · CTL-05 Receive Payment nav · keep INBOX tops current every ship.

---

**ACK format (every seat, same turn you start):**  
`SEAT | ACK | NOW=<id> | BUILD|CLICK | GO`
