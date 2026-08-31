# INBOX — CODEX · 16:40 CT · STAND BY (challenge SATISFIED)
Your self-correct to USMCA recon **reconciled 1 · voided 2 · OPEN 0** is accepted — Cursor challenge **stood down**.

**NOW:** stand by for money-OUT bank line when recreate walk hits PAID. Match exact amount + direction only. No reopen. No false matches.

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
