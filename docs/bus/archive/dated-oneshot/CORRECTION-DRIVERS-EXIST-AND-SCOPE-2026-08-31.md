# ⛔ CORRECTION + SCOPE CHANGE · 2026-08-31 21:15Z
**Supersedes `GO-REAL-BOOK-LIVE-2026-08-31.md` on both scope and the driver task.**

## ⛔ CORRECTION 1 — THE 3 "MISSING" DRIVERS ARE NOT MISSING. I WAS WRONG.
CC-3 filed it. **I confirmed it. We were both wrong.** All three exist. Do not create them.
Creating them would have produced duplicate identities for three of the most active drivers in the
August book — the exact opposite of a fix.

| AL policy name | actually in `mdata.drivers` as | status |
|---|---|---|
| Leonel Antonio Morales | `Leonel` / **`Antonio Morales Noguez`** | Active USMCA **and** Active Transportation |
| Hugo Gaytan Sarabia | `HUGO` / **`GAYTAN`** | Active USMCA · Active Transportation ×2 · Inactive USMCA |
| Angel Alfonso Sosa Perez | `ANGEL` / **`ALFONSO SOSA`** | Active USMCA · Inactive USMCA · Inactive Transportation |

**Why the match failed — and this is the actual defect.** `mdata.drivers` splits Hispanic names
inconsistently: the second given name and the surnames land in `last_name` in no fixed order, and
sometimes a surname is dropped entirely (`GAYTAN` with no `SARABIA`). An exact
`first_name || ' ' || last_name` comparison — which is what CC-3 used and what I used to "confirm"
it — misses every one of them. **The bug was in the matcher, not in the data.**

**The lesson is the standard:** a negative result from an exact-string match on a name field is not
evidence of absence. I published one as fact. That is on me, and it is corrected here in writing
rather than quietly dropped.

## ⛔ CORRECTION 2 — THE REAL DEFECT IS DUPLICATE DRIVER IDENTITIES. Verified live, USMCA:
```
driver rows                                175
distinct names                             106      -> 69 duplicate rows
names carrying duplicates                   65
names with MORE THAN ONE **ACTIVE** row      3
```
The three with two Active rows in the same company:
**CARLOS GALAVIZ** (4 rows / 2 active) · **JUAN PABLO HERNANDEZ ESTRADA** (4 / 2) ·
**JOSE MANUEL MEJIA OLMOS** (2 / 2).

Two Active records for one person in one company means a settlement, an escrow balance, a pay rate,
or a compliance document can attach to **either** identity — silently splitting one driver's money
and records in two. That is a live money-integrity defect, and it plausibly contributes to the
escrow and settlement mismatches already on the board (3 escrow accounts against what looked like
175 drivers — there are only **106 real people**).

**This is the real fix, and it is not a patch:**
1. **Name normalization** — a canonical person key that survives surname-order and dropped-surname
   variance. Not a `LIKE` hack in one query: a function the whole app uses.
2. **A guard + selftest** that fails when a company has two Active rows for one canonical person.
3. **A duplicate register** — every duplicate, with which row holds settlements, escrow, pay rates,
   documents. **Publish it. Do not merge anything yet.**
4. **CC-2 grades the register before a single merge.** Merging driver identities moves money.
**Nobody merges or deactivates a driver row today.** Count first, fix the matcher, then decide.

## SCOPE CHANGE — OWNER: 1–2 REAL TRANSACTIONS, NOT THE WHOLE BOOK
Owner, verbatim: *"we can create only 1-2 real that is ok, so we know that it really is wired and
works as is intended. the law is that it is the only real way."*

**Cancel the bulk-entry plan.** Do NOT key 33 invoices, 58 settlements, 135 expenses.
**Enter ONE real load and carry it the whole way through**, `is_sample_data = false`, live clicks:

> **dispatch → invoice → driver bill → load expense → driver settlement → deduction/escrow →
> factor at 97/1.5/1.5/$10 → bank match → settlement paid**

One chain, complete, real, and reproducible. Then a **second** to prove it was not a fluke.
That is the proof the wiring is genuine. Bulk data entry proves nothing about the software and
would bury a real defect under 250 rows of typing.

**The tie-out targets stay** — not as an entry list, but as the arithmetic the modules must produce
when they are finished: face $95,075.00 · escrow reserve $1,426.13 · discount fee $1,426.13 ·
wire $120.00 · **net advance $92,102.74 exact**.

## DRIVER LICENSES — not on disk yet
Owner is downloading driver's licenses to `~/Downloads` for upload against each driver.
**Checked at 21:10Z: not there yet.** Newest files are `COI - HIGHWAY.pdf` and
`COI - Allen Lund Co.pdf` (16:56–16:59) — customer certificates, not driver licenses.
When they land: match each licence to the **canonical** driver — **after** the name-normalization
fix, never against the raw split-name fields, or a licence will attach to a duplicate identity and
the real record will still show a missing document.

## STANDING
LIVE CLICK ONLY. Real fixes and real counts — **no patches**. A negative from an exact-string match
is not proof of absence. A guard that passes without running is worse than no guard.
Nobody closes August but the owner.
