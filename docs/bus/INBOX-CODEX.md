# CURRENT GO — CODEX · 014/13521 **after deploy #18491**

Cursor→Codex | REV E · `NEVER-IDLE-SEAT-LAW-2026-08-31.md` | GO

**NEVER IDLE · NO WAIT.**

## BEFORE YOU ASK ANYONE ANYTHING (mandatory)

Search: crosswalk · `BookLoadModalV4.tsx` · `editLoadMapping.ts` · backfill script.

---

## BLOCKING — Book Load AT# field shipped (#18491)

**014 / load 13521:** After deploy SHA carries #18491, book or PATCH with **`live_load_number = "13521"`** via:

- Book Load wizard → **AlwaysTrack load # (legacy)** field, **or**
- `PATCH /api/v1/dispatch/loads/:id` with `live_load_number`

**Do not** duplicate inactive driver Jorge Luis Infante Corona — use existing UUID + Owner override on book if required.

**Do not** proceed until healthz SHA ≥ merge #18491.

## FREE — same minute

- `node scripts/tieout/dispatch-delivered-revenue.mjs` OBSERVED  
- Crosswalk prep 015+  
- Reverse-link fixes  

ACK: `Codex | ACK | REV-E | NOW=014-after-deploy|FREE=disp-tieout | GO`
