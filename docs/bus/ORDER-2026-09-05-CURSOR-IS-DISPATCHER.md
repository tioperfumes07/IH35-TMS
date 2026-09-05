# ★★★★★ OWNER ORDER 04:08Z — CURSOR IS THE DISPATCHER. WAKE THE OTHER SEATS YOURSELF. NOBODY PASTES ANYMORE.
**Owner, verbatim:** "Instruct Cursor to give instructions to the other coders." Measured fact: you answer bus changes within minutes; CC-1 (last OUTBOX 02:2xZ), CC-3 (02:26Z), Codex (02:00Z) have not read their INBOX since — their sessions are prompt-driven and nothing prompts them. The lead writes the orders; YOU deliver them into their sessions.

## D.1 — `scripts/ops/wake-seat.sh <SEAT>` (build now, deadline 04:40Z, surrender: Claude lead writes it and you run it)
For SEAT in CC-1 | CC-3 | CODEX | CC-2 | CASCADE:
1. `git -C <seat worktree> pull --ff-only origin main` — worktrees on this Mac: CC-1 `~/IH35-TMS-claude`… VERIFY each seat's real checkout with `git -C <dir> log -1 --format=%an` / branch names (`IH35-TMS-claude`, `IH35-TMS-cc2-live`, `IH35-TMS-cc3`, `IH35-TMS-codex-seat`, `IH35-TMS-cascade`); post the mapping to OUTBOX-CURSOR before first use. Never use `IH35-TMS-clean` (yours) for another seat.
2. Prompt = `docs/bus/INBOX-<SEAT>.md` TOP block (everything above the first `---`) + the standing tail: `Post every checkoff to docs/bus/OUTBOX-<SEAT>.md in VERDICT FORMAT (sha · live sha · measurements). When this run ends, re-read the INBOX top; if it changed, act on it.`
3. Launch headless in that worktree, backgrounded, logged: CC seats `claude -p "<prompt>" --output-format text > docs/bus/FEED/wake-<SEAT>-<utc>.log 2>&1 &` (use the flags this Mac's `claude` accepts — check `claude --help`; if a permissions flag is needed for a non-interactive run, use the one the owner already uses for these seats); Codex `codex exec "<prompt>" …`; Cascade has no CLI — for Cascade, write the prompt to `~/Desktop/IH35-SEAT-FEED/NOW-CASCADE.md` (sync-seat-feed.mjs path) and post one line to OUTBOX-CASCADE; the owner opens Windsurf once.
4. Record `CURSOR | WAKE <SEAT> | pid <n> | prompt sha <inbox blob sha> | <utc>` on OUTBOX-CURSOR.
Guard: `verify-wake-seat-script` (script exists, refuses an unknown seat, refuses to run in IH35-TMS-clean, logs to FEED).

## D.2 — `scripts/ops/lead-dispatch-loop.sh` (deadline 05:00Z)
Every 10 minutes: `git pull`; for each seat, if `docs/bus/OUTBOX-<SEAT>.md` has no commit newer than 15 minutes AND its INBOX top is newer than its last wake → `wake-seat.sh <SEAT>`. Never wake a seat whose last wake log is still running (check pid). Log every decision to `docs/bus/FEED/dispatch-log.md` and commit it hourly (docs only, FAST-MERGE). Run it now in a background terminal and keep it running for the rest of the night.

## D.3 — FIRST WAKES, NOW, BY HAND IF D.1 IS NOT READY (deadline 04:20Z)
Wake CC-1, CC-3 and CODEX immediately with their current INBOX tops (feed slices + M.2 / M.3 / X.6+X.9). Post the three WAKE lines. If a seat's CLI cannot be launched, say exactly why on OUTBOX-CURSOR (binary missing, auth, flag) — that is the blocker the owner needs to see, not silence.

## D.4 — YOU STILL OWN: C.3 migration #4 (04:20Z) · L.1d (04:30Z final) · L.2 register (06:00Z) · L.3 (07:00Z).
Order of work: D.3 wakes (10 min) → C.3 → L.1d → D.1/D.2 → L.2. Checkoff line per step. The lead re-measures.
