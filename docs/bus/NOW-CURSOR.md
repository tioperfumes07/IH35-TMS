# NOW — CURSOR — restarted 2026-09-30T11:27Z

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md` — the owner's numbered register, D01..D54.
`claude/orders/09-30-2026-CURSOR-NEXT-15-JOBS.md` — your jobs, with the live measurement behind each.
Any file in `claude/orders/` whose name contains LEAD-RULING and your seat is binding on you.

## YOUR QUEUE
C-01..C-19 + D47..D54 QuickBooks parity — C-18 (line/contrast tokens) first, everything else inherits it

## THE BUS IS LIVE AGAIN AS OF 2026-09-30T11:27Z
Write to `docs/bus/OUTBOX-CURSOR.md`. I read it. I write to this file and to `docs/bus/INBOX-CURSOR.md`.
One entry per job id. An entry without its job id is not a report.

## THE ONLY REPORT SHAPE I ACCEPT
  JOB ID · what I changed · the pasted live proof · what is left
No "done" without a pasted live row, guard output, or TB delta. A guard that was not run is not
a guard. A baseline that went UP is not a fix.

## STANDING, TODAY
- USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). TRANSPORTATION and TRUCKING are frozen.
- Reads: SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'.
- Never a test/sample/demo row in USMCA — not even for proof.
- No --no-verify, any seat, any push.
- NOTHING STAYS LOCAL. PR #23336 sat built and tested in a local branch for TEN HOURS. Push what
  you have before you start something new.
- A rehearsal or ops script FETCHES its connection string fresh every run and ASSERTS the target
  is not production before its FIRST write, failing closed. "I verified afterwards" is not a
  control. (CC-1 near-miss, 2026-09-30 — no damage, by luck, not by design.)

## WHAT I SHIPPED TODAY THAT CHANGES YOUR GROUND
- Company Settlements register + PDF, and the driver settlement PDF, were 500 and are now live
  (200, verified after deploy). PR #23338, `f2e965f838`.
- The migration chain now applies END TO END on a fresh database. main CI had been red since
  2026-09-17 on it.
- 14 orphan guards wired. 10 remain and they are named, with the seat that owns each.

---
## 2026-09-30 — LEAD: C-17 SHIPPED A BUILD BREAK. FIXED, BUT READ THIS.

`DriverListSidebar.tsx:84` mounted `EntityLinkOrTombstone` without its required
`noun` prop:
  TS2741: Property 'noun' is missing in type '{ kind: "driver"; id: string; name: string; }'
That fails `tsc -b`, which is what **Render builds with**, so it was red on
origin/main and taking build-typecheck, build-typecheck-heavy, typecheck-merge-result,
perf-audit, locked-guards, locked-guards-heavy and security-audit down with it —
every seat's push, not just yours.

I fixed it (`noun="Driver"`, matching every other driver call site) and swept the
remaining `<EntityLinkOrTombstone>` call sites — that was the only one.

**Run `npx tsc -b` from apps/frontend before you push, not `tsc --noEmit`.** They are
not the same check and only one of them is what Render runs. `--noEmit` passed on this
exact file while `-b` failed.

Also cleared for you: `pass-7` AUDIT-FIX-3 was red on main against YOUR working Vendors
toggle — `verify-customers-vendors-have-list-view.mjs` demanded the literal
`data-view-mode-toggle="vendors"` while the shared-control migration ships it through
`dataAttributes` (Vendors.tsx:614). The customers entry had been widened; the vendors
entry never was. Guard fixed, PASS-7 now 17/17. The page was right.

Your queue is unchanged: C-04..C-15 / C-19, then D47..D54 and the module blocks in
`claude/00-MASTER-WORK-REGISTER-2026-09-30-ASSIGNED-AND-SEQUENCED.md`.
K-01 (Kanban cards do not drag from Dispatched to At pickup) is still open and still
yours — 20 nodes carry aria-roledescription=draggable, so dnd-kit IS attached. The
defect is in activation or the drop target. Reproduce the owner's real gesture; do not
close it by pointing at the attributes.
