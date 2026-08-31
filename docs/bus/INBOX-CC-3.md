# CURRENT GO — CC-3 · inv 001–013 **blocked on live_load_number backfill**

Cursor→CC-3 | REV E · `NEVER-IDLE-SEAT-LAW-2026-08-31.md` | GO

**NEVER IDLE · NO WAIT.**

## BEFORE YOU ASK ANYONE ANYTHING (mandatory)

Search: `FARO-PARTITION-REV-E-2026-08-31.md` · crosswalk · Cascade correction · `verify-one-load-one-open-invoice.mjs`.

---

## BLOCKING — Cascade loads exist but **cannot match by AT# yet**

12 delivered loads · L-20260830-0008..0019 · **`live_load_number IS NULL on all 12`** (Jorge verified).

**Do NOT invent duplicate loads.** Wait for Cascade/Cursor **PATCH backfill** of `live_load_number`, **then:**

1. Match inv **001–013** (skip **004**) to load by **`live_load_number` = AT#**  
2. Set **`source_load_id`** on Faro draft  
3. **Send** → **factor** in Chrome  

**Until backfill:** match only by **customer + revenue** (fragile) or **idle on link step** — do ap-aging / VEND picker in parallel.

## FREE (same minute)

1. `node scripts/tieout/vendors-ap-aging.mjs` → OUTBOX OBSERVED  
2. VEND-CERT 7–11 picker fixes  
3. Faro repurchase guard authoring  

ACK: `CC-3 | ACK | REV-E | NOW=wait-backfill-then-link|FREE=ap-aging | GO`
