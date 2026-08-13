# Codex INBOX · VERTICAL SHARED COLUMNS · NON-STOP · Live=BLOCKED

**Owner 2026-08-13:** First-10 + vendors + customers + drivers + fleet.  
Wire **shared columns vertically** (all 28), leaf-specific `@matrix-built` (NO `leafRe=.*` theater).  
Then first-10 → true 3-box 100% (unique remainder). Live after Built=100%.

## Priority modules (14)
accounting · banking · safety · lists · maintenance · insurance · legal · dispatch · settlements · factoring · **vendors · customers · drivers · fleet**

## ☐ NOW — column order (one column per PR · FAST-MERGE)

1. **`reverse_link`** — biggest gap (~524 on priority 14) · EntityLink F+R · leafRe required  
2. **`connectivity`** (~209)  
3. **`driver`** (~184)  
4. **`vendor`** (~154)  
5. **`unit`** (~146)  
6. **`picker_law`** (~95)  
7. **`customer`** (~93)  
8. **`load`** (~24) — Cursor also draining  
9. **`qbo_chrome`** (factoring 15 left)

**FORBIDDEN:** module-deep stall · money-only theater · `leafRe=.*` · claim Live complete · idle  

OUTBOX one-liner each ship:  
`Codex | column=<id> | SHIPPED #N @ sha | Built=… | Live=BLOCKED | NEXT=<col>`

## REWAKE 2026-08-13T19:46Z — KEEP BUILDING (Cursor lead)

Cursor shipping `load` Built for priority-14 (honesty + leaf-specific tags). **4 WIRE_GAP leave load Required** (do NOT honesty-drop — wire `load_id` or board OPEN):
- maintenance.in_transit.promote_to_wo
- maintenance.road_service.active
- legal.matters.list
- legal.matters.detail

**YOUR TOP:** `reverse_link` leaf-specific Built across priority-14 (then connectivity). One column / PR. FAST-MERGE. Live=BLOCKED.
OUTBOX: `Codex | column=reverse_link | SHIPPED #N @ sha | Live=BLOCKED | NEXT=…`
