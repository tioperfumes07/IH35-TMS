# PRE-BLOCK OWNER QUESTIONS LAW (2026-07-26; §5 Merge superseded 2026-08-03)

**Owner:** Jorge · **Binding for Cursor · Claude · Devin · Cascade**

**OWNER LAW (2026-08-03, FINAL):** NO HOLDS, NO owner-approval merge label — every coder has FULL Neon access
and merge authority in every lane. See `.cursor/rules/00-operating-method-LAW.mdc` (governance section).
§5 below is updated to match; the rest of this file (front-load questions, never re-ask at merge) is unchanged.

Jorge does **not** review PRs or click merge labels.  
All unanswered owner questions must be settled **before** implementation starts.

---

## 1. When to ask

| When | Who asks | What |
|---|---|---|
| **Block invent / packet inventory** | Claude or Cursor (planner) | Scan module for NEW SPEC / open decisions |
| **Before first code commit** | Builder | If any unanswered → STOP and ask Jorge once |
| **During PR / merge** | Nobody | Do not re-ask locked decisions; do not block on owner-approval merge label |

---

## 2. How to inventory (accounting, banking, any module)

For each pending block in the packet, fill:

```text
BLOCK: <id>
MODULE: <name>
LOCKED ALREADY (cite 00_LOCKED_DECISIONS / packet / prior Jorge line):
- …
UNANSWERED (must ask Jorge BEFORE code — or write "None"):
- Q1: …
- Q2: …
IF NONE: Proceeding under locked law. No Jorge PR label required.
```

Run this as a **batch** per module (all ACCT-DOM / all BANK-DOM / all Safety) — not one surprise question mid-PR.

---

## 3. What counts as unanswered

- New money behavior not in `00_LOCKED_DECISIONS.md` or the packet  
- New GL account / role designation  
- Flag ON vs OFF for a new posting path  
- Entity which books what (TRANSP/TRK/USMCA) when not already in entity-facts  
- Soft-delete vs void policy when not locked  

**Not** unanswered: “may we merge this PR?” / “please click owner-approval merge label.”

---

## 4. Known open inventory (update as closed)

| Block | Unanswered | Status |
|---|---|---|
| ACCT-DOM-01 JE approval + SOD | D1–D6 in design PR | **ASK BEFORE implement** — design may be merged; implement waits on answers |
| BANK-DOM-05 intercompany | None if packet + entity-facts followed | Proceed HOLD build |
| BANK-DOM-06 fuel + overage | None if §10.3 fuel chain + poster reuse + flag OFF | Proceed HOLD build |
| Already-applied Neon 7 + BANK-DOM-01 | None | Merge only |

Add rows when a module inventory finds more. Close rows when Jorge answers in writing.

---

## 5. Merge (OWNER LAW 2026-08-03, FINAL)

Every coder (Cursor, Claude, Devin, Cascade) merges its own work on CI green — no role split, no owner gate.  
`hold-merge-gate` label check is DELETED (firewall-only hard fail remains).  
Neon apply: every coder prepares AND applies themselves, standing order — no waiting for Jorge to say "apply."
