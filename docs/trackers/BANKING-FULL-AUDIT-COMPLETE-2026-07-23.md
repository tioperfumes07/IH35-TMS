# BANKING — Full Linkage Audit (Law-bound)

**Law:** `~/Desktop/07-23-2026-Cursor Full Linkeage Audit, .rtf` + `FULL-AUDIT-LAW-AGREED-2026-07-22.md`  
**Blueprint:** `ARCHITECTURE-BLUEPRINT-2026-07-05.md` §0 / §9  
**Role:** Cursor **builds** PRs · Claude merges · Jorge unlocks money  
**Next module (owner-locked):** **Safety** — only after Banking is truly COMPLETE (all layers PASS or named UNVERIFIED that Jorge accepts)

```
MODULE: banking
STATUS: NOT COMPLETE — code PRs opened; live Full Audit layers still UNVERIFIED
PRS: build lane advanced (incl. #3322 for FAIL 30/32) — merge lane + live proof remaining
AUDIT FILE: ~/Desktop/IH35-CURSOR-AUDIT/modules/banking.md
CLICK-THROUGH: UNVERIFIED — no live TRANSP+USMCA browser matrix this wave
PICKER/+CREATE/QBO: UNVERIFIED live (code/guards exist; matrix not filled)
DEEP LINKAGE CHAINS: code built — live hop matrix UNVERIFIED
CATALOGS USMCA: UNVERIFIED — Neon+UI dual-company matrix not proven this close
ECONOMICS SMOKE: UNVERIFIED — needs JORGE-APPROVED categorize smoke → Neon (prior snapshot only)
REVERSE / LAW §9: code built — live reverse UNVERIFIED
NEXT MODULE: blocked until Jorge accepts UNVERIFIED layers OR live proof lands
```

**Honesty correction (2026-07-23):** An earlier draft marked STATUS COMPLETE. That was wrong. CI-green + code guards ≠ Full Audit COMPLETE. Layers 2–5 still lack live proof.

---

## Layer verdicts (Full Audit Law) — honest

| Layer | Verdict | Evidence |
|---|---|---|
| 1 Visual / QBO chrome | **PASS (repo+guard)** | ParityDrawer on Transfer/CC — `verify-banking-transfer-cc-chrome` (#3322) |
| 2 Picker law | **UNVERIFIED** | Live TRANSP/USMCA picker matrix not filled |
| 3 Deep linkage F+R | **UNVERIFIED live** | Code in open/merged PRs; hops not browser-proven |
| 4 Catalogs / entity scope | **UNVERIFIED** | Dual-company Neon+UI matrix not run |
| 5 Economics CPA-grade | **UNVERIFIED** | Owner-gated smoke not run |
| Rule 05 tabs | **PASS (repo+guard)** | arch-design / banking tab guards |
| Rule 16 | Partial | ROOT/FIX/GUARD for #3322; LIVE PROOF still UNVERIFIED |

---

## Neon snapshot (prior wave — RLS bypass `lucia`) — not re-proven this close

| Check | Live (prior) |
|---|---:|
| `banking.bank_transactions` | 10,540 |
| `pending_categorization` | 10,537 |
| `categorized` | 3 |
| `reconciliation_sessions` | 0 |
| `transfers` | 0 |

---

## Open PRs (Cursor build / Claude merge)

| PR | Role | Git state |
|---:|---|---|
| **#3322** | FAIL 30 chrome guard + FAIL 32 Faro both-way | base=`main`, CI green, MERGEABLE |
| #3296–#3302, #3305 | honesty / linkage stack | base=`main`, **CONFLICTING** — rebase required |

Sibling-stack PRs previously “MERGED” into non-main bases are **not** on `main` until Claude lands content.

---

## #3322 acceptance (honest)

```
ROOT CAUSE: Transfer/CC chrome ungarded; Factoring tab lacked Faro advance EntityLinks
FIX: guards + timeline EntityLink + reverse link
GUARD: verify-banking-transfer-cc-chrome, verify-banking-faro-advance-linkage
LIVE PROOF: UNVERIFIED — local/CI guards only; no live TRANSP/USMCA or Neon re-proof this close
REMAINING: live layers 2–5; rebase conflicting open banking PRs; Claude merge to main
```
