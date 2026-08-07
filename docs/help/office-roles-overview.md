# Roles and permissions overview

Access in IH 35 Dispatch is role-based. The left rail and create/edit actions change with your role; company scope still applies via the operating-company switcher.

## Common roles
- **Owner / Administrator** — full office access, including sensitive Safety surfaces (e.g. complaints), user admin, and high-risk actions.
- **Dispatcher** — loads, assignments, driver/unit visibility needed for booking.
- **Safety** — Safety module depth (files, HOS, fines, incidents); not every Accounting surface.
- **Accounting / Finance** — bills, expenses, banking, settlements views as granted.
- **Read-only / limited** — view lists without create or void rights.

## Key tasks
- Confirm your role under **Users** (Owner) if something is missing from the rail.
- Switch operating company before creating records — role does not bypass entity scope.
- High-risk actions (voids, factor deactivate, merges) often require Owner and write an audit event.

## Tips & gotchas
- Missing a module usually means role gating, not a broken route.
- Driver App logins are separate from office users; deactivating a driver profile affects the PWA, not office role assignment.
