# OWNER RULING — Flag-flips / money-posting enablement is the owner's SOLE decision

**Date:** 2026-07-11 · **Authority:** Jorge (owner) — in writing · **Status:** PERMANENT, supreme (owner decision)

This is a durable owner ruling. Per skill §0 precedence, an *owner decision* is AUTHORITY and is never
overridden by a doc, guard, sweep, or agent claim. It supersedes any earlier wording (in the skill, memory,
CPA-decision notes, or trackers) that implied an external gate on enabling money-posting.

## The ruling

1. **Accounting model — parallel double-books, no cutover.** TMS and QuickBooks run in parallel
   **indefinitely**. There is **no fixed cutover date** (the earlier "system-of-record through 12/31/2025"
   framing is retired). **QuickBooks is the source of truth.** The TMS books are a CLONE-ONCE +
   RECONCILE-ONLY parallel set with **no write-back** to QBO.

2. **Reconciliation is the trust mechanism.** The **twice-daily reconciliation** — a correctness test that
   flags every transaction whose categorization differs between TMS and QBO — is how trust is established and
   maintained, continuously. It is not a one-time cutover event.

3. **Enabling money-posting is the OWNER's SOLE decision.** Turning on any GL-posting path, flipping any
   money/GL feature flag (e.g. `BILL_GL_POSTING_ENABLED`, `BILL_PAYMENT_GL_POSTING_ENABLED`,
   `BANK_TX_SPLIT_GL_POSTING_ENABLED`, factoring/property-tax/transfer GL flags, period-close flags), or
   declaring the system trustworthy, is **decided by the owner alone**. **No external, CPA, or accountant
   sign-off is required — ever.**

4. **GUARD informs, never gates.** GUARD (and any verification agent) supplies **technical-correctness proof**
   — Neon-branch tie-out, 0-orphan FK checks, balanced-JE proof, migration VALIDATE — to **inform** the owner's
   decision. That proof **never gates** the decision and is never a substitute for it. A green proof is
   evidence, not authorization; the owner still decides.

## What this changes for the coder/agent

- **Do NOT** cite `CPA sign-off`, "accountant approval", "external sign-off", or a "12/31/2025 cutover" as a
  precondition for any flag flip or money-posting enablement. Those gates do not exist.
- **Still true (unchanged):** the coder/agent NEVER flips a money/GL flag or promotes a financial migration to
  prod on its own initiative (skill §1.4). Flags stay **default OFF**; the **owner** flips them. Build-and-hold
  + GUARD proof remain the technical pipeline; the owner's word is the only authorization to enable.
- When surfacing a flag-flip decision, present: (a) GUARD's technical proof, (b) a recommendation, and (c)
  "your call" — never `pending CPA`.

## Supersedes / reconciles

- Retires the skill §6 phrases: *"QBO is the system-of-record through 12/31/2025"* and *"Money-posting env
  flags stay OFF until owner sign-off + Neon tie-out."* (Updated in this same change.)
- Any memory or tracker note (e.g. CPA-locked-decisions) that reads as an external gate on enablement is
  **informational history only** — this ruling controls. Trust proof continues; external sign-off does not gate.
