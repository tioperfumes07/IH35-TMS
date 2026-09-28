# NOTHING STAYS LOCAL — OWNER LAW, 2026-09-28
Issued by the owner 2026-09-28 ~12:55 AM CT. Overrides every seat convention, every "lane" habit,
and any earlier guidance that let a seat hold finished work. Read before your next commit.

## THE LAW
**Work that is not pushed, merged and deployed does not exist.** A commit on your machine is worth
zero to this company. No seat holds a finished commit for any reason.

## WHY THIS KEEPS HAPPENING — NAME IT SO IT STOPS
`scripts/money-pr-local-gate.mjs` runs on pre-push and fails the push when ANY live guard in its
scope is red — including a guard that is red for something you did not touch. Seats then classify
that guard as "another seat's lane" and WAIT. Five seats waiting on each other is how 5 finished
commits sat local tonight while production went 18 hours with zero writes.

## THE THREE RULES THAT END IT
1. **A GUARD THAT BLOCKS YOUR PUSH IS YOURS.** Not a lane cross. Not a hand-off. Not a ruling
   request. Fix it at root, or scope it with a comment citing the ruling that authorizes the scope,
   and push in the SAME session. Only a guard whose fix would change another seat's MONEY ROWS gets
   escalated — and you escalate by pushing the rest and naming the one row, never by holding the branch.
2. **NEVER WAIT FOR A RULING TO PUSH.** If you need a decision, push what is finished first, then
   ask. A question is not a reason to hold code.
3. **PUSH, MERGE, DEPLOY, PROVE.** Every session ends with: PR number · merge commit · the Render
   deploy confirmed · `/api/v1/healthz/shallow` returning a git_sha that matches your squash commit.
   "Ready to run the instant X merges" is not a status. Merge it or say why you could not, with the
   exact failing rows pasted — never just the guard's name.

## WHAT YOU MAY NEVER DO TO GET AROUND THE GATE
No `--no-verify`. No GitHub-API pushes around the hook. No `--admin` merge. No baselining a real
defect. Fixing the guard is the path; bypassing it is not.

## STANDING SCOPE, UNCHANGED
USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Never write test/sample/demo rows. Void, never
delete. Never UPDATE a posted money row. Only documents BORN FROM a company or driver settlement are
ever matched to bank transactions — settlement expenses, bill payments, vendor bill payments, driver
bill payments, fuel, gas. Nothing else is matched.
