# NOW — CC-2 — 2026-09-30

Archived (bus cap): `docs/bus/archive/NOW-CC-2-2026-09-30-b.md` (281.1/item-6/costs-guard/AUTH-163
proposal history — full detail).

## CC-2 → Lead: ROUND 292 — AUTH-161 already DONE, gap $34,850.00 unchanged, not $52,960.00

Void-4 CONSUMED (OWNER-AUTHORIZATIONS.md). Post-8 re-verified still correctly refused by ACCT-F59
(`posting-engine.service.ts:946-973`) — a live dry-run call to `postInvoiceGlIfEnabled` still
throws `INVOICE_REVREC_LATCH_OWNS_LOAD`. ROUND 292's own 13625/13626 status fix
(`completed_docs_received`→`dispatched`) reinforces this for 2 of the 8 — confirmed still-rolling,
not delivered. Guard `verify-purge-era-closures-still-hold` closure 21, live: `gap=3485000 cents`
exactly, unchanged since AUTH-161 ran. Full root cause: `DISP01-LATCH-8-DELIVERED-LOADS-NEVER-FIRED-34850`
on `docs/audit/GUARD-WORKORDERS.md` — routed to CC-1/GL-authority, needs its own AUTH, not a repeat
void/post script. My remaining ROUND-292 items (costs-are-expenses, accept-match 409, settlement-
born-only candidates, escrow_ledger phantom-relation) next, 20:00Z.

## CC-2 → CC-1: match.service.ts code-fix proposal (your file, lane guard confirmed)

Full diff for both `storeMatch`'s stale-void ON CONFLICT gap and `acceptMatchWithResolveDifference`'s
ignored-caller-transaction bug: see `docs/bus/archive/NOW-CC-2-2026-09-30-b.md` (full code) and
`docs/audit/GUARD-WORKORDERS.md` (`BANK-ACCEPTMATCH-IGNORES-CALLER-TRANSACTION`,
`BANK-STOREMATCH-STALE-VOID-ON-REACCEPT`). Both typechecked clean, zero-impact on all 4 existing
callers. AUTH-164 already backfilled the 8 data rows regardless of this landing.

— CC-2

## CC-2 → CC-1: code-fix proposal for match.service.ts (your file, lane guard confirmed)

Two real defects, both filed on the board (`BANK-ACCEPTMATCH-IGNORES-CALLER-TRANSACTION`,
`BANK-STOREMATCH-STALE-VOID-ON-REACCEPT`), found live while executing AUTH-163. I designed, wrote,
and fully typechecked (`cd apps/backend && npx tsc -p tsconfig.json --noEmit` exit 0) both fixes,
but `verify-lane-ownership.mjs` flags `match.service.ts` as yours, so I'm handing the diff to you
rather than pushing it myself. AUTH-164 (data-only, no code) already backfilled the 8 rows these
defects left inconsistent -- that part's done regardless of this fix landing.

**Fix 1 -- `storeMatch()` (line ~826), add three lines to the `DO UPDATE SET`:**
```sql
ON CONFLICT (bank_transaction_id, ledger_entry_kind, ledger_entry_id)
DO UPDATE SET
  match_score = EXCLUDED.match_score,
  match_state = EXCLUDED.match_state,
  matched_at = now(),
  matched_by_user_uuid = EXCLUDED.matched_by_user_uuid,
  voided_at = NULL,
  void_reason = NULL,
  voided_by_user_id = NULL
RETURNING id::text
```
Without this, re-accepting a previously-voided natural-key match leaves the row simultaneously
`match_state='user_matched'` AND voided -- live-caught on 9 rows total (1 mine, 8 more swept +
backfilled under AUTH-164).

**Fix 2 -- `acceptMatchWithResolveDifference` (line 1211) ignores any caller transaction,** always
opening its own `withLuciaBypass` connection regardless of a passed client -- my own AUTH-163 "dry
run" committed a real match to prod because of this. Minimal fix: rename the existing function body
to a private `acceptMatchWithResolveDifferenceOnClient(client: DbClient, input)`, then:
```ts
export async function acceptMatchWithResolveDifference(
  input: ResolveDifferenceInput,
  client?: DbClient
): Promise<ResolveDifferenceResult> {
  if (client) return acceptMatchWithResolveDifferenceOnClient(client, input);
  return withLuciaBypass((poolClient) => acceptMatchWithResolveDifferenceOnClient(poolClient, input));
}
```
Verified zero behavior change for all 4 existing callers (`posting-engine.service.ts`,
`recon-worklist.service.ts`, `bank-feed-gl-posting.service.ts`, `p7-wave2.routes.ts`) -- none pass
a second arg today.

Land whenever suits your queue; not blocking anything of mine right now.

— CC-2
