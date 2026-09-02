# GO-26 PURGE LEDGER — dispatch schema — 2026-09-02

Fifth of six schema PRs (`accounting` → `driver_finance` → `banking` → `factoring` →
**`dispatch`** → `fuel`).

## dispatch.load_id_reservations was already 0 when this pass reached it

Baseline earlier this session read 5,878. By the time this schema's turn came up,
`lib.trace_counters` (`doc_type='LOAD'`) had a fresh `updated_at` timestamp (minutes old) and
`load_id_reservations` already read 0 — **another seat is concurrently working this exact purge**
(Cursor per the seat assignment in the GO-26 doc's own PART 5 table; this row's job is explicitly
listed as CC-1, but the live counter movement is unambiguous). Not re-deleting rows that are
already gone; re-verified live before touching anything else in this schema.

## lib.trace_counters — NOT reseeded this pass, deliberately

The two source instructions disagree on the target: `INBOX-CC-1.md` said set `last_trace_no=13556`
(next mint 13557, per an August one-sheet on Desktop); the canonical
`GO-26-PURGE-TO-ZERO-AND-CONSOLIDATE-2026-09-02.md` said 13509. Neither matches what's live: the
`LOAD` counter already reads **13523**, moving in real time from concurrent activity. Overwriting
a counter another seat is actively advancing, based on a document that's already provably behind
live reality, risks a genuine load-number collision — the exact failure mode this reseed step
exists to prevent. Deleted only the unambiguous piece: the stale `doc_type='LD'` row (per SEED
LOCKED: "DELETE the stale doc_type = 'LD' row if present. KEEP doc_type = 'LOAD' only" —
unambiguous regardless of what the LOAD value should be). Left the `LOAD` counter's value alone.
Flagging for whichever seat does this last to set the real number against live state at that
moment, not a stale document.

## Rows captured before deletion

- **border_crossing_events** (5) — 5 real-looking Laredo-II crossing events, Aug 11 + Aug 30
  (repeated, same vehicle `ea1b0fe4`, 4-5 min customs clearance each) — no driver_uuid/load_uuid
  set on any of them (both NULL), unlinked probe telemetry
- **intransit_issues** (2) — `b234f3e8` "CODEX LIVE TEST... maintenance triage and convert-to-WO
  verification" · `55396eb6` "TEST-CC3-BATTERY-20260824... void after proof"
- **customer_notify_preferences** (1) — one customer's notification opt-in row, no test marker but
  paired with the same 2026-08-29 `created_at` batch-timestamp as a dozen other fixture rows this
  purge has already removed elsewhere (`02:01:48.343036`) — same seeding pass
- **equipment_transfer_requests** (1) — `3b575901`, `transfer_location: "USMCA_P23_SMOKE_2026-08-12"`
- **ocr_intake_queue** (1) — every field literally "TEST DATA keep" or "UNKNOWN"
- **ratecon_extractions** (1) — `model_id`/`error_detail`: "TEST DATA keep"
- **load_id_reservations** — already 0 by the time this ran (see above)

**stop_arrivals (1 row) — COULD NOT DELETE, append-only**: `80628c68`, driver_id
`9f35cf21` — **the known is_sample_data=true sample driver**, another reference this session's
sample-driver investigation had not previously found. `ERROR: dispatch.stop_arrivals is append-only
— DELETE is not allowed`. Same class of safeguard as the other append-only rows this purge has
flagged (not forced through).

## RESULT — live on Neon, before vs after

AFTER: every dispatch table alphabetically before `stop_arrivals` reads 0. `stop_arrivals` = 1
(append-only, flagged above). No other dispatch table carries a nonzero USMCA row.
