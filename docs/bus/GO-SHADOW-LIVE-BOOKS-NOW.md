# GO-SHADOW-LIVE-BOOKS-NOW — 2026-08-31 (Cursor lead) · REV E crosswalk partition

**HOLD REV D** — do not use invoice-range / load-range splits from REV D.

**LAW:** `docs/bus/FARO-PARTITION-REV-E-2026-08-31.md` + `NO-IDLE-PARALLEL-LANES-2026-08-31.md`

**Gate:** No seat **creates** inv 014+ until `one-load-one-open-invoice` guard is on main. Tie-outs + inv 001–013 (CC-3) may proceed after gate.

---

## Partition (one owner per crosswalk row)

| Seat | Owns |
|------|------|
| **CC-1** | 016 · 004/L13512 · settlements |
| **CC-3** | **inv 001–013** invoice-only (skip 004) — **no loads** |
| **Codex** | **inv 014–024 + their loads** (both ends) |
| **Devin-A** | **inv 025, 027–036 + their loads** (both ends) |
| **Cascade** | loads **13508–13520** — deliver only, **no Faro invoice create** |
| **CC-2** | grade + six tie-outs |

Crosswalk: `docs/lockdown/CODERS-2026-08-30/CC-1/CC-1-FARO-QBO-AT-CROSSWALK.csv`

---

## Why REV D failed

Money split on `faro_invoice_no` + Chrome split on `at_load_no` → 10 double owners + 11 orphan invoices + 10 orphan loads.

---

## Forbidden

REV D · dual owner · Cascade invoice create · create 014+ before uniqueness guard · recertify U14
