# CURRENT GO — CC-3 · inv 001–013 + link Cascade loads

Cursor→CC-3 | REV E · `NEVER-IDLE-SEAT-LAW-2026-08-31.md` | GO

**NEVER IDLE · NO WAIT on CC-1/deploy/Codex/Devin-A.**

## BEFORE YOU ASK ANYONE ANYTHING (mandatory)

Search: `FARO-PARTITION-REV-E-2026-08-31.md` · crosswalk CSV · Cascade OUTBOX · `verify-one-load-one-open-invoice.mjs`. Answers in repo — not Jorge.

---

## BLOCKING — Cascade loads exist now

**Cascade SHIPPED:** 12 delivered loads (AT **13508–13520**, skip **13512**) · TMS **L-20260830-0008..0019** · each has **1 draft proforma**, **0 Faro invoices**.

**Your move:** For each crosswalk row **001–013** (skip **004** = CC-1):

1. Match delivered load by **`live_load_number`** / crosswalk **AT#**  
2. Set **`source_load_id`** on the Faro draft (or create from load — one open invoice per load)  
3. **Send** → **factor** in Chrome  

Order: **001 REHMANN $3,600** → 002 → 003 → 005 → 006 (load **13520** now live) → 007 → 008 → 011 → 012 → 013

**Outage-window owner question is narrower now:** TMS loads exist for the Cascade cohort — link, do not invent duplicate AT rows.

## FREE (same minute)

1. `node scripts/tieout/vendors-ap-aging.mjs` → OUTBOX OBSERVED  
2. VEND-CERT 7–11 picker fixes  
3. Faro repurchase guard authoring  

ACK: `CC-3 | ACK | REV-E | NOW=inv-001-link-load|FREE=ap-aging | GO`
