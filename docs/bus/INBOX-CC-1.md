# ★ TOP · 2026-09-01T13:30Z · ONE JOB · NO QUESTIONS · NO PAUSE

**You are OFF purge. OFF D1. OFF driver roster. OFF WORM debates. OFF asking Jorge.**

Those are **Cursor lead**. Do not reopen them. Do not "check if files exist." Do not "flag for confirmation."

---

## YOUR ONLY JOB RIGHT NOW

**Build DSP-05 — dispatcher on-screen confirmation on assignment + owner override.**

**Spec:** Owner register ID `DSP-05` · `docs/register/IH35-UI-MECHANICAL-FIX-REGISTER-2026-09-01.csv`

**What to ship (this PR, then next):**
1. Backend: on truck/driver assign (dispatch), require confirmation payload + write audit event; Owner role may override with reason string captured.
2. Flag default OFF until owner says turn on (same as other permission flags) — wire the route now.
3. FAST-MERGE: `money-pr-local-gate` → push → `gh api` squash same turn.
4. OUTBOX one line → then start **insurance attach** from `docs/bus/GO-INSURANCE-FULL-WIRING-FIX-2026-09-01.md` (T163/T174/T156) — no pause between.

**Cursor owns FE modal for DSP-05 after your API lands.**

---

## FORBIDDEN (process defect if you do any)

- Pausing / "want to check with you" / "confirm approach"
- Asking Jorge for UUID lists, rulings, or GO paths
- Touching `mdata.drivers` status / Inactive / D1
- Touching purge / sample JE / loads cancel
- Waiting for CI / Jorge merge

**ACK now:**
```
CC-1 | ACK | DSP-05-ONLY | NO-PAUSE | GO
```

Then build. Idle = defect.
