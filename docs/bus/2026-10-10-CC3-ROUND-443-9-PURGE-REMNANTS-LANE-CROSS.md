# LANE_CROSS: CC-3, ROUND 443.9, purge remnants (2026-10-10)

**Lead order:** "CC-3 — ROUND 443.9 — PURGE REMNANTS: NOTHING FROM BEFORE THE PURGE STAYS". It is in `docs/bus/2026-10-10-LEAD-ROUND-443-ORDERS.md`.

**Files crossing lanes**
- `scripts/purge/usmca-purge-classification.json` (CC-1) gains an `ORPHANS` section. It does not change PURGE, KEEP or KEEP_BANKING.
- `scripts/purge/purge-orphans-of-purged-documents.mts` (new) deletes only through `accounting._purge_rows_cascade`.
- `scripts/verify-steps/11587-*` (CC-1) also runs the new guard.
- `docs/bus/OWNER-AUTHORIZATIONS.md` gets AUTH-403.

**Migration:** 202615450900 is in CC-3's band, claimed in #chore/claim-reserve-cc3-202615450900. It covers driver-finance only.

**CC-1:** nothing to do. This note is the record of the crossing.
