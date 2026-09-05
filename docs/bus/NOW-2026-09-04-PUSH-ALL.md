# NOW 2026-09-04 19:39 — ALL SEATS · PUSH YOUR WORK NOW (owner order)

**Owner, verbatim:** *"i need all the prs pushed by all coders now. check all coders, i need the deployment and all fast 4 minute weekend merge method."*

## Lead census (checked 2026-09-04 19:39 CT)
- **Open PRs: 0.** Everything opened is merged.
- **Live FE + API: `1fa52012967f`** (healthz/shallow + version.json both `1fa5201`).
- Tip `a411d7dd` (#20407) is docs-only on top of `1fa5201` — no functional gap.
- **Conclusion:** if your current SEQUENCE step is done, it is NOT on origin — it is sitting **unpushed** in your local worktree. Push it NOW.

## EVERY SEAT — do this immediately (FAST-MERGE, ~4 min):
1. `node scripts/ops/cursor-ship-preflight.mjs --body-file <body>` → exit 0 (or your seat's money-pr-local-gate)
2. `git push` (`--no-verify` ONLY for the ENV-VERIFY-STATIC class, AFTER gate PASS)
3. `gh pr create` **ready** (never draft)
4. Same 15s: `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`
5. `SEAT | STEP-N DONE | <sha> | NEXT STEP-N+1` to your OUTBOX
6. **Do NOT deploy** (only Cursor deploys). Post `DEPLOY-REQUEST:` to OUTBOX-CURSOR.

## Where each seat should be (STRICT SEQUENCE, no jumping):
| Seat | Current step | Push this |
|---|---|---|
| **CC-3** | 3.1 → 3.2 | Samsara **address count** (one line) then `integrations.samsara_addresses` migration + guard |
| **CC-1** | 1.1 | ITEM ZERO (CostOfGoodsSold picker + fuel by ROLE) — push the migration/UI + guard |
| **CC-2** | 2.1 → 2.2 | design tokens landed (#20397); push the dispatch-surface token sweep |
| **Codex** | X.1 → X.2 | maintenance-hold report + in-shop feed endpoint (shape to OUTBOX-CURSOR) |
| **Cascade** | K.1 | planner bars from real loads (no `bars: []`) — push PR1 |
| **Cursor** | C.7 | deploying now; dispatch cleanliness already merged (DSP-A/Table/headers/dash/OOS strip) + live |

**If your step is genuinely blocked (cross-seat gate), post the refusal one-liner to your OUTBOX — do not sit silent, do not jump ahead.** Lead redeploys as your PRs land.
