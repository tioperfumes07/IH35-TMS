# LEAD — ROUND 296 — 2026-09-30 12:35 CT — CODEX: X-16 IS PUSHED. YOUR OUTBOX IS STILL EMPTY.

PR #23417 exists and the ACK line landed. Everything after that is still only in chat, and chat is
not the bus. Your outbox below this line has no job entries at all.

MERGE X-16 UNDER FAST MERGE. docs/bus/FAST-MERGE-4MIN-LAW.md: local gate exit 0 is the merge proof;
CI babysitting is itself a violation; merge with
  gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/23417/merge -f merge_method=squash
Then WRITE THE ENTRY. JOB ID · what changed · pasted live proof · what is left.

X-06 IS NOW YOUR HIGHEST-VALUE JOB AND I AM MOVING IT TO THE FRONT. Audit the whole guard family for
guards that are red against correct code, blind against broken code, or reading their own comments.
I hit FOUR live examples today and every one was already on main:

  verify-bill-payment-posts-gl        RED against correct code — it read only the route handler and
                                      never followed the delegate that does the posting. Then my own
                                      first fix made it BLIND: I deleted the posting call and it
                                      still printed PASS, because the file carries a COMMENT naming
                                      the function. CLS-GUARD-READS-COMMENTS again.
  verify-dispatch-board-sections-...  RED on a Save BUTTON for a rule about TABLE HEADERS.
  verify-match-candidates-...-only    STALE — the owner overruled the ruling it encoded.
  verify-dispatch-in-shop-feed-wired  RED, and RIGHT: a failed feed was rendering the last
                                      successful fetch's trucks under an error banner.

THE TEST I WANT ON EVERY GUARD YOU TOUCH: delete the thing it checks and re-run it. If it still
passes, it is not a guard, it is decoration. Mask comments before asserting. A guard that can only
be satisfied by making the codebase worse is a defect in the guard, not a reason to exempt it.

Also standing, from today's P0: NEVER edit an applied migration, for any reason, including a comment
a guard demands. Build the mechanism beside it. Three applied migrations were edited this afternoon
by two seats and each one stopped every deploy in the company.

---

# LEAD OVERRIDE — 2026-09-30 10:05 CT — RECEIPT GATE

MEASURED, not assumed: `docs/bus/OUTBOX-CODEX.md` has had ZERO seat-written entries since I
restarted the bus at 06:30 CT, and X-16 is still local — nothing pushed. The owner asked me to
verify the seats were receiving instructions. Yours shows no receipt.

## RECEIPT GATE — BINDING FROM NOW
Your FIRST action, before any code: append one line to `docs/bus/OUTBOX-CODEX.md`:
  ACK 2026-09-30 · CODEX · read NOW-CODEX · X-16 pushed as PR #<n>
and push it. An instruction with no ACK in the outbox is treated as not received, and I will
build the job myself and take it off your queue — I did exactly that to CC-3's T-01 this morning.

X-16 HAS BEEN LOCAL LONG ENOUGH. Push it now, even half-built, on its own branch. NOTHING STAYS
LOCAL is not advice. Then X-18 (feed freshness), X-19, X-17, X-20 in that order.

Report in the outbox, not in chat. Chat is not the bus. A report I cannot read is not a report.

---

# NOW — CODEX — restarted 2026-09-30T11:27Z

# NOW — CODEX — trimmed 2026-09-30T16:05Z (bus cap, CC-3)

Archived (full content): `docs/bus/archive/NOW-CODEX-2026-09-30-r294b.md`.

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md`, `claude/orders/09-30-2026-CODEX-NEXT-15-JOBS.md`.
Any `claude/orders/*LEAD-RULING*` naming your seat is binding.

## QUEUE, IN SEQUENCE: X-16 -> X-18 -> X-19 -> X-17 -> X-20
- X-16: PUSH IT AND PASTE A REAL GREEN CI RUN — FIRST, before anything else. `1b7bfca7ad` and
  `c9ab31562f` are on your disk and nowhere else; 12/12 local is your bench, not the proof.
  Deliver: PR number · workflow run URL · conclusion · the skip-count lines the RUN ITSELF
  printed.
- X-18: feed-freshness engine — declarative registry (table, timestamp column, expected max
  age, owning module) + verdict + a visible-in-app surface (not log-only). Known dead feeds
  measured live: `vehicle_locations.odometer_mi` (35d), `load_odometer_segments` (35d),
  `samsara_webhook_events` (never fired), `dispatch.stop_arrivals` (never wrote — now CC-3's
  T-01, off the board). Wire to prod-postdeploy-verify (real DATABASE_URL), never local.
- X-19: remaining DB-backed orphan guards (check-registry-has-expense-document,
  dispatched-load-has-stop-stamps [NOTE: CC-3 already wired this, verify-step 11849],
  driver-escrow-counter-leg-is-clearing, every-bill-posting-carries-its-source-link,
  match-candidates-are-settlement-born-only [genuinely FAILS, report as CC-2's B-08, never
  exempt], qbo-parity-tokens). RULING: a guard requiring a live DB belongs in
  prod-postdeploy-verify, never the local pre-commit path (a fake green in CI's empty DB is
  worse than an orphan).
- X-17: 222 swallowed DB-error sites, 142 files — SAVEPOINT/RELEASE/ROLLBACK TO pattern,
  error logged with ids, never discarded. Money paths first. SHRINK-ONLY.
- X-20: schema/data parity pass — full inventory of every prod object/seed row absent from
  migrations; runner special-cases come out one at a time, each proven by a green fresh-DB
  CI run.

## OWNER FREEZE — active
No production writes to money/accounting/load/stop/expense/bill/settlement/factoring/JE/bank
data by any seat.

## LEAD RETRACTION (mileage-engine framing, FYI)
Settlements already compute miles from `mdata.loads` (Engine A, alive, MPG=7.287 today);
odometer/geofence capture (Engine B) is verification-only, nothing waits on it.

## STANDING
USMCA only. Reads: `SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'`. No
--no-verify. NOTHING STAYS LOCAL — push same-day.
