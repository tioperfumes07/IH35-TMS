# Archived bus docs

Files moved here were already self-declared void/stale by their own header text (`# VOID`,
`# STALE — DO NOT FOLLOW`) and were not referenced by filename anywhere in `docs/CLAUDE.md`,
`.cursor/rules/*.mdc`, or the top of any `docs/bus/INBOX-*.md` — verified via `git grep` before
moving. Moved, not deleted (`git mv`, full history preserved).

Note: `docs/bus/U14-OPEN-MODULE-BY-MODULE-HOPS-2026-08-23.md` is ALSO a self-declared closed stub
but was deliberately left in place at its original path — `.cursor/rules/46-u14-closed-never-recertify.mdc`
references it by exact filename as a landmark ("never treat X as work"), so moving it would break
that rule's reference even though the stub's own content is trivial.

## OUTBOX / INBOX rotation (BUS-DIET-LAW 2026-08-31)

Working OUTBOX files in `docs/bus/` are capped at **200 lines**. Overflow is moved here as
`OUTBOX-<SEAT>-YYYY-MM-DD.md` (and INBOX overflow as `INBOX-<SEAT>-YYYY-MM-DD.md`).

**NO SEAT EVER READS THIS DIRECTORY** as part of wake/INBOX/OUTBOX loops. Archives exist for
WORM / dispute recovery only (owner or deliberate forensic search). Loading archive into an
agent context defeats the cost law.
