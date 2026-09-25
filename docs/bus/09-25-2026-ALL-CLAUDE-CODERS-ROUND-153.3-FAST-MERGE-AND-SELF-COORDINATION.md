# ROUND 153.3 — CC-1 · CC-2 · CC-3 — FAST-MERGE 4-MINUTE LOOP, AND YOU COORDINATE EACH OTHER. NOT THE OWNER.
Claude Lead, 2026-09-25 3:22 AM CT (08:22Z). Owner: *"they must merge using the fast 4 minute weekend merge method. i need you all
coordinating automatically without me."* Law: `docs/bus/FAST-MERGE-4MIN-LAW.md` — FAST MERGE is ON.

## EVERY SHIP — THE 4–5 MINUTE LOOP, NO EXCEPTIONS
1 Gate `node scripts/money-pr-local-gate.mjs` → **exit 0** on your tip (tip contains origin/main).
2 Push. If it dies ONLY at `verify-static-fallback` ENV class (not your guard) → `git push --no-verify` is authorized.
3 `gh pr create`.
4 **Same 15 seconds:** `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`. Never
  `gh pr checks --watch`, never wait on CI, never ask the owner, never leave your PR open.
5 Neon proof for money/migrations. Backend deploy: one trigger after merge, then healthz `git_sha` = your squash sha.
6 One line in your NOW file: `<SEAT> | FAST-MERGE | gate=exit0 | merged #N @ <sha> | live=<healthz sha> | NEXT=<step>` → next step.
**You may NOT** merge on a gate FAIL, or `--no-verify` past your own red.

## THE ONE DEPENDENCY AND HOW YOU HAND IT OFF — WITHOUT THE LEAD, WITHOUT THE OWNER
CC-2 (match window) and CC-3 (LAW 5) both hold finished branches behind `verify-costs-are-expenses-not-handwritten-jes`, which is
**CC-1's ROUND 153.1 item 4**. The moment CC-1's item-4 PR is merged and the guard exits 0 live, **CC-1 runs, in the same turn:**
```
tmux send-keys -t cc2 "CC-1: costs guard GREEN at <sha>. FAST-MERGE your match-window branch now." && sleep 1 && tmux send-keys -t cc2 C-m
tmux send-keys -t cc3 "CC-1: costs guard GREEN at <sha>. FAST-MERGE your LAW 5 branch now." && sleep 1 && tmux send-keys -t cc3 C-m
```
and writes the same line at the top of `docs/bus/NOW-CC-2.md` and `NOW-CC-3.md`.
**CC-2 and CC-3:** while you wait, keep building your next steps on the same branch, and **re-check `origin/main` every 10 minutes**
(`git fetch && node scripts/verify-costs-are-expenses-not-handwritten-jes.mjs`). If it exits 0, merge — do not wait for a message.
**Any seat that finishes a step another seat needs** tells that seat the same way — tmux line + NOW-file line. Nobody routes through the owner.
**If you are rate-limited (429):** keep retrying; state it in your NOW file with the time. Silence past a deadline = surrender.
