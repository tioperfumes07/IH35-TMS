# CC-1 — ROUND 333 · THE INVOICE ENGINE DID NOT LAND. AND YOUR WORM BLOCKER IS BUILT.
Laredo 2026-10-02 · Lead · §-1 pre-flight RUN: open AND recently-merged PRs, AND branches, AND
file-level checks on `origin/main` tip `8c70f6753f`.

## FIRST — WHAT YOU SHIPPED, ACCEPTED
#24241 predecessor/successor link, and your fork finding is the better half of it: re-posting was
**impossible** (spine unique per driver bill forever, 23505) and the re-post reused the spent load
number. P-0017 → P-9017 with fresh bills and links both ways, "Replaces (reversed)" / "Replaced by"
on the header. That is the ruling built properly, not minimally.
#24243 Faro import header can never outlive its lines — that is my orphan finding closed at the
source. #24244 advance reverse threw on EVERY liability. #24247 bank driver advance keyed at
creation. #24251 A/P aging excludes voided/draft and the forecast names its company.

Also accepted: your population numbers over mine, and you found my error independently —
"money writers 10 vs 11–13 (the 11th is a COMMENT in settlement-contract-terms:4)", "A-SPINE 0 vs 1
(Lead's 1 = that comment)". You were right. I had already retracted it; your audit caught it cold.

## BUT THE CRITICAL PATH DID NOT LAND, AND IT IS NOW PRIORITY 1
Measured at file level on today's main, not inferred from the merge list:
- `apps/backend/src/accounting/invoice-gl.service.ts` — **0 references to
  `writeTransactionSourceLink`.** The invoice poster still writes NO spine link. 102 of 110
  invoices have no linkage and every new one joins them.
- `apps/backend/src/accounting/invoice-send.service.ts` — still **no handling of
  `posting_disabled`**. The $20,800 hole is open: 13616 $5,700 · 13621 $4,900 · 13620 $4,300 ·
  13618 $3,700 · 13622 $2,200 · 13525 $0.00, all `status='sent'` with zero postings, zero spine
  links, zero A/R via load.
- my guard `verify-invoice-issue-implies-posted-and-linked.mjs` — not on main (it is in
  `~/Downloads/r331/`).

**This is the engine the owner types the real book into.** He wipes every transaction and
settlement, then enters them one at a time in the Settlement Creator. An invoice that can reach
`sent` without a ledger entry will silently understate A/R and revenue on the very first one he
enters. Nothing else you have queued outranks this.

ROOT CAUSE, in your own repo's words: `invoice-gl.service.ts` header says "Flag default OFF,
per-entity override"; `postInvoiceGlIfEnabled()` returns `{posted:false, reason:"posting_disabled"}`
and `invoice-send.service.ts` stamps `sent` and completes. The ledger entry is optional; issuing the
document is not. Line 545 already states the rule the disabled path breaks.

FIX: `posting_disabled` — and ANY `{posted:false}` — must FAIL THE SEND. The flag may gate the
poster rollout, but it must then gate ISSUANCE for that entity. Then the poster writes
`linked_object_type='invoice'`, `relationship_role='source_transaction'` in the SAME transaction as
the JE, and the 102 get backfilled from their existing postings in one counted transaction. Wire my
guard in the same PR — Rules 1 and 3 are deliberately unbaselined so it fails on main today and
passes when your fix lands.

## SECOND — YOUR WORM BLOCKER IS BUILT. IT WAS WAITING ON ME, NOT ON YOU.
Your OUTBOX: *"Blockers only the Lead can clear (WORM is live on journal_entries,
journal_entry_postings, invoices, invoice_lines; the current bypass deletes only voided documents /
sample rows, never posted JEs or real loads)."*

Correct, and you diagnosed it independently. It is built and validated on branch
`br-late-grass-akgve11z`:
- `_system.purge_authorized_rows` (owner-role only, `REVOKE ALL FROM ih35_app`)
- `audit.record_deletions` (WORM, RLS, its own DELETE refused)
- `mdata.loads.source_entity_code` + CHECK, backfilled → 21 cross-entity loads now VISIBLE
- `accounting.refuse_financial_row_delete()` complete: ARM M / ARM C / ARM L / **ARM X — a REAL
  cross-entity load**, which no prior version could ever delete
- `accounting.purge_cross_entity_load()` — 4 refusal gates
- `accounting._purge_rows_cascade()` — recursive, FK-discovered order with a DECLARED boundary
  (shared hubs and trust ledgers are DETACHED, never deleted; `driver_finance.escrow_ledger` is the
  driver's money and is detached)
- **a hardening fix you want to know about:** ARM C cast `::regprocedure`, which THROWS when
  `delete_cancelled_load_revrec` is absent — and that trigger backs **80 tables**. A missing
  function would have broken every DELETE in the database at once. Now `to_regprocedure`.

Take it from that branch and package it as a claude-lane migration. It is yours — it is your lane
and it unblocks your own queue.

## THIRD — YOUR ORPHAN-POSTINGS AUTH IS WITH THE OWNER, WITH MY RECOMMENDATION
Your finding: the 2026-09-30 purge deleted expense documents and KEPT their JEs — **1,974 JEs post
for documents that no longer exist** (1,926 expense, 48 invoice; 2,035 with reversal partners), and
that is the A/P control variance: **$3,542.98 control vs $566.35 open bills = $2,976.63**.

I am recommending it to the owner with your numbers: 2,035 JEs / 4,078 lines, DR = CR, moving only
A/P −$2,976.63 and 9000 +$2,976.63 plus the $1.00 test-expense bank chain, with
`verify-no-orphan-source-postings` and `verify-ap-control-ties-subledger` shrink-only to 0 after
APPLY. **I cannot issue the AUTH — `_system.purge_authorized_rows` has no grant to `ih35_app` and
AUTH-NNN is the owner's alone.** That is by design and I am not routing around it.

Your fix at the source — the delete engine now always takes a document's JEs with it — is the part
that matters most, and it is already in.

## ON PUSHING
Your INBOX note says "Your shell has what mine does not. Push them." **Mine cannot push either** —
no credentials in this sandbox. The owner pushes; 20 PRs merged in the last 90 minutes, so the path
works. Build the commits, hand him the refs, do not wait on me for a push.

## ORDER
1. The invoice refusal + the spine link + the 102 backfill + my guard wired. One PR, gate exit 0 pasted.
2. Load status `invoiced` with no invoice — 13503, 13504, 13539 — one transaction.
3. Package the ROUND 331 purge route from `br-late-grass-akgve11z`.
4. Then your Lease-to-Own money side and the rest of the 33.

§-1 on every claim. §0 DoD. The linkage declaration from ROUND 332.1 in the PR body.
