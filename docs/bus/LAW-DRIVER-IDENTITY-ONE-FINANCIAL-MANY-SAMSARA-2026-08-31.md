# LAW — DRIVER IDENTITY: ONE FINANCIAL DRIVER, MANY SAMSARA PROFILES · 2026-08-31 21:40Z
**OWNER RULING, architectural, locked:** *"for economics etc financial there can only be one driver,
but that driver might be linked to two different samsara profiles, that is ok."*

## THE ROOT CAUSE IS NOW PROVEN — it is the schema, not the data entry
`mdata.drivers.samsara_driver_id` is a **single scalar column on the driver row.** A person with two
Samsara profiles therefore **cannot** be represented as one driver. The schema forced a second row.
That is the whole defect. Everything else is a symptom.

**Live proof, USMCA, read 21:35Z.** Every driver holding two Active rows holds two distinct Samsara IDs:
| driver | rows | active | distinct Samsara IDs | distinct CDL #s |
|---|---|---|---|---|
| CARLOS GALAVIZ | 4 | **2** | 2 — `55953904`, `55954019` | **1** |
| JUAN PABLO HERNANDEZ ESTRADA | 4 | **2** | 2 — `54672791`, `54999945` | 2 |
| JOSE MANUEL MEJIA OLMOS | 2 | **2** | 2 — `59885225`, `60088842` | 0 |
| HUGO GAYTAN | 2 | 1 | 2 — `58031381`, `60526640` | **1** |
| ANGEL ALFONSO SOSA | 2 | 1 | 1 — `55857614`, null | **1** |

Across all duplicate rows in USMCA: **134 duplicate rows · 69 carry a Samsara ID · 69 DISTINCT
Samsara IDs** — not one is shared. And **62 rows carry a CDL number across 61 distinct CDLs** — two
rows share a CDL, which is the same-person proof written in the data itself.
**One CDL = one human being. Two Samsara IDs = two devices/profiles for that same human being.**

## THE FIX — architecture, not cleanup. Build in this order.
1. **`mdata.drivers` is the FINANCIAL IDENTITY: exactly one row per person per company.**
   Settlements, escrow, pay rates, deductions, driver A/P and compliance documents hang off it and
   nothing else. This is the invariant.
2. **Move the Samsara link into a child table — one driver, many profiles.**
   `integrations.samsara_drivers` already exists; wire a proper
   `driver_id → samsara_driver_id` many-to-one relation rather than a column on the person.
   **Do not drop `mdata.drivers.samsara_driver_id` until every value is migrated and proven.**
   Additive first, cut over, then retire. Never the reverse.
3. **CDL number is the natural person key.** Where two rows share a CDL, they are one person —
   that is evidence, not inference. Where the CDL is NULL (e.g. JOSE MANUEL MEJIA OLMOS has none),
   **the merge is NOT automatic.** It goes on the register for a human decision.
4. **Guards + selftests, both directions:**
   - fail if one company holds **two Active driver rows for one canonical person**
   - fail if one `samsara_driver_id` is attached to **two different drivers**
   - fail if a settlement, escrow row, pay rate or deduction attaches to a **non-canonical** driver
5. **The duplicate register, published before any merge.** For each canonical person: every row id,
   status, Samsara ID, CDL, and **which row currently holds the settlements, escrow, pay rates and
   documents.** That last column is the one that matters — merging moves money.
6. **CC-2 grades the register BEFORE a single merge runs.** No merges today.

## WHY THIS IS URGENT AND NOT COSMETIC
Two Active identities for one person means a settlement can post to one row while the escrow
deduction posts to the other. The driver's money is then split across two records with nothing
flagging it, and each record looks internally consistent. That is exactly the failure mode that
makes a settlement "balance" while a driver is underpaid. It also plausibly explains part of the
escrow gap already on the board — **3 escrow accounts against 175 rows, when there are only 106
real people.**

## SCOPE DISCIPLINE — unchanged
This is a **build**, not a data-entry chore. It does not displace the **one real end-to-end chain**
the owner asked for (dispatch → invoice → driver bill → expense → settlement → deduction/escrow →
factor 97/1.5/1.5/$10 → bank match → paid), and it does not displace DEFECT A/B.
If the real chain's driver turns out to be a duplicated person, **that is the chain to use** —
it proves the fix on live money.

## STANDING
LIVE CLICK ONLY. Real fixes and real counts, no patches. Additive-first migrations; retire a column
only after the data is migrated and proven. Reverse, never erase. **Nobody merges a driver row
today.** Nobody closes August but the owner.
