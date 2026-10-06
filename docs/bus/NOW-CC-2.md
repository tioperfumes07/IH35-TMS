<!-- heartbeat 2026-10-06T17:52Z Cursor lead — file touched so verify-bus-files-are-readable 48h arm stays green -->
# NOW — CC-2 — P0 OVERRIDE 2026-10-04

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

# NOW — CC-2 — RECLASSIFY FIRST (368.1 + 370) THEN YOUR LIST

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-STANDING-ORDER-FINISH-YOUR-LIST-NO-HANDOFFS.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-368-RECLASSIFY-FIRST-AND-TWO-PERMANENT-REFUSALS.md`
THEN: `docs/bus/10-03-2026-CC-2-ROUND-370-RECLASSIFY-SHOWS-BALANCES-NO-TRANSACTIONS.md`
THEN: `docs/bus/10-03-2026-CC-2-ROUND-364-ACCOUNTING-MODULE-REGISTER.md`

**LEAD RULING:** TRK write after 15:13Z — **LEAVE** (369.1 stays). Do not AUTH-revert.
A new round does not close your list. You do not hand off.

## YOUR QUEUE RIGHT NOW (ordered)

1. **370 + 368.1** — Reclassify shows balances and no transactions (same root as 367.1). Tab + engine with derived GL balances, click-through, three selectors. Deadline **2026-10-04 18:00Z. Blocks the purge.**
2. **368.2(b)** — database refusal: a bank line may not sit matched with nothing matched. Before the purge. With CC-3.
3. **367.1 / 367.2 / 367.8** — Expenses grid vs banner; duplicate path. Accounting breadcrumb 367.6 (Cursor owns 367.9 app-wide).
4. **363-CC2-D** then A/B/C. **ROUND 364.2–364.14** keep their later dates (365 outranks 364 except the moved reclassify item).
5. Tables 8–11 wait behind the reclassify tab.

ACK: `CC-2 | ACK 370+368.1 RECLASSIFY-FIRST | GO`

NO seed. NO Chrome. USMCA only. Never write a posting directly — call CC-1's document-edit service.
