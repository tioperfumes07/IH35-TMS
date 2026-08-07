# IH35-TMS — PERMANENT MODEL-TIER POLICY (all coders) — don't spend tokens where cheap works, don't cheap out where money lives
**Owner-locked 2026-08-03. Applies to Cascade, Cursor, Claude Coder, GUARD. The DURABLE rule is task → tier; the
specific model per tier is adjustable as price/capability changes — verify current cost/capability before locking a
name. Golden rule: default to the LOWEST tier that can do the task CORRECTLY; escalate on failure; NEVER down-tier a
money task.**

## The invariant (read first)
Model tier **never** changes the proof bar. A cheap model's output still passes the ratcheting guard, the 3-gate for
money, and live verify — exactly the same as a frontier model's. Cheaper model ≠ weaker verification. Tiering saves
tokens on *how* the work is produced, not on *whether it's proven*.

## The three tiers (by task, not by agent)
**Tier A — FRONTIER (strongest available: e.g. Opus / GPT-frontier / Grok-4.5-high).** Use for anything where a wrong
answer costs money or trust: the financial cluster (`accounting.*`/`catalogs.accounts`/migrations/posting/GL/RLS),
root-cause debugging, architecture/design decisions, the audit **completeness-discriminator** reasoning, and GUARD
verification of money. **Do NOT economize here — correctness protects the company.**

**Tier B — WORKHORSE (strong mid: e.g. Sonnet, or GPT/Grok at standard).** Use for well-specified non-financial
feature work, writing guards/tests, wiring against a clear spec, the scoreboard build, non-trivial UI (e.g. the Loans
& Advances screens).

**Tier C — FAST/CHEAP (e.g. Composer / Cursor Auto).** Use for mechanical, deterministic, guard-checked work:
mechanical class waves (MISSING-CREATOR, BOX-IN-BOX, CALENDAR/DATE, DEAD-CLICK, picker wiring), design-token/palette
fixes, docs, repetitive refactors against Cascade's instance list. This is most of the UI volume — run it cheap.

## Escalation (one-way ratchet toward safety)
- Start at the tier the task type dictates.
- **Stuck** (2 red CI cycles / can't root-cause / the fix looks wrong) → **escalate one tier up**, don't grind.
- A mechanical task that turns out to hide a money or logic problem → **jump straight to Tier A**.
- **Never down-tier** a financial/migration task to save tokens. Money is Tier A, always.
- "Fable" / any unproven model: fine to trial on THROWAWAY mechanical work; never on money or correctness-critical
  until you've verified it holds the guard bar.

## Default per agent (starting point)
- **Cascade (auditor):** Tier A/B — auditing + the completeness discriminator are high-stakes (a wrong "0 = fine" is
  dangerous). Default strong; do not run the audit cheap.
- **Claude Coder (money lane):** Tier A default — it's the financial cluster.
- **Cursor (mechanical/frontend):** Tier C default for mechanical waves; Tier B for real feature UI + the scoreboard.
- **GUARD (verifier):** Tier A — the net must be sharp; don't cheap out on the thing that catches subtle errors.

## Token discipline
Prefer the smallest capable model, short focused context, and one wave at a time. But if the choice is *spend more
tokens* vs *risk a wrong money/accounting result*, spend the tokens — that's the owner rule (trust over speed). Tokens
are cheap; a wrong ledger is not.
