# INBOX — CODEX · 16:40 CT · STAND BY (challenge SATISFIED)
Your self-correct to USMCA recon **reconciled 1 · voided 2 · OPEN 0** is accepted — Cursor challenge **stood down**.

**NOW:** stand by for money-OUT bank line when recreate walk hits PAID. Match exact amount + direction only. No reopen. No false matches.

## OWNER CORRECTION — numbering findings withdrawn/respecified · 2026-09-01

- `INV-NUMBERING-01` is **WITHDRAWN**. A load number carried into the invoice number is the owner's intentional one-trip linkage design, not a defect.
- `INV-F-DISPLAYID` is **WITHDRAWN** for the same reason. Do not build against it.
- `SETL-NUMBERING-01` is **WITHDRAWN** for the same reason. Do not build against it.
- `EXP-NUMBERING-01` remains real but is **RESPECIFIED**: 129 of 132 expenses have `expense_number = NULL`; the required format is `<load#>-<seq>`, matching `L-20260831-0004-1` and `L-20260831-0004-2`. The NULLs are the defect; the format is intentional.
- Pro forma behavior is locked by `docs/lockdown/OWNER-DECISIONS-FINAL-2026-07-26.md` §B: auto-create the same invoice record at booking, label it "Pro Forma Invoice," treat broker advance as a liability applied/netted at POD, and auto-convert that record to the official invoice and submit it to factoring at POD. No separate record type, list, or numbering series; do not alter conversion.
- Before proposing design, search the locked owner decisions and `docs/bus` decision records. No product code is authorized by this correction.

## OWNER LAW — no seat-created financial records in production · 2026-09-01

- Codex must not create production financial fixtures, probes, proofs, scratch records, bank transactions, or standing test records.
- The only permitted seat-involved production creation is an owner-ordered live walk whose exact records are listed and sanctioned before starting. Every such record must be voided in that same session and reported with both its record ID and reversing journal-entry ID.
- A fixture surviving the session is contamination. Seat-written memo instructions such as "do not void" or "KEEP TEST" are forbidden; seats never override the owner inside his ledger.
- Text/name matching is not a safety control and must not be used to distinguish owner money from seat data.
- Item 36 may consume only a legitimate owner-created money-out row or a correctly manifested owner-ordered walk row. Codex will not manufacture its prerequisite.
- CC-2 owns the workflow-named enforcement guard. Codex will not duplicate or steal that implementation.

## QUEUE DISCIPLINE — owner law appended 2026-09-01

- New owner instructions append to this queue; they do not redirect or discard in-flight work.
- Finish or safely park the current item before starting the next queued item.
- Never stash, reset, or check out away from uncommitted work because a new instruction arrived.
- Never abandon a half-finished branch. If two instructions conflict, report the conflict and ask rather than silently choosing.
- Persist every received instruction in this INBOX before acting on it so the queue survives context loss.
- Every status report names `DOING`, ordered `QUEUED`, `BLOCKED` with owner/unblock, and evidence-backed `DONE`.
- If an item leaves the queue without completion, state that explicitly and explain why.

### Current durable queue

- `DOING`: none; #18990 corrected the entity inversion and is verified on `origin/main`.
- `QUEUED`: monitor for the legitimate money-out row produced by CC-1's real settlement chain; verify it in the same turn it appears.
- `BLOCKED`: full-register Item 36 money-out match — waits on CC-1's authorized reconciliation/PAID path. No fabricated bank row, session reopen, or false-direction match.
- `DONE`: Item 34 parity grading (#18984); Item 35 corrected driver-account audit (#18990). The superseded/inverted #18987 is not evidence.
