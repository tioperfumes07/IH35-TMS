# PASTE → CC-2 (wiring / reverse)

FINDING context: MATRIX now has linkage columns `claim` · `work_order` · `accident` · `policy` · `settlement` · `legal_matter` + every modal/drawer as a leaf.

**NOW**
1. Pull main after inventory PR.
2. Wave B: `connectivity` + `reverse_link` on **new leaves** (detail drawers, create modals) — P10 first, then all.
3. Where leaf owes `claim`/`work_order`/… ensure forward FK + reverse section (EntityLink / graph), no memo-only.
4. Live density: do not fabricate claims to green Box 4 — UNVERIFIED if 0 rows.
5. OUTBOX: `column=connectivity|reverse_link|claim|… | Built=+N | NEXT=…`

Forbidden: inventing “scenario-crossing” column — use CONN + REV LINK + later scenario.*.
