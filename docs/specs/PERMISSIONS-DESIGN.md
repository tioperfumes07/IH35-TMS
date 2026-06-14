# Roles & Permissions — Design Spec (LOCKED UI, gated build)

**Status:** Design / Docs only (no code, no DDL). UI **visually approved by Jorge** (2026-06-14); build to match, wired to real data + audit spine, **gated**, GUARD verifies the diff before merge.
**Audience:** Jorge + GUARD + engineering.
**Date:** 2026-06-14
**Why foundational:** other blocks check against this — B9 escrow draw/refund **Approve**, money-flag flips, and **VOID** across accounting all depend on it. Until it ships, dependents hard-code Owner/Manager/Accountant with a clean swap-in seam.

---

## 0. Executive summary

A **QuickBooks-style role/permission system**: each role has a **module × action** permission grid; per-user overrides sit on top of the role. Every dependent power (escrow approvals, money-flag flips, **voids**, deletes, approvals) checks against it instead of today's scattered hard-coded role arrays.

**The headline correction this introduces app-wide: VOID ≠ DELETE.** Financial transactions are **voided** (reverse the GL effect via a reversing entry, KEEP the record + audit trail — the accounting standard, mirrors QuickBooks), never deleted. **Void is its own permission column**, separate from Delete. Delete destroys the record and is restricted (usually Owner only).

---

## 1. What exists today (build on / replace)

- **`UserRole`** (`apps/frontend/src/types/api.ts`): Owner · Administrator · SuperAdmin · Manager · Accountant · Dispatcher · Safety · Driver · Mechanic. Enforcement today = **hard-coded role arrays** scattered across routes (e.g. `isCatalogWriteRole`, `["Owner","Administrator","Manager","Accountant","Dispatcher"]` in cash-advance/B7, `canReview...`). This block centralizes those.
- **Partial void** already exists (e.g. settlement void requires Owner; some accounting entities carry `voided_at`). This block generalizes void into a permissioned, GL-reversing action across all accounting entities.
- **Drivers are NOT in this system** — drivers only have the driver app; the permission grid governs office users.

**Reconciliation needed (open question #1):** the locked role list (below) doesn't 1:1 match the existing `UserRole`. Map: Safety officer = `Safety`; **Bookkeeper is NEW**; `Administrator`/`SuperAdmin`/`Mechanic` must be mapped (keep as system roles? fold Administrator into a default grid?) — confirm with Jorge before migration.

---

## 2. Roles (locked)

**Owner · Manager · Accountant · Bookkeeper · Dispatcher · Safety officer** — **plus the ability to add CUSTOM roles.** Each role carries its own permission grid.

---

## 3. Granularity (locked)

- **Per-role** grid (the default for everyone with that role), **AND**
- **Per-user override** (a "Users" tab lets you override an individual person's access on top of their role — like QuickBooks).

Effective permission = role grid, with per-user overrides applied last.

---

## 4. Permission grid — module × action (locked)

Columns: **View · Create · Edit · Void · Delete · Approve** (check/X cells you toggle per module).

| Action | Meaning |
|---|---|
| **View** | read the module |
| **Create** | add records |
| **Edit** | modify records |
| **Void** | reverse a financial transaction's effect, KEEP record + audit (default for financial txns) |
| **Delete** | destroy the record — restricted, usually Owner only |
| **Approve** | distinct power: approve escrow draw/refund, approve cash advance, flip a money flag |

**Modules in the grid:** Dispatch/Loads · Maintenance · Fuel · Safety · Accounting (Bills, Expenses, Invoices, Journal entries) · Banking · Settlements · Escrow (draws/refunds) · Factoring · Reports · Admin/Settings.

---

## 5. VOID vs DELETE (cross-cutting — affects every accounting screen)

- **Void** = the accounting standard: post a **reversing entry** that nets the original to zero, mark the record `VOIDED` (not deleted), keep it visible with a **VOID stamp + reason + actor**. Financial transactions **default to void**, never delete.
- **Delete** = destroy the record. Restricted (Owner only by default).
- Applies across **bills, expenses, invoices, journal entries, settlements** (and escrow moves). Each needs backend void support: reversing GL entry + `voided_at`/`voided_by`/`void_reason` + audit-spine row. **Every VOID is logged with a reason** (rule #4).

This is a separate, larger work-stream the grid unlocks; sequence per §13.

---

## 6. Locked rules

1. **Owner is un-restrictable** — always full access (like the QBO primary admin).
2. **Default-deny** — a new role/permission defaults OFF; grant explicitly.
3. **Every permission change is audited** — who changed whose access, when (per-role and per-user edits).
4. **Every VOID is logged** with a reason + actor.
5. **Editable in-software** — assign/remove per role and per user; create custom roles.
6. **Foundational seam** — until this ships, dependent blocks (B9 escrow approver, money-flag approve) **hard-code Owner/Manager/Accountant** behind a `requireApprover(...)`-style helper, swapped for the real permission check when this lands.

---

## 7. Data model (each table: `is_active` + soft-delete + audit columns)

- **`identity.roles`** — `id`, `code`, `name`, `is_system` (Owner/built-ins un-deletable), `is_active`, audit cols. Seed the locked roles; custom roles insert here.
- **`identity.role_permissions`** — `role_id`, `module` (enum), `action` (enum: view/create/edit/void/delete/approve), `allowed boolean`. The role × module × action matrix. Default-deny (absent row = deny).
- **`identity.user_permission_overrides`** — `user_id`, `module`, `action`, `allowed boolean` (per-user override; null = inherit role).
- **`identity.permission_audit`** — append-only: who/whom/module/action/old→new/when (or reuse `audit.audit_events`).
- **Void support columns** on accounting entities (bills/expenses/invoices/journal_entries/settlements): `voided_at`, `voided_by_user_id`, `void_reason`, `reversing_entry_id` (where applicable).

*(Migrations → Jorge flips to accept-edits + coder shows the migration first.)*

---

## 8. Enforcement (the consumer API)

- Backend helper `can(user, module, action): boolean` resolving role grid + per-user override (Owner short-circuits true). Replace the scattered hard-coded role arrays with `can(...)` calls incrementally.
- A `requireApprover(user, module)` convenience for the `Approve` action (B9 escrow draw/refund, money-flag flips).
- The seam (rule #6) means B9 (#948) and others ship referencing `requireApprover` hard-coded to Owner/Manager/Accountant now, then this block backs it with the grid — no re-plumbing.

---

## 9. Visual (approved)

Dark topbar + sidebar, green accent `#16A34A`. **Role chips across the top** (selected = green). Below, the **module × {View/Create/Edit/Void/Delete/Approve} grid** with check/X cells you toggle. **Save changes** + an "every change is logged" footer. A **Users tab** for per-user overrides. Build to match the approved mockup.

---

## 10. Dependencies — what this unblocks

- **B9 escrow** Approve (draw/refund) — currently hard-coded (#948).
- **Money-flag flips** Approve (e.g. capped-recovery, escrow-deduction-enabled) — currently Owner + GUARD only.
- **VOID** across accounting (bills/expenses/invoices/JEs/settlements).
- Generally replaces all hard-coded role gates.

---

## 11. Open questions for Jorge

1. **Role reconciliation:** map existing `Administrator`/`SuperAdmin`/`Mechanic` to the locked set (keep as system roles? Administrator = a default full-but-not-Owner grid?). Add **Bookkeeper** as new.
2. **Void scope v1:** which entities get void first — settlements (partly done) + bills + expenses + invoices + JEs all at once, or phased?
3. **Reversing-entry mechanics:** confirm void posts a dated reversing JE (vs. flipping signs) for each entity, and the period rules (can you void into a closed period?).
4. **Module list final:** confirm the 11 modules + whether sub-entities (Accounting → Bills/Expenses/Invoices/JEs) are separate grid rows or one Accounting row.
5. **Custom-role limits:** any cap, and can a custom role be granted Delete/Void, or are those Owner-locked regardless?
6. **Per-user override precedence:** confirm override always wins over role (including removing an Owner's access? — no, Owner un-restrictable).

---

## 12. Build sequence (gated; migrations → accept-edits; GUARD-verified; never self-merge)

1. **Schema** — roles + role_permissions + user_permission_overrides + permission audit (migration). Seed locked roles default-deny (Owner full).
2. **`can()` enforcement helper** + backend wiring; migrate the highest-value hard-coded gates to it (escrow Approve, money-flag Approve).
3. **Permissions UI** — the approved grid (role chips + module×action) + Users override tab, all edits audited.
4. **VOID work-stream** — per-entity void (reversing entry + VOID stamp + reason + audit), gated by the new `Void` permission. Phased per Q2.

Steps touch money paths (void = GL) → designed live with Jorge, GUARD verifies the diff, ship gated, never auto-flip a prod flag.

---

*Design only. No schema/code is created here. Build under Jorge's standing rules (UI pre-approved above; money path designed with Jorge + GUARD; migrations in accept-edits; is_active+audit on every table; every void/permission-change audited; never self-merge).*
