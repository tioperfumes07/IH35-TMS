# CC-3 — KILL THE SECOND SYSTEM table 12 — vendor_balances vs A/P control, and one AUTH request

**Measured 2026-10-03 on prod (direct endpoint, bypass_rls, READ ONLY), USMCA only.**

## Table 12 result

`accounting.vendor_balances` is a VIEW over open bills — no stored balance, nothing to kill.
**Vendor by vendor it equals the A/P GL to the cent** (A/P control = role `ap_control` = 2000):

| vendor | view | A/P GL |
|---|---|---|
| Smithfield Foods Inc | 269.10 | 269.10 |
| TRUCK WASH HEBRON | 47.25 | 47.25 |
| TERRENCE SMITH | 250.00 | 250.00 |
| **total** | **566.35** | — |

**But A/P control nets 3,542.98.** 2,976.63 of A/P is owed to **no vendor**.

## The cause — AUTH-138 reversed a correct reversal

Each of 60 chains, verified through `reverses_je_id` / `reversed_by_je_id`:

1. an expense posted **Dr 9000 Ask My Accountant / Cr 2000 A/P** (the 60 expenses were voided, since purged);
2. **2026-09-25** a bulk action posted their reversals **Dr 2000 / Cr 9000** — each original is marked reversed by it. Correct.
3. **2026-09-30 AUTH-138** (#23194, `ops-defect3-reverse-orphaned-9000-ap-plug.mts`) read (2) as "orphaned plugs" and
   **reversed them** — Dr 9000 / Cr 2000, memo "Reversal of journal entry <id>", source `journal_entry`, no vendor.

(3) re-instated the A/P of 60 voided expenses. A/P is overstated 2,976.63 and 9000 is overstated by the same.

## The fix — AUTH REQUEST

`scripts/ops/2026-10-03-cc3-table12-undo-auth138-double-reversal.mts` reverses each of the 60 (3)s through
`reverseJournalEntryNoFlip` — the same sanctioned, linked primitive AUTH-138 used. Each chain then nets to zero, the
state a voided expense requires. No new account, no plug, no hand-written JE.

It REFUSES unless the 60 are exactly as measured (live, unreversed, chain intact, 297,663 cents) and REFUSES TO COMMIT
unless afterwards A/P net == vendor subledger and no vendorless A/P remains.

**Fork rehearsal** (br-plain-dust-ake02oei, deleted): `reversed 60, ap_before 354298, ap_after 56635,
vendor_subledger 56635, vendorless 0`.

Proposed AUTH text:

```
scope: USMCA ONLY. The 60 journal entries listed in the script (AUTH-138's re-reversals), 2,976.63.
action: DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-03-cc3-table12-undo-auth138-double-reversal.mts --apply --auth AUTH-NNN
  Dry-run first (default, no --apply).
does not cover: any other entry, any other account than 2000 / 9000, any company other than USMCA.
```

## Guard

`scripts/verify-vendor-balances-equals-ap-control.mjs` — per-vendor view == A/P GL, and A/P control == the subledger.
The 60 are named debt computed from the still-unreversed entries, so it shrinks to 0 when the AUTH runs; then the list
must be deleted.
