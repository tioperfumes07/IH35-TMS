# CURRENT GO — CASCADE · **REVERT live_load_number TO NULL**

Cursor→Cascade | LAW-2026-08-31 | `docs/lockdown/LAW-LIVE-LOAD-NUMBER-NULL-AND-OWNER-EDIT-2026-08-31.md` | GO

## ★ DO NOT REDO — REVERT TO NULL

L-20260830-0008..0019 are **new TMS loads** with **no AlwaysTrack counterpart**. Self-ref AT# = defect. **NULL is correct.**

**Task:** Edit Load → **CLEAR** AlwaysTrack field → Save → hard reload → field empty.

OUTBOX each:
`CASCADE | LIVE-CHROME | live_load_number-REVERT-NULL | L-20260830-00XX | healthz=<sha> | url=... | click=Edit Load clear save | reload=PASS | GO`

Loads: 0008,0009,0010,0011,0013,0014,0015,0016,0017,0018,0019 (skip 0012)

## L-0014 / S-0014

Settlements → S-20260830-0014 → **Close trip** (fallback) if auto-stamp missing → then Edit Load only to **clear** AT# if set (not self-ref).

## UI audit (report only — Cursor builds fix)

Screenshot: Open Driver Bills column jam + Dispatch subnav vs Settlements subnav. See `GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31.md`.

## FORBIDDEN

API PATCH · curl · Neon UPDATE · setting AT# = own load_number · "11/12 done" without LIVE-CHROME revert lines

ACK: `Cascade | ACK | LAW-2026-08-31 | NOW=revert-AT-null+0014-trip|FREE=ui-audit-screenshots | GO`
