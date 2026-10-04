# NOW — CC-3 — P0 OVERRIDE 2026-10-04

**READ FIRST: `docs/bus/10-04-2026-ALL-SEATS-P0-STOP-MAIN-CANNOT-BOOT.md`**

main cannot boot and has not booted for ~17 hours. EIGHT consecutive backend deploys
`update_failed` / `==> Timed Out` on a duplicate route mount. Production is serving the
pre-#25153 build. **Stop merging to main until a backend deploy reaches `live`.**

- **CURSOR** — park the leftover/slate sweep at BANK-F91551. Land
  `claude/r396-form425c-exhibits-duplicate-route-boot-crash` (rebased on current main):
  `npm run build && npm run ci:boot-api-smoke` MUST pass on macOS first, then push → PR →
  merge → paste the deploy id and status. Then PR #25143, then r394, then r395.
- **CC-1 / CC-2 / CC-3 / CODEX** — your OUTBOX carries nothing after 2026-09-30. Post one
  line now: what you are on, or that you are idle. An unreported seat is an idle seat.
  Your queue below is unchanged. Nothing is handed off.

---

# NOW — CC-3 — FINISH YOUR LIST (363-B + 367.7 + 368.2b)

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-STANDING-ORDER-FINISH-YOUR-LIST-NO-HANDOFFS.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-367-EXPENSES-SCREEN-AND-DUPLICATE-PATH.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-368-RECLASSIFY-FIRST-AND-TWO-PERMANENT-REFUSALS.md`
THEN: `docs/bus/10-03-2026-CC-3-ROUND-363-LOAD-LINEAGE-THE-SEND-BACK-AND-THE-DERIVED-ARTIFACT-REGISTRY.md`

A new round does not close your list. You do not hand off.
Lane-cross granted for `journal_entry_postings.load_id` if CC-1-A slips: `10-03-2026-ALL-SEATS-LEAD-RULING-LANE-CROSS-ACCT-F9855-AND-POSTING-LOAD-ID.md`.

## YOUR QUEUE RIGHT NOW (ordered)

1. **363-CC3-B** — send-back keeps the match; does not overwrite `matched_*`. Deadline **2026-10-04 06:00Z**.
2. **367.7** — three-way split of the 167, DIRECT endpoint, SQL pasted. Deadline **2026-10-04 06:00Z**. Gates the purge.
3. **368.2(b)** — matched-with-nothing refusal, with CC-2. Before the purge.
4. **363-CC3-A / C / D** — load_id refusals after CC-1-A (or both halves if A slips) · derived-artifact registry · gate re-measure.
5. **TABLE 12 LAST.**

ACK: `CC-3 | ACK STRANDED-ROUNDS FINISH-LIST | GO`

NO seed. NO Chrome. USMCA only. DIRECT endpoint only — a 0 from the pooler is MASKED.
