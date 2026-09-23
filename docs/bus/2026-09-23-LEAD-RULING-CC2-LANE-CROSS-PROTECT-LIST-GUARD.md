# LEAD RULING — PROTECT-LIST GUARD + TWO LAW-FILE CORRECTIONS (CC-2 lane cross)

Owner/Lead packet, verbatim (ROUND E11.2, issued 2026-09-23 16:20 CT / 21:20 UTC, deadline 23:00 UTC):

> CC-2 — MASTER-DATA PROTECT GUARD + TWO LAW-FILE DEFECTS. ONE PR.
>
> DEFECT A: nothing in this repo prevents a purge or a feed from deleting
> master data. The wipe spared geofences and locations because the table list
> happened to omit them, not because anything forbade it. That is luck.
>
> A. scripts/verify-master-data-protected.mjs (NEW), wired into
>    scripts/money-pr-local-gate.mjs. TWO checks, both required:
>    (i) LIVE FLOORS, USMCA 5c854333-6ea5-4faa-af31-67cb272fef80, measured by
>        me at 2026-09-23 21:15 UTC under bypass_rls='lucia'. FAIL BELOW:
>          banking.bank_transactions  1133   <- EXACT, fail on != 1133
>          mdata.customers            1239
>          mdata.vendors               623
>          mdata.locations             621
>          geo.geofences               611
>          catalogs.accounts           193
>          mdata.drivers               167
>          catalogs.items              148
>        Floors RISE as the feed adds rows. They never fall.
>        --write-baseline FORBIDDEN on this guard.
>    (ii) STATIC SCAN of db/migrations/** and scripts/ops/**: FAIL on any
>         DELETE/TRUNCATE naming geo.*, mdata.locations, mdata.location_contacts,
>         catalogs.*, banking.bank_transactions, banking.bank_accounts,
>         banking.transaction_categories, org.companies, identity.users,
>         mdata.customers, mdata.vendors, mdata.drivers, mdata.units.
>
> DEFECT B: a LAW file states a number that is false.
>    docs/manuals/00-USMCA-RECONCILIATION-CLOSED-NEVER-ASK-AGAIN.md and its
>    docs/bus/ mirror both read "$12,592.40 | 16 real unfactored, unvoided
>    invoices". It is FIVE. The 16 came from re-deriving off
>    factoring_advance_id IS NULL -- the exact error docs/bus/INBOX-CC-1.md
>    already names as producing $51,262.41 against a true $12,592.40.
>    factoring_status IS THE COLUMN.
>    Correct BOTH files to: "5 real unfactored, unvoided invoices" and name
>    them -- 009 FLS · 010 Supply Chain Mgmt · 026 IM Specialized ·
>    055/13555 2EMS · 074/13593 Alligator. Add the note that 13593 is not
>    invoiceable, so 5 documents / 4 invoiceable.
>
> DEFECT C: the guard cannot catch defect B. scripts/verify-reconciliation-
>    constants.mjs regexes the dollar figure only. Add self_carried_open_count: 5
>    and assert it alongside self_carried_open_cents: 1259240.
>
> RED-BEFORE-GREEN REQUIRED on A(i), A(ii) and C: break one floor / plant one
> DELETE / change the count, run the guard, paste the FAIL naming the exact
> table and expected-vs-actual. Restore, paste the PASS. Both runs or it is
> not merged.

This authorizes CC-2 to author `scripts/verify-master-data-protected.mjs` (CC-1 lane,
`scripts/verify-*.mjs`) and edit `scripts/money-pr-local-gate.mjs` (CC-1 lane) and
`scripts/verify-reconciliation-constants.mjs` (CC-1 lane) to wire and extend both guards, plus
`.github/workflows/ci.yml` (SHARED). `docs/manuals/**`, `docs/bus/**` and
`data/reconciliation/**` need no cross — SHARED (`docs/**`).
