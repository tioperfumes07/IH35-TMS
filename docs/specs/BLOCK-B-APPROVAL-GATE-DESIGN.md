# Block B — Booked Cash-Advance APPROVAL GATE (design-first, BUILD-AND-HOLD, Tier-1 money)

**Status:** DESIGN-FIRST. No posting/flag changes. Money path → build-and-HOLD, never self-merge; GUARD verifies.
**Date:** 2026-06-28 · Supersedes #1438 Q3 (closed). Builds on #1440 (rails) + #1562 (load_id-direct).
**Decision (Jorge-locked):** a dispatcher-booked cash advance requires **OWNER APPROVAL by default**, with an
**owner-set auto-approve THRESHOLD** — advances **≤ $X** auto-approve under dispatcher authority; **above $X**
require the Owner. Matches McLeod/Alvys/NetSuite **approval-limit** model + maker≠checker. Default the threshold
**conservative** (owner configures).

## Live infra this reuses (do NOT rebuild — ground 2026-06-28)
- `cash-advance-create.ts:35 resolveCompanyCashAdvanceThresholdDollars(client, companyId)` — the per-company $ threshold.
- `cash-advance-requests.service.ts:178` computes `is_above_policy = amountDollars > thresholdDollars` and stores it on `driver_finance.cash_advance_requests` (status starts `'pending'`).
- `approveCashAdvanceRequest` already **gates above-threshold to the Owner**: line 585 `if (is_above_policy) return { error: "above_policy_requires_owner" }`.
- `driver_advances.requires_owner_approval` column exists (`cash-advance-create.ts:161`).
- The booked path: `dispatch/book-load.service.ts:999 → createCashAdvanceRequest({ ..., load_id })` (load_id-direct via #1562).

## Design — the booked-advance gate (one canonical path, maker≠checker)
1. **Dispatcher books** a load with a cash advance → `createCashAdvanceRequest` (status `'pending'`, `is_above_policy` computed vs the owner threshold, `load_id` stamped). **Never auto-disburse at booking.**
2. **Auto-approve branch (≤ threshold):** if `is_above_policy = false`, the request may auto-approve under **dispatcher authority** → proceeds to disburse via the existing `approveCashAdvanceRequest`/core (which creates the `driver_advances` row + `deduction_schedule` + the load_id-direct recovery deduction). Recorded as dispatcher-approved in the request audit.
3. **Owner-approval branch (> threshold):** if `is_above_policy = true`, the request **stays pending** and **requires the Owner** (`above_policy_requires_owner` already enforces this) before disburse. Maker = dispatcher; checker = Owner.
4. **Threshold config:** owner-settable per operating company (the value behind `resolveCompanyCashAdvanceThresholdDollars`); surfaced in an Owner/Admin settings screen (UI is a follow-up). Default conservative (e.g. $0 → everything needs owner, until the owner raises it) — Jorge sets the launch default.
5. **Auto-approve is itself gated:** the "auto-approve ≤ threshold" behavior is OFF until the owner sets a threshold > 0 — consistent with the "never auto by default; human confirms" stance. With threshold = $0, every booked advance routes to the Owner.

## What changes (build-and-HOLD, after GUARD reviews this design)
- The booked-advance create path **enforces the gate**: ≤ threshold → dispatcher-authority approve; > threshold → owner-required (reusing `is_above_policy` + `above_policy_requires_owner`). No new posting, no GL/flag changes.
- A CI guard asserting the booked path never auto-disburses above the threshold (maker≠checker), and that `is_above_policy` drives the owner-required branch.
- **No money posting** — disbursement GL stays behind its existing OFF flag; this gate only governs WHO approves and WHEN it disburses.

## Holds / verification
Tier-1 money → **build-and-HOLD, no self-merge**. GUARD verifies: (1) booked advance ≤ threshold = dispatcher-approve, > threshold = owner-required; (2) maker≠checker enforced; (3) load_id-direct preserved (#1562); (4) recovery default amortize + net-floor (locked). PAUSE for Jorge's threshold default + GUARD sign-off before merge.
