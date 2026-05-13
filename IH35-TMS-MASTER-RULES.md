# IH35-TMS — MASTER RULES

Canonical locked agent directives for **IH35-TMS** (Jorge authority). Section **§F** enumerates numbered invariants; headings **§F.1–§F.22** reserve numbering for consolidated prose backfills (additive only).

## §F — Locked invariants

### §F.1 — Invariant #1

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.2 — Invariant #2

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.3 — Invariant #3

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.4 — Invariant #4

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.5 — Invariant #5

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.6 — Invariant #6

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.7 — Invariant #7

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.8 — Invariant #8

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.9 — Invariant #9

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.10 — Invariant #10

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.11 — Invariant #11

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.12 — Invariant #12

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.13 — Invariant #13

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.14 — Invariant #14

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.15 — Invariant #15

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.16 — Invariant #16

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.17 — Invariant #17

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.18 — Invariant #18

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.19 — Invariant #19

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.20 — Invariant #20

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.21 — Invariant #21

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.22 — Invariant #22

Reserved §F anchor — canonical prose for this invariant will be backfilled **additively** from existing Phase 6 directives and `.cursor/rules/` without removing sibling §F entries (see §F.24).

### §F.23 — Single-line names (Invariant #23)

**Authority**: IH35-TMS UI/UX stabilization · Phase 6 inventory.

All **names / titles / headings** that identify entities (customers, drivers, vendors, companies, etc.) must render on **one visual line** — **no mid-title wrapping**. Treat single-line presentation as the default; use `whitespace-nowrap`, `truncate` / ellipsis patterns, `min-w-0`, and `title=` hover expansion where needed.

**Inventory / audit**: `docs/audits/SINGLE_LINE_NAMES_AUDIT_2026-05-12.md`.

### §F.24 — LOCKED INVARIANT #24 — NEVER REMOVE, ALWAYS PRESERVE

**Authority**: Jorge directive, 2026-05-13 · IH35-TMS Phase 6 stabilization.
**Status**: LOCKED. Applies to every agent, every directive, every commit,
every migration, every UI change, every operational decision, indefinitely.

**The Rule**

No module, section, tab, banner, sidebar item, route, page, modal, button,
form field, log entry, audit event, audit constraint, table, column, schema,
trigger function (when carrying domain logic), enum value, role, permission,
notification template, email template, feature flag, configuration row, or
any other persistent artifact shall be DROPPED, DELETED, REMOVED, ERASED, or
TRUNCATED from the system — in code, in the database, in configuration, or in
the UI — EVEN in cases of error, deprecation, regression, refactor,
cleanup, rollback, or schema drift correction.

Preservation is mandatory. Hiding, archiving, soft-deleting, and feature-
flagging are the only acceptable alternatives to outright removal.

**Allowed Patterns (additive, reversible, non-destructive)**

1. **Hide via feature flag** — UI component stays in the tree; render
   conditional on a feature flag set to false. Component code remains in
   repo. Flag flip restores visibility.

2. **Archive / deprecate in comment + UX** — add a comment marking the code
   path as deprecated. Remove the entry-point UX cue only after the
   replacement path is shipped. Code stays.

3. **Soft-delete with deleted_at timestamp** — add `deleted_at timestamptz
   NULL` column. Queries filter `WHERE deleted_at IS NULL`. Row data
   preserved in perpetuity.

4. **Additive schema changes** — DROP CONSTRAINT then ADD CONSTRAINT with
   WIDER acceptance (the 0136 pattern); DROP TRIGGER IF EXISTS then
   immediately re-CREATE TRIGGER (idempotent re-application); DROP POLICY
   IF EXISTS then immediately re-CREATE POLICY (same); ALTER TABLE ADD
   COLUMN ... NULL.

5. **Archive table for migrated data** — COPY first, verify, then leave the
   source table in place with a deprecated comment. Do not drop.

**Forbidden Destructive Operations**

DDL: DROP TABLE, DROP COLUMN, DROP SCHEMA, DROP INDEX (when protecting
integrity), DROP FUNCTION (when carrying domain logic), TRUNCATE.

DML: DELETE FROM (any persistent business or audit table). Exception:
explicit per-row authorization from Jorge with row IDs in chat. NEVER on
import_batch_audit_log / audit_events / _schema_migrations.

Code: removing a route from App.tsx, sidebar item, section, banner, tab,
accordion, module folder, endpoint, service file, log line, feature flag
entry, audit event type from a canonical union.

Migrations: removing a previously applied migration file; editing a
previously applied migration file in place; reversing a CHECK constraint
to be narrower than its prior accepted set.

Operational: auto-cleanup that deletes failed-import partial data;
auto-rollback by DROP-ing partial schema after a failed migration (use
PITR restore or additive corrective migration only); clearing browser
storage to recover from a UI bug unless user explicitly requests it;
resetting state to "factory defaults" on a deployed environment.

**Enforcement**

Every agent directive MUST include INVARIANT #24 references in its DO NOT
section. Every PR commit message that touches the database or removes any
code path MUST explicitly state INVARIANT #24 compliance. CI
verify:arch-design SHOULD grep-check new commits for forbidden patterns.

**Rationale**

Forensic preservation, reversibility, and Chapter 11 DIP compliance for
IH 35 Transportation LLC. Cumulative cost of delete is always higher than
cumulative cost of hide-via-flag.
