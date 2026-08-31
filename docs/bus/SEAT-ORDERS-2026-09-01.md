# SEAT ORDERS · 2026-09-01 01:00Z
Supersedes `SEAT-ORDERS-VOID-FIRST-2026-08-31.md` where they differ. Rulings live in
`OWNER-RULINGS-DRIVER-ACCOUNTS-AND-INSURANCE-REQUEST-2026-09-01.md`.

## CLOSED — delete from every queue, do not re-raise
- **`DISPATCH-NO-1500-MILE-MEXICO-RADIUS-BLOCK`** — owner: there is no mileage restriction.
  Devin-A's Laredo→New York result is **correct behaviour**. Nobody builds a radius block.

## STANDING LAWS
FAST MERGE (local gate → push → PR → `gh pr merge --squash --admin`) · **a red required check is a
STOP**, only Cursor overrides in writing · LIVE CHROME to create, Neon/SQL to verify · TEST-FREEZE
on proven hops · **a fix is not done until its guard is NAMED IN A WORKFLOW AND RUNNING** (4,490
guards are written and never run) · **a selftest must NEVER mutate tracked source** — copy to temp,
plant there · **never `git stash` another seat's work** · **search the locked decisions before
asking the owner anything financial** — a question already answered is a defect in us · NEVER IDLE.

## SEQUENCE
`P-A` proofs survive the void → `P-B` aggregate reporting → `P-C` VOID (421 sample rows) →
`P-D` re-run guards on the clean book → `P-E` one real chain → `P-F` posting trace → `P-G` August.
Driver accounts and the insurance request build **in parallel** — they are not gated on the void.

---

## CC-1 — money spine + driver accounts
**NEW TOP ITEM — every driver gets BOTH accounts, automatically.**
Locked decision (`.claude/skills/ih35-accounting-decisions` L114): **Cash Advance = ASSET,
Escrow = LIABILITY** (held-in-trust, returned 60–90d post-separation net of damage/late-fee/fine).
Live gap, USMCA, **86 Active drivers**: with advance **14** · with escrow **2** · **with NEITHER 73**.
1. Auto-create the **PAIR** on driver activation — never one without the other. That is the invariant.
2. Backfill all **86** active drivers with both.
3. Backfill the **12** drivers with historical escrow deductions (**$1,100**, all August, inside the
   open period) at their **ORIGINAL dates**.
4. Guard + selftest, **named in a workflow**: no Active driver without both accounts; no escrow
   deduction against a driver with no escrow account.
5. **Reuse the existing poster. Never invent new GL math.**
Then: audit your own guards (in the 190 that run, or the 4,490 that don't — **naming them IS the
fix**) · build+publish the 421-row void list, do not execute · L-0017 / L-0002 / L-0003 · one real
chain to PAID · factoring **97/1.50/1.50/$10** proving **92,102.74** · insured-asset `equipment_id`
+ the three missing FKs.
**Chase this too:** 94 driver pay rates EXIST for USMCA — they are **not resolving onto loads**.
That wiring defect is why gross pay is $0.00 and nothing reaches deductions or escrow.
**DO NOT:** build an insurance schema (8 tables exist) · delete anything · reassign an asset's
tenant · execute the void yourself.

## CC-2 — verifier, owns P-A and P-B
1. **P-B** — fix `verify:pre-commit` reporting. It iterates 2,503 steps spawning node each;
   2,503 processes cannot finish in 0.70s. `resolveBlockReadyManifest` sets `BLOCK_READY_MANIFEST`
   and steps self-skip while the runner still lists them all. Print **RAN / SKIPPED / why**; a run
   that skips more than it runs must **not** render as an unqualified pass.
2. **P-A** — proven-hop guard table (exists? selftest? **named in a workflow?**). Plus the new guard:
   **no `scripts/verify-*.mjs` may `writeFileSync` into `apps/` or `packages/`** — 611 do, and 210
   have no `finally` at all.
3. Independently verify: 4,680 guards · 190 named · **4,490 never named** · 844 no selftest.
   **Challenge these if wrong.**
4. Grade CC-1's driver-account pair build, and grade the void list **before** it executes.
5. **File `SETL-DUAL-APPROVAL-STATE-CONTRADICTION`** — 4 USMCA settlements carry
   `status='approved'` **and** `approval_status='needs_review'` simultaneously.
**DO NOT:** build · grade from a seat's report instead of your own read · approve the void before
P-A and P-B are green.

## CC-3 — owns the INSURANCE REQUEST build (AUTHORIZED)
Two request types, **one pipeline**: **COI for a CUSTOMER** · **DRIVER-ADD to the insurer**.
Build it so **unit-add** extends the same shape.
- **`insurance.coi_request` ALREADY EXISTS** — use it, extend **additively**. **No second table.**
- Send through the **existing** email pipeline (`apps/backend/src/email/`, `email.email_queue`,
  per-entity sender `EMAIL_FROM_BY_COMPANY`). **No new sender.** Broker: `eduardo@edsainsurance.com`.
- Attach generated requests to `docs.files`, hub-linked (Rule 14).
- Lifecycle: **requested → sent → acknowledged → issued/declined**, with the returned COI or updated
  schedule attached back to the request.
- **When a driver-add returns ISSUED, that driver becomes schedule-resident and the dispatcher
  warning stops firing for them. That closes the loop.**
- **Nothing sends automatically. A human presses send. Every send is logged.**
Also: the entity-scope **404 on 3 of 14 ID cards** (the 404 IS the defect) · 20 trailers into
`mdata.assets` to **$343,495 exactly** · coverage-status flag per unit.
**DO NOT:** create a second request table or a second sender · reassign any entity.

## DEVIN-A — owns the dispatcher WARN + CONFIRM control
**The 1,500-mile finding is CLOSED. Stop work on it.**
Your other finding stands and the owner has ruled how to build it — **warning, not a hard block**:
- Booking/assigning a driver **not yet on the insurance schedule** raises an on-screen message the
  dispatcher **must explicitly confirm**. Not a passive toast.
- Log **who confirmed, when, which driver, load and truck.** Owner override beyond that.
- **Build on POLICY-SCHEDULE MEMBERSHIP, not `assigned_driver_id`** — that field is a TMS assignment
  and building on it produces the wrong guard.
- Context: the uploaded list was a **setup-time snapshot**, **every driver is sent to the insurer**,
  setup is unfinished. "Not on the schedule" usually means "not submitted yet" — a workflow state.
- Guard + selftest, **named in a workflow**: the confirm cannot be bypassed; every confirm is logged.
**Corrections to carry:** approving three **$0.00** settlements did **not** prove the settlement hop —
it stays open. **Escrow is 3, not 21** (`driver_advance_accounts` = 27 is a different table).
**A red required check is a STOP.**

## CODEX — bank
Kill **`BANK-RECON-ACCEPT-MATCH-500`**; prove a match survives a reload; attach one to CC-1's chain
so a settlement reaches **PAID**. Faro reconciliation — face **$95,075.00**, net **$92,102.74**,
wire **$120.00** on 12 of 33. Guard + selftest, **named in a workflow**.
**DO NOT** use **$388,976.50** or **$75,918.76** — WITHDRAWN, entity unverified.

## CASCADE — parallel lane
Continue navy on the dropdown support you shipped. **Publish the REAL route list** — nobody has
enumerated 178 and the estimates sum to ~358. `verify-navy-subnav-x-of-178` with a selftest **and
named in a workflow**. Monthly insurance reporting job that **alarms**, never fails silently.
**DO NOT** treat navy as launch progress.

## CURSOR — lead
Hold the sequence. Nothing voided until CC-2 reports P-A and P-B green. Reject any "guard shipped"
claim that does not name the CI step, and any "blocked on schema" without an `information_schema`
paste. Delete the 1,500-mile item from every queue. Every queue 3+ OPEN.
