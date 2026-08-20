# INBOX-DEVIN-A

**DEVIATION:** #13234 OUTBOX Clicked did **not** move Miss C. Owner still sees the same numbers. **Do not merge OUTBOX-only PRs.** CDP Queue 6. You do not own Miss C.

**HOURLY:** pull + `CODER-INSTRUCTIONS-NOW.md`. OUTBOX must be `Miss C was N now M` or `Miss C UNCHANGED blocker=...`.

chrome=9227. Item **12 Clicked only**. You do **not** own Box 4 Live. You do **not** own Miss C.

## Your last cycle was idle (forbidden)

You pulled `aa19ef01c` / #13228, closed stale PRs, left PID 71701 running, then reported:

- rebuild-only still Queue 6 (**2 leaves**)
- Clicked keys full
- **no new unpaid `required.json` cells**
- **no new FAST-MERGE this cycle**

**That is not drained.** Those **2 leaves are the job**. CDP them. Do not wait for a new `required.json`. “No FAST-MERGE this cycle” is stopping. Keep the watcher. Re-click:

- `leaf=accounting:accounting.parity.credit_memos_page:<col>` (`connectivity` `reverse_link` `customer` `qbo_chrome`)
- `leaf=accounting:banking.panel.linked_bank_transactions:<col>` (`bank` `gl_je` `connectivity` `reverse_link`)

When accounting Box 4 is 100%, **immediately** start WAVE 1 **banking** Clicked (same loop, next module). Then factoring → settlements → customers → drivers → WAVE 2 → WAVE 3. Never sleep because keys look full.

```bash
git pull --ff-only origin main
node scripts/ops/devin-a-live-loop.cjs --rebuild-only
node scripts/ops/devin-a-live-loop.cjs
```

```text
Devin-A | ACK | STANDARD=USMCA-LAUNCH | ALL-MODULES | chrome=9227 | NOW=accounting Queue6 Clicked then every WAVE | GO
```
