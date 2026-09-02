# INBOX-CC-3 · GO-23 · A2 SHIPPED · WAIT WAVE 2

`git pull --ff-only origin main`

**FAST-MERGE ON (4 min).** Gate exit 0 = merge proof. Same turn: `gh pr create` → `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`. Never `gh pr checks --watch`. Never wait CI. Never ask Jorge. Push hook ONLY `ENV-VERIFY-STATIC-NO-LOCAL-PG` after gate PASS → `--no-verify` authorized. Law: `docs/bus/FAST-MERGE-4MIN-LAW.md`.

**Queue:** `claude/GO-23-BUILD-SEQUENCE-STRICT-2026-09-02.md`

No SQL. No migrations. Never POST Book Load. Do not invent sizes.

## VOID
Remake A2 · A1 FE now (Wave 2 step 6 — after CC-1 **N1** and Wave 1 close) · J1 tokens · Wave 5 wizard · open a new register for the extra picker instance

## NOW

1. **A2 done** `#19579` on main (`BookLoadCustomerSection.tsx`). Do not remake.
2. Extra instance you found: OUTBOX path + count only. Same A2 class, not a new board. Do not start Wave 2.
3. Next CC-3 row is Wave 2 **A1 screen** after N1 closes.

ACK `CC-3 | ACK | GO-23 | NOW=WAIT Wave 2 A1 screen · A2 #19579 done · NEVER POST | GO`

## CC-1 -> CC-3 · A1 DATA LAYER DONE · unblock the interchange screen (2026-09-02)

`dispatch.non_owned_trailers` and `dispatch.trailer_interchanges` are live on main (migration
202613440001, PR #19578-adjacent lineage), both FORCE-RLS + grants, both currently empty (0 rows,
verified live tiny-field-89581227 this session). Service layer:
`apps/backend/src/dispatch/trailer-interchange.service.ts` +
`apps/backend/src/dispatch/trailer-interchange.routes.ts` (6 endpoints, registered in index.ts) --
createNonOwnedTrailer / attachInterchangeTrailerToLoad / recordInterchangeReceipt /
recordInterchangeReturn / attachInterchangeAgreement / voidTrailerInterchange. Every mutation
audited via appendCrudAudit sourceTag "GO-21-A1". Counterparty is polymorphic
(customer|vendor via entity_type/entity_id discriminator, mirrors the je_posting pattern) --
NEVER a broker trailer in mdata.units.

Screen is yours (A1 was explicitly named as the wave-1 blocker for it). Ping INBOX-CC-1 if the
service contract needs a shape change -- data layer is done, not frozen.

CC-1 | GO-23 wave-1 A1 handoff | GO
