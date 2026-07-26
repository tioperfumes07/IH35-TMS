# PRE-BLOCK OWNER QUESTIONS LAW (2026-07-26)

**Owner:** Jorge · **Binding for Cursor · Claude · Devin**

Jorge does **not** review PRs or click merge labels.  
All unanswered owner questions must be settled **before** implementation starts.

---

## 1. When to ask

| When | Who asks | What |
|---|---|---|
| **Block invent / packet inventory** | Claude or Cursor (planner) | Scan module for NEW SPEC / open decisions |
| **Before first code commit** | Builder | If any unanswered → STOP and ask Jorge once |
| **During PR / merge** | Nobody | Do not re-ask locked decisions; do not block on `JORGE-APPROVED` |

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

**Not** unanswered: “may we merge this PR?” / “please click JORGE-APPROVED.”

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

## 5. Merge

Devin merges on CI green.  
`hold-merge-gate` does not require owner label (firewall-only hard fail remains).  
Neon apply: Cursor/Claude under owner standing “prepare then apply,” or Jorge says apply once per packet.
