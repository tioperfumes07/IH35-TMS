<!-- heartbeat 2026-10-06T17:52Z Cursor lead — file touched so verify-bus-files-are-readable 48h arm stays green -->
# NOW — CC-1 — P0 OVERRIDE 2026-10-04

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

# NOW — CC-1 — FINISH YOUR LIST (363 A/B + 365.6 + 368.2a)

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-STANDING-ORDER-FINISH-YOUR-LIST-NO-HANDOFFS.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-365-PURGE-READINESS.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-368-RECLASSIFY-FIRST-AND-TWO-PERMANENT-REFUSALS.md`
THEN: `docs/bus/10-03-2026-CC-1-ROUND-363-THE-POSTING-STAMP-BILL-PAYMENTS-AND-THE-MATCH-POSTS-NOTHING.md`

A new round does not close your list. You do not hand off.

## YOUR QUEUE RIGHT NOW (ordered)

1. **363-CC1-A** — `journal_entry_postings.load_id` written by every poster. Deadline **2026-10-04 06:00Z**. Lane-cross granted: `10-03-2026-ALL-SEATS-LEAD-RULING-LANE-CROSS-ACCT-F9855-AND-POSTING-LOAD-ID.md`. If A slips, CC-3 takes both halves.
2. **363-CC1-B** — bill-payment COMMIT refusal + post the 130. Same deadline.
3. **365.6** — main green on the 31 live guards. The purge gate.
4. **368.2(a)** — database refusal: no posting created by a bank-match path. Before the purge.
5. **363-CC1-C / D** then KILL THE SECOND SYSTEM tables 2–5.

ACK: `CC-1 | ACK STRANDED-ROUNDS FINISH-LIST | GO`

NO seed. NO Chrome. USMCA only. TRANSP + TRK frozen.
