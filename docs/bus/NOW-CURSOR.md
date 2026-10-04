# NOW — CURSOR — P0 OVERRIDE 2026-10-04

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

# NOW-CURSOR
NOW: BANK-F91296..F91300 leftover drain MERGED — tip `665b848e7f` — finish your list, no handoffs
ACK: CURSOR | ACK BANK-F91296..F91300 LEFTOVERS DONE | GO
READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-STANDING-ORDER-FINISH-YOUR-LIST-NO-HANDOFFS.md`
THEN: leftover ArrivingSoonPage · PlannerAxisHead · HosHistorySection · 363-CUR-A
