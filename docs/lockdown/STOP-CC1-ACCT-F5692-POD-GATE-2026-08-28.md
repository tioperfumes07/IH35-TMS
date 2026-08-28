# STOP CC-1 · THE A/R INSTRUCTION IS WRONG · ACCT-F5692 POD GATE

**Priority: CC-1 must not write an A/R poster.** Verified Cursor 2026-08-28 on prod Neon (`lucia`) + `origin/main@985fdc58` (overlay #16833). Canonical path: this file (not a `claude/` copy).

GO packet: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-27-2228.md`.

---

## 1. Cursor agrees with Claude on the STOP

Both seats previously told CC-1 to restore `DR 1100 / CR 1150`. **That leg was never removed.**

- `buildBillEvent2Postings()` in `apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts` posts **DR `ar_control` / CR `unbilled_revenue`** through `resolveRoleAccount` + `createJournalEntry`.
- Event 2 is gated by **ACCT-F5692** `hasApprovedPodEvidence()` → approved, non-archived `dispatch.pod_documents`.
- Invoice poster **stands down**: `InvoiceRevrecLatchOwnsLoadError` — do not post around the latch.

**If CC-1 bisects 08-10→08-11 or writes a new invoice A/R poster, it recreates ACCT-F59.**

Wave 2.1 bisect is **cancelled**. Wave **2.2 is BLOCKED ON OWNER (A / B / C)**, not on CC-1.

---

## 2. Live numbers Cursor re-ran

| Query | Result |
|---|---|
| `dispatch.pod_documents` count | **0** (approved **0**) |
| Latch `earn` active | **12**, last created **2026-08-25 00:27Z** (Claude’s “08-24” is the same night in CT) |
| Latch `bill` active | **4**, last **2026-08-08** |
| JE `aaad9534-40eb-44ea-a7d2-27c3de96133b` | Exists. Memo is the ACCT-F59 void reversal of INV-00006 / load `L-20260806-…`. **Stale comment in poster.service.ts is wrong.** |

**Writer exists:** `dispatch/pod.routes.ts` INSERTs with `status='pending_review'`, plus a review route that can set `approved`. **Prod has never used it.** Even a capture would not pass Event 2 until approved. Claude’s “nothing writes” is slightly strong; **nothing has ever landed a prod row.**

### Stranded intermediate — two altitudes

Claude’s **$19,025.40** = USMCA **1150 $13,651.00 + 1090 $5,374.40 including `is_sample_data`**. Confirmed.

After #16832 report filter (exclude sample): **1150 $5,551.00 + 1090 $4,154.40 = $9,705.40** on operating books.

`stranded_intermediate` detector must cover **unbilled_revenue (1150), undeposited_funds (1090), and cash_clearing**, and must not mix sample into the operating metric without labeling it.

USMCA **4000** credit-net **$23,646.50 including sample**; **$7,426.50 excluding sample**. The F59 double is reversed either way — the comment still misleads.

---

## 3. Owner policy (LAW-6) — Cursor does not choose

| | Option | Effect |
|---|---|---|
| **A** | Make POD capture + approve real so the gate can pass | Ops build. Does not book A/R on invoices already issued/paid. |
| **B** | Move the gate: A/R on delivery evidence **+ invoice issuance**. POD remains required for **factoring submission** (`has_approved_pod` already). | Fixes going-forward and can re-fire Event 2 for open invoiced loads. Matches QBO / NetSuite / McLeod: bill creates the receivable; POD gates collection/factoring. **Cursor recommendation = B.** |
| **C** | Keep gate; owner per-load override | Manual forever. |

**CC-1 must not implement A, B, or C until Jorge types the letter in chat.**

---

## 4. CC-1 assignment (SUPERSEDES GO-2139 item 1)

```
CC-1 | SUPERSEDES GO-2139 item 1. DO NOT BISECT. DO NOT WRITE AN A/R POSTER.
Event 2 exists and is correct: revrec-delivery-posting/poster.service.ts
buildBillEvent2Postings() -> DR ar_control / CR unbilled_revenue.
Blocked by ACCT-F5692 hasApprovedPodEvidence(); dispatch.pod_documents = 0 rows system-wide.
Latch: 12 earn (to 2026-08-25Z / 08-24 CT) vs 4 bill (to 08-08). Invoice poster stands down by design.
2.2 is BLOCKED ON OWNER (option A/B/C). Start these two instead — unaffected:
  (1) void must reverse the Event-2 A/R leg — $9,995.50 on INV-00006/00019/00023
  (2) unapplied payment must not credit 1100 — $1,700 (PMT-2026-00006/00007)
Then 17 duplicate role rows + UNIQUE (operating_company_id, role).
Fix stale poster.service.ts comment (JE aaad9534 reversed ACCT-F59).
Do not void INV-37/38/44/45. Do not activate roles that already have an active twin.
```

---

## 5. Overlay / census (already agreed)

904 / 2,699 · U14 money cells **217** · U14 `gl_je` **80** · 105 unverified in five modules · bind-don’t-delete · no U14 recertify · one lifecycle slice tomorrow, not 217 leaves.
