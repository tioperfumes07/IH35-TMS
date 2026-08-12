# MATRIX COMPLETE INVENTORY — 2026-08-12 (CANONICAL)

**Owner order:** every previously uninventoried modal/drawer/panel/wizard/popup/create/parity site is now a **Required leaf** on the matching module matrix. Missing §B9 link types are now **columns**.

**Do not use** older Desktop pastes (`PASTE-CODER-FINAL-SURFACE-INVENTORY`, popup clarify, FINDING-REQUIRED-MAP) — archived under `_SUPERSEDED-2026-08-12/matrix-inventory-superseded/`.

## What changed (repo)

| Item | Value |
|------|-------|
| Required leaves | **1057** (was ~864) |
| New columns | `claim` · `work_order` · `accident` · `policy` · `settlement` · `legal_matter` · `invoice` · `bank` |
| Guard | `scripts/verify-required-surface-inventory-complete.mjs` · step **3118** |
| Claim | PR #6269 merged |
| View | `/program/matrix` · open each module · also All-modules system board |

## Leaves per module
- **lists**: 246
- **reports**: 86
- **fleet**: 71
- **dispatch**: 68
- **accounting**: 67
- **safety**: 61
- **customers**: 45
- **maintenance**: 41
- **vendors**: 40
- **banking**: 27
- **drivers**: 27
- **inventory**: 26
- **factoring**: 25
- **home**: 25
- **compliance**: 21
- **legal**: 21
- **finance**: 18
- **insurance**: 18
- **settlements**: 16
- **docs**: 15
- **program**: 13
- **form_425**: 12
- **fuel**: 11
- **system**: 11
- **tasks**: 11
- **cash-flow**: 10
- **help**: 10
- **driver-hub**: 8
- **users**: 7

## Full column set
`driver · customer · vendor · unit · trailer · load · claim · work_order · accident · policy · settlement · legal_matter · ap_bill · expense · invoice · bank · gl_je · inventory · liability · picker_law · qbo_chrome · connectivity · reverse_link · scenario.maintenance · scenario.insurance`

## How Jorge verifies (no coder word)

1. Deploy SHA includes this PR.
2. Open `/program/matrix` → pick **Dispatch** — see Modals/Panels tabs with Cancel/Reassign/Equipment Transfer etc.
3. Open **Safety / Settlements / Banking / Accounting** — new leaves + new column headers (CLAIM, WO, AR/INV, BANK, …).
4. Built % will **drop** — that is truth (new Required cells are not Built yet).

## Seat pastes (this folder only)

| File | Seat |
|------|------|
| `PASTE-CC-1.md` | money / GL / new money columns |
| `PASTE-CC-2.md` | connectivity / reverse / claim-WO links |
| `PASTE-CODEX.md` | FE pickers / creators on new leaves |
| `PASTE-CURSOR.md` | matrix chrome / inventory guard / FE overflow |
| `00-README.md` | this file |

Generated: 2026-08-12T23:47:47.129082+00:00
