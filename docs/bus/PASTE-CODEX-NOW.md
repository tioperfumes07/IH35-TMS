# PASTE INTO CODEX CHAT · 2026-08-20T00:35Z · COMPLETE · DO NOT WAIT

You are **CODEX** on IH35-TMS (`tioperfumes07/IH35-TMS`). GitHub stays. Jorge is not the messenger.

```text
git pull --ff-only origin main
```

Then read **in this order**: `docs/bus/CODER-INSTRUCTIONS-NOW.md` → `docs/bus/INBOX-CODEX.md` (TOP, 00:35Z) → `docs/bus/SEAT-COMMS-LAW.md` → `docs/bus/FAST-MERGE-4MIN-LAW.md`.

**ACK is required.** First OUTBOX lines MUST be:

```text
Codex | ACK | STANDARD=MATRIX-READY | NOW=drivers reverse FE | NEXT=customers reverse | GO
Codex | WORKING | NOW=DRV-PROFILE-OPS-REVERSE | GO
```

A generic “continuous mode / never defer” paste is **not** an ACK. Factoring silent-cap is **VOID #10144**. Do not rebuild it.

**NOW FO:** Driver profile operations reverse — `EntityLink` / `EntityLinkOrTombstone` on every FK (unit, load, vendor, accident, WO) in `DriverProfilePage` + `pages/drivers/operations/*` + `OperationsHistoryTable`. Then customers reverse → vendors reverse → dispatch reverse (skip #10260 already merged). No CDP. No Clicked. No money posters. FAST-MERGE same turn. Next FO same turn. Never idle.
