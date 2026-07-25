# Module completion manifests (permanent · mechanical)

**Law:** A module is COMPLETE only when **every** checklist item is `PASS` (or owner-written `HOLD` with tracker id + future block).  
**Forbidden:** Claiming COMPLETE / “fully done” / “N of M done” from PR volume, EntityLink chrome, or CI-green alone.

## Files

| Path | Role |
|---|---|
| `docs/module-completion/<module>.json` | Machine source of truth — CI reads this |
| `docs/module-completion/<module>.md` | Human scoreboard regenerated / maintained beside JSON |
| `scripts/verify-module-completion.mjs` | Fail closed if COMPLETE while open items remain; validate schema; print `N of M` |
| verify-step **1431** | CI teeth — same guard on every PR |
| Rule **24** | alwaysApply — module DONE ≠ PR volume |

## Item status

| Status | Counts toward N? | Meaning |
|---|---|---|
| `PASS` | **yes** | Live proof + repo proof; hostile reviewer can confirm |
| `HOLD` | **yes** only if `owner_hold: true` + `tracker` + `future_block` | Jorge deferred in writing |
| `OPEN` | no | Not built / not proven |
| `FAIL` | no | Proven broken |
| `UNVERIFIED` | no | Claimed but no live proof |

**N of M** = count(`PASS` + qualifying `HOLD`) / count(all items).  
**COMPLETE** = N === M and `complete: true` in JSON (guard sets/validates).

## Required fields per item

```json
{
  "id": "ACCT-ECON-02",
  "title": "bill_payments live density > 0",
  "layers": ["DOD-D", "DOD-E", "VERIFY-6"],
  "spec": "DEFINITION-OF-DONE.md §2.6 + Law §9 Bill Payment",
  "status": "OPEN",
  "evidence": "Neon lucia: COUNT(*) FROM accounting.bill_payments = 0 (2026-07-24)",
  "pr": null,
  "owner_hold": false,
  "tracker": null,
  "future_block": null
}
```

## Every work reply / PR

```
MODULE: accounting
PROGRESS: N of M checklist items PASS|HOLD
STATUS: <item id being closed>
```

Money PRs must include (git-enforced by verify-step **1430**):

```
MODULE_PROGRESS: accounting N of M
MODULE_PROGRESS: banking N of M
ITEMS_TOUCHED: ACCT-… | BANK-…
```

`N of M` must match `docs/module-completion/<module>.json` (update JSON + regenerate `.md` in the same PR when an item moves to PASS).
