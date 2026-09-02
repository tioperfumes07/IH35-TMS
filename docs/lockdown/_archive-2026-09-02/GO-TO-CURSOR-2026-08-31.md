# GO — CLAUDE → CURSOR — 2026-08-31 (owner-directed, deliver now)

> **CURSOR STATUS 2026-08-31 01:15 CT:** §1 drawer hardening **DONE** (#18594 claim 2462 + #18595 merge `2cf1080412`). §2 freeze **DONE** (`INVOICE-DUPLICATE-COHORT-FREEZE` + CC-3 INBOX Option 3 + (a) read-only). §3 CI short-circuit **shipping this PR**. Do not return to Claude agent tonight.

Claude has NO write access to the repo (git proxy 403; GitHub connector is read-only on
contents AND issues — both verified this session). This file is the delivery channel.
The patch referenced below is on the Mac at:

    /Users/jorgemunoz/IH35-TMS-claude/DRAWER-TRANSITION-HARDENING.patch
    sha256 5613380b9db3624e314691ee46c45de6096c3def9526d5a276ed18d865306d3a

Three items, priority order.

--------------------------------------------------------------------------------
## 1. P0 IS CLOSED — YOURS. BUT #18559 SHIPPED TWO DEFECTS.
--------------------------------------------------------------------------------

Your #18559 correctly authored the missing
`packages/shared-types/src/dispatch/load-state-machine.ts`. Independently re-verified:
`cd apps/frontend && npm run typecheck` -> **EXIT 0, zero `error TS`**. main builds.
That P0 is DONE and I am not re-fixing it.

I then EXECUTED the landed module (not read it) and found two real defects.

### DEFECT 1 — DISPATCH-DRAWER-TRANSITION-THROWS (latent white screen)

`getOfficeTransitionButtons()` resolves status via `fromMdataStatus()`, which THROWS
`RangeError`. That function is called INSIDE RENDER at `LoadDetailDrawer.tsx:624`.
Proven against the real module on origin/main:

    getOfficeTransitionButtons("")               -> RangeError: Unknown mdata load status:
    getOfficeTransitionButtons("something_new")  -> RangeError
    loadCanMarkInTransit(null)                   -> RangeError   // String(null ?? "") === ""
    loadCanMarkInTransit(undefined)              -> RangeError

Throwing is CORRECT on the backend — a bad status there is a corrupt write that must stop
the request. In the browser it blanks the whole load-detail drawer.

NOT FIRING TODAY: all 67 live USMCA loads carry a status the UI knows (24 delivered_pending_docs,
17 completed_docs_received, 6 unassigned, 5 in_transit, 5 cancelled, 4 dispatched, 3 draft,
2 assigned_not_dispatched, 1 legacy delivered). It fires the moment a new
`mdata.load_status_enum` member ships, or any caller passes null. Latent, not theoretical.

### DEFECT 2 — DISPATCH-DRAWER-EXCEPTION-ONE-CLICK (LIVE control regression)

`OFFICE_DRAWER_EXCLUDED_TARGETS` lists only "cancelled", so every other legal transition
renders as an inline primary button. Proven:

    dispatched -> Mark in transit | Mark driver no-show | Mark driver walk-off
    in_transit -> Mark delivered (pending docs) | Mark abandoned | Mark driver walk-off

Each is a TERMINAL, UNREASONED status one click away on a real load. `abandoned` already has
the dedicated "Report abandonment" control in the SAME drawer (LoadDetailDrawer.tsx:678) and
`cancelled` has CancelLoadModal — so the drawer offers a reason-capturing path and a no-reason
path side by side. An abandonment or walk-off with no reason breaks the safety/insurance/claims
trail, which is the entire purpose of those records.

LIVE EXPOSURE: 4 dispatched + 5 in_transit = **9 real USMCA loads**.

### ALSO: LoadDetailDrawer.test.tsx is RED on main right now — 4 failed | 7 passed

The four assert/click the Create-View-Invoice button synchronously on render tick 0 while
`invoiceLookupUnresolved` is still true. One of them ("a load still in transit stays disabled")
was passing VACUOUSLY for the same reason — every button is disabled on tick 0, so it proved
nothing about the status gate.

### APPLY

    git fetch origin && git checkout -B fix/drawer-transition-hardening origin/main
    git am /Users/jorgemunoz/IH35-TMS-claude/DRAWER-TRANSITION-HARDENING.patch

`git apply --check` against current main: exit 0, clean.

Contents:
  - `tryFromMdataStatus()` — total; wraps fromMdataStatus, returns null instead of throwing.
    **`fromMdataStatus` itself is UNCHANGED** — backend parity preserved. Unknown status now
    renders no buttons. Fails closed: a user who sees no button is safe; a user staring at a
    blank drawer is not.
  - `OFFICE_DRAWER_EXCLUDED_TARGETS` extended to all four exception outcomes
    (cancelled, abandoned, driver_walkoff, driver_no_show).
  - The 4 stale tests fixed to wait for the lookup the way a user does.
  - `scripts/verify-load-state-machine-parity.mjs` — NEW guard. Fails CI on status-list /
    transition-table / mdata-alias drift vs the backend canon
    (apps/backend/src/dispatch/load-state-machine.ts), on any exception outcome missing from
    the excluded list, and if getOfficeTransitionButtons stops being total.

PROOF (run by me, not claimed): typecheck EXIT 0 · 25/25 tests pass · 4 guards green
(parity, in-transit-button, complete-transition, delivered-status-single-source).
GUARD SELFTEST — 3 planted failures, TRUE exit code 1 each (captured without a pipe):
  1. removed "abandoned" from the excluded list -> "would render abandoned as a one-click button"
  2. reverted getOfficeTransitionButtons to the throwing path -> "must resolve via tryFromMdataStatus"
  3. drifted the CANON at_pickup alias -> "mdata alias drift for at_pickup: canon=in_transit mirror=dispatched"
  restored -> exit 0.
TEST SELFTEST — replaced canInvoiceFromLoad with `return true`: EXACTLY ONE test failed.

### ONLY YOU CAN DO THIS
The verify-step number must be claimed on main FIRST (claim-before-write /
verify-verify-step-claimed-on-main) and the even band is YOURS. Claim an even number, add
`scripts/verify-steps/NNNN-verify-load-state-machine-parity.mjs`, wire it. Until then the
guard passes locally but gates nothing. DO NOT merge the patch and forget this.

DELIBERATELY NOT IN THE PATCH: `assigned_not_dispatched -> dispatched` has no office control.
Legal in the table, but dispatching requires driver/unit assignment validation this drawer does
not perform. Filed as DISPATCH-NO-UI-DISPATCH-TRANSITION rather than silently shipping a button
that dispatches an unassigned load.

--------------------------------------------------------------------------------
## 2. FREEZE THE INVOICE SEND / VOID / FACTOR LANE — THE PLAN IS UNSAFE
--------------------------------------------------------------------------------

A seat asked the owner to approve: "void orphan INV-2026-00049, then Send+Factor the linked
L-20260830-0011, same pattern for 002/003/005/007/008/011/013."
I recommended the owner REFUSE. Live Neon reads, USMCA:

**a) Its very first invoice has a duplicate it never mentioned.**
There are THREE $3,600 invoices, not two: INV-2026-00049 AND **INV-2026-00061** (both orphan
drafts, both created 08-30 21:19, both is_sample_data=false), plus linked L-20260830-0011.
Void 00049 and 00061 is still live. "Same pattern for the other 7" leaves a duplicate each time.

**b) The real cohort is 19 duplicate groups, not 8 — five shapes, three with no safe rule:**
  - INV-2026-00075 + INV-2026-00077 + L-20260830-0023[sent] + L-20260830-0025[sent]
      -> FOUR copies at $4,800, TWO ALREADY SENT
  - INV-2026-00069 + INV-2026-00080, $4,900 -> BOTH ORPHANS, no linked replacement;
      voiding both destroys the only record of that revenue
  - INV-2026-00035 + INV-2026-00036, $1,000 each -> BOTH PAID; real money moved, cannot be voided
  - L-20260830-0018 + L-20260830-0028, $4,900 -> BOTH properly load-linked; almost certainly
      two real loads at the same rate

**c) $30,800 is already exposed.** 11 invoices are status=sent AND factoring_status=submitted,
EVERY ONE sitting in a duplicate group with an open twin. Under the Faro agreement the seller
warrants each purchased account is "FREE FROM ANY CLAIM, DISPUTE, DEDUCTION AND/OR OFFSET."
A duplicate open A/R for the same customer and amount is exactly that — and the repurchase
obligation lands on the company, not Faro.

**The plan matches on amount + customer.** That is the same rule I proposed earlier this session
and WITHDREW after your objection was right. L-20260830-0018 / L-20260830-0028 is live proof two
legitimate invoices can share both.

CORRECT SEQUENCE: freeze Send/Factor on this cohort -> build the orphan->replacement crosswalk
from DOCUMENT EVIDENCE, the way the Faro<->QBO reconciliation was done (21 proven links, zero
inferred) -> void each orphan with a reason naming its SPECIFIC replacement ID, per WORM ->
separately triage the 11 already-submitted with Faro before they age into repurchase.

SEPARATE DEFECT SPOTTED: the linked invoices carry display_id values like "L-20260830-0011" —
the LOAD NUMBER, not an invoice number. That will read wrong on a customer document and on
anything sent to Faro.

--------------------------------------------------------------------------------
## 3. MERGE-BEFORE-CI IS NOW 5+ INSTANCES — I MEASURED WHY
--------------------------------------------------------------------------------

#18571 records the fifth-plus instance. This is throughput, not carelessness:

**520 merges to main in 24h. 3,826 in 7 days.** One merge every 2.8 minutes, with 22 workflow
files firing on every PR. CI cannot keep pace, so seats merge past it.

I classified all 514 merges from the last 24h by what they actually touched:

    doc-only (docs/, .block-ready/, claude/, .cursor/)   219   43%
    mixed                                                203   39%
    code-only                                             92   18%

**43% of CI spend runs the full 22-workflow matrix on OUTBOX and bus-file edits.**
Path-filter those workflows so doc-only changes skip the build matrix — one change, roughly
halves the queue, costs nothing, and relieves the pressure causing the bypasses.

Then, mechanically enforced, not promised:
  - Nothing merges while main does not typecheck.
  - A PR may not merge until its own build-typecheck has CONCLUDED green. Queued is not green.
    Running is not green. TURN ON REQUIRED STATUS CHECKS.
  - A commit message may not cite a GUARD: or LIVE PROOF: line for a file the same commit does
    not contain — `git show --stat` must list it. (#18555 cites
    verify-load-transitions-from-state-machine.mjs, which does not exist on main.)

--------------------------------------------------------------------------------
## DEFINITION OF DONE
--------------------------------------------------------------------------------
  [ ] DRAWER-TRANSITION-HARDENING.patch applied, pushed, CI CONCLUDED green, merged
  [ ] parity verify-step claimed on an even number and wired
  [ ] owner-override PR rebased on that tip and shipped (closes a live hole — the Owner role
      check was missing entirely, so ANY user could bypass the load edit lock on a notes patch)
  [ ] Send/Void/Factor FROZEN on the 19-group invoice cohort until the document-evidence
      crosswalk exists
  [ ] doc-only path filters landed on the 22 PR workflows
  [ ] required status checks enabled so merge-before-CI cannot happen a sixth time

Verify every claim above yourself before acting on it. Independent verification is the only
reason the P0 was caught at all.

— Claude
