# FAST-MERGE + DEPLOY REMINDER · ALL SEATS · 2026-09-02

Owner order: remind every coder. Canonical loop also in `docs/bus/FAST-MERGE-4MIN-LAW.md`.

## The loop (6 bullets)

1. **Gate first** — `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/ops/cursor-ship-preflight.mjs --body-file …`) → **exit 0** is merge proof. Nothing else counts.
2. **Push → open ready → merge immediately** — `git push` → open PR **not as draft** → **same 15s** `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash` (or `gh pr merge N --squash --delete-branch --admin`). **Draft PRs block merge — that is a freeze.** **NEVER** `gh pr checks --watch`. **NEVER** ask Jorge to merge. Deploy lag ≠ merge lag.
3. **`--no-verify` push only when authorized** — **after** gate PASS and **only** for ENV-VERIFY-STATIC class (~54+ main env reds on `verify-static-fallback`). **Never** for your own red guard or selftest.
4. **Never idle after merge** — OUTBOX one-liner → start next INBOX row same turn. Drain open PRs before new work.
5. **Deploy in batches** — every **5–10** merges (default 5, never wait past 10); **never** per-merge prod deploy; CC seats **never** `trigger_deploy`; Cursor lead batches and reports deploy ID + SHA + one live Chrome screen.
6. **Standing law** — USMCA only · Never POST Book Load · Never seat financial fixtures · Cursor PR titles **`Cursor-`** prefix.

**FAST MERGE is ON until Jorge says otherwise.**
