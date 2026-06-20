# Maintenance

The Maintenance module (MAINT) tracks the health and repair history of every truck and trailer in the fleet. It is where work orders are opened, parts and labor are recorded, and preventive-maintenance schedules are kept.

## Overview
Maintenance centers on the **Work Order**. Each work order is tied to a single unit (truck or trailer) and records the reason for service, the parts and labor, and the in/out dates. Work orders carry a stable display ID in the form `WO-{UNIT}-{TYPE}-{MM-DD-YYYY}-{NNNN}-{V5}`, where `{TYPE}` is one of seven fixed source types: **IS, ES, AC, ET, RT, IT, RS**. These source types are immutable once a work order is created.

## Key tasks
- **Open a work order** — use **+ Create** on the Work Orders list, pick the unit, choose the source type, and describe the service. The class is auto-derived as `{UNIT}-{LASTNAME}` from the assigned driver.
- **Record parts and labor** — add line items to the open work order; totals roll up automatically.
- **Track the fleet** — the Units / Fleet list shows every truck and trailer, its owner company, and its current lease assignment.
- **Plan preventive maintenance** — the PM Schedule page lists upcoming and overdue service intervals per unit.
- **Manage service locations** — keep the list of shops and vendors where work is performed.

## Tips & gotchas
- The seven source types (IS/ES/AC/ET/RT/IT/RS) are fixed — pick the right one when you create the work order, because the type is part of the immutable display ID.
- A unit's owner company and its current lessee are tracked separately; the Fleet list reflects who currently operates each unit.
- Work orders are archived, never deleted, so the repair history of a unit stays complete for audit and resale.

## FAQ
- **Can I delete a work order?** No — work orders are archived to preserve the unit's full service history.
- **Why is the class field green?** The auto-derived `{UNIT}-{LASTNAME}` class is the one field allowed to render green; it confirms the truck/driver pairing.
- **Where do fuel and roadside expenses go?** Those live in the Fuel module and must be tied to a load — see the Fuel guide.
