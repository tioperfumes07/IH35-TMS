# FARO SHADOW PARTITION — REV E (crosswalk-keyed)

**Status:** **ACTIVE** — supersedes REV D (HOLD — do not execute REV D ranges).

**Partition key:** `docs/lockdown/CODERS-2026-08-30/CC-1/CC-1-FARO-QBO-AT-CROSSWALK.csv`  
**Rule:** **One owner per record.** Owner does **load + invoice + factor** end-to-end when both exist. Never split money on `faro_invoice_no` and Chrome on `at_load_no` independently.

**Gate before inv 014+ create:** `scripts/verify-one-load-one-open-invoice.mjs` on main (step 2424) — **LANDED #18468**. Run guard PASS → create. **CC-3 inv 001–013 may create now** (invoice-only). **Codex/Devin-A: BLOCKING NOW** (not prep-only).

---

## REV D defects (why HOLD)

1. **10 double owners:** Codex inv 012–024 ∩ Devin-A loads 13521–13538 (same crosswalk rows).
2. **11 unowned invoices:** 025, 027–036 · **10 unowned loads:** 13542–13550, 13556.

---

## Seat assignment (REV E)

| Seat | Scope | Mode |
|------|-------|------|
| **CC-1** | **016** + **004/L13512** specimen + settlements 5772 | unchanged |
| **CC-3** | **inv 001–013** (invoice-only — **AT outage window, no loads**) | skip **004** (CC-1) · **no Book Load** |
| **Codex** | **inv 014–024** + loads **13521, 13523, 13526, 13528, 13529, 13532, 13534, 13535, 13536, 13537** | both ends · one owner |
| **Devin-A** | **inv 025, 027–036** + loads **13538, 13542–13550, 13556** | both ends · one owner |
| **Cascade** | loads **13508–13520** only | **loads only — do NOT create Faro invoices** · verify unfactored/009–010 class first |
| **CC-2** | grade + all six tie-outs | no wait |

### CC-3 invoice-only list (collision-free)

001 · 002 · 003 · 005 · 006 · 007 · 008 · 011 · 012 · 013

### Codex end-to-end (first = 014 / load 13521)

| inv | load | customer |
|-----|------|----------|
| 014 | 13521 | CORE LOGISTICS |
| 015 | 13523 | DARDINI |
| 017 | 13528 | SAJACKS |
| 018 | 13529 | DARDINI |
| 019 | 13526 | J RAYL |
| 020 | 13532 | DEL-CAN |
| 021 | 13537 | OSTT |
| 022 | 13534 | DEL-CAN |
| 023 | 13535 | SEMares |
| 024 | 13536 | Prodigee |

### Devin-A end-to-end (first = 025 / load 13538)

| inv | load | customer |
|-----|------|----------|
| 025 | 13538 | Jericho |
| 027 | 13543 | PFL |
| 028 | 13544 | Hawkeye |
| 029 | 13542 | Simple Logistics |
| 030 | 13545 | Jerue |
| 031 | 13546 | Jerue |
| 032 | 13547 | Jerue |
| 033 | 13548 | MPH |
| 034 | 13549 | R2X |
| 035 | 13550 | SEMares |
| 036 | 13556 | Hummingbird |

### Cascade — loads without Faro invoice on crosswalk (verify before book)

13508 · 13510 · 13511 · 13513 · 13514 · 13516 · 13517 · 13518 · 13519 · 13520 — map to inv 001–013 **outage window** on crosswalk. **Cascade books/delivers only; CC-3 owns invoices.**

---

## Forbidden

- REV D ranges · two owners on one crosswalk row · Cascade inventing Faro invoices · create before `one-load-one-open-invoice` on main
