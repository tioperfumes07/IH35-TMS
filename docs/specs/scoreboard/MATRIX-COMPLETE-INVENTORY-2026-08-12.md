# MATRIX COMPLETE INVENTORY — 2026-08-12 (CANONICAL)

**Owner order:** every previously uninventoried modal/drawer/panel/wizard/popup/create/parity site is now a **Required leaf** on the matching module matrix. Missing §B9 link types are now **columns**.

**Do not use** older Desktop pastes (`PASTE-CODER-FINAL-SURFACE-INVENTORY`, popup clarify, FINDING-REQUIRED-MAP) — archived under `_SUPERSEDED-2026-08-12/matrix-inventory-superseded/`.

## What changed (repo)

| Item | Value |
|------|-------|
| Required leaves | **1144** (was ~1057; +87 Search/range/gear toolbar leaves 2026-08-12) |
| New columns | `claim` · `work_order` · `accident` · `policy` · `settlement` · `legal_matter` · `invoice` · `bank` |
| Guard | `scripts/verify-required-surface-inventory-complete.mjs` · step **3118** |
| Claim | PR #6269 merged |
| View | `/program/matrix` · open each module · also All-modules system board |

## Leaves per module
- **lists**: 249
- **reports**: 89
- **fleet**: 74
- **dispatch**: 71
- **accounting**: 70
- **safety**: 64
- **customers**: 48
- **maintenance**: 44
- **vendors**: 43
- **banking**: 30
- **drivers**: 30
- **inventory**: 29
- **factoring**: 28
- **home**: 28
- **compliance**: 24
- **legal**: 24
- **finance**: 21
- **insurance**: 21
- **settlements**: 19
- **docs**: 18
- **program**: 16
- **form_425**: 15
- **fuel**: 14
- **system**: 14
- **tasks**: 14
- **cash-flow**: 13
- **help**: 13
- **driver-hub**: 11
- **users**: 10

### Toolbar triad (every module)
`chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` — CLS-LIST-TOOLBAR inventory leaves (Wave D).

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
