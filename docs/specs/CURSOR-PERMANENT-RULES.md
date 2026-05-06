# IH35-TMS — PERMANENT CURSOR RULES (read at start of EVERY block)

> **Cursor: read this file before starting any block. These rules supersede defaults and apply to every task.**

> **Claude (planning): include the directive "Read docs/specs/CURSOR-PERMANENT-RULES.md FIRST before writing any code." at the top of every paste box.**

Last updated: 2026-05-06 by Jorge

---

## RULE 1 — DUAL-SOURCE SPEC LAW

For every block, the spec source-of-truth is BOTH:

1. docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md (formal canonical blueprint, 20,034 lines)
2. docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (Jorge's chat-derived additions, refinements, ideas)

If guidance conflicts between the two, the chat-additions file WINS (it's newer and represents the latest decision).

If a feature is in NEITHER source, PAUSE and ask before coding — don't invent.

---

## RULE 2 — APPROVED-SCREEN LAW

The directory docs/approved-screens/ contains 12 PNG mockups of every Phase 3 user-facing module. Before writing UI for any module, inspect the relevant PNG. If implementation deviates, flag it in the response.

---

## RULE 3 — PHASE 3 IS UI/UX SHELL ONLY

Phase 3 module rebuilds (T11.5–T11.16) deliver routes, navigation, sub-nav, KPI rows, tables, modals, drawers, schema columns + views needed for shell to render, read-side endpoints, empty states with CORRECT empty data.

Phase 3 does NOT include live external integrations (Samsara, QBO live sync, Faro live ingest, Plaid), deep workflow execution (escrow forfeiture, above-policy approval, OCR engine), or anything explicitly marked Phase 4+.

If a deeper feature appears mid-block, add to deferred-features tracker, do not implement.

---

## RULE 4 — LOCKED INVARIANTS (carry into every block)

- operating_company_id RLS on every table touched
- Views use WITH (security_invoker = true)
- Lockstep INSERT pattern for atomic transactions
- Append-only audit events on every mutation
- Permanent records — void, never delete
- Migrations idempotent (DO + IF NOT EXISTS pattern)
- Cache from master_data.drivers NEVER used in render path (Part 4.5.4.2)
- Single-link constraint per WF-012
- Single-factor invariant per WF-017
- Display IDs server-generated, never editable
- Production NEVER serves fake data — env-gate fixture fallbacks
- "+ Create / + Book" rule (NEVER "+ New", NEVER "+ Add")

---

## RULE 5 — DISPLAY ID FORMATS (LOCKED)

| Entity | Format | Example |
|--------|--------|---------|
| Load | L-{n} | L-12047 |
| Driver Bill | B-{load_number} | B-L-12047 |
| Settlement | S-YYYY-NNNN | S-2026-0185 |
| Cash Advance | CA-YYYY-NNNN | CA-2026-0033 |
| Factoring Advance | FA-YYYY-NNNN | FA-2026-1842 |
| Work Order | WO-{UNIT}-{TYPE}-{MM-DD-YYYY}-{NNNN}-{V5} | WO-T169-IS-05-06-2026-0035-23914 |

WO format details (Jorge confirmed chat 2026-05-06):
- {UNIT} = unit display ID
- {TYPE} = source type (IS/ES/AC/ET/RT/IT/RS)
- {MM-DD-YYYY} = leading zeros, 4-digit year
- {NNNN} = per-unit cumulative LIFETIME sequence (never resets)
- {V5} = last 5 chars of vendor invoice# OR external vendor WO# (cross-reference)
- For internal labor-only WOs, V5 = "LABOR"
- For pending vendor entry, V5 = "PEND0"
- Backfill rows V5 = "LEGCY"

Source types (WO):
- IS = Internal Shop
- ES = External Shop
- AC = Accident
- ET = External Tires (Loves, TA, Pilot, etc.)
- RT = Roadside Tires
- IT = Internal Tires
- RS = Roadside Service (non-tire)

---

## RULE 6 — RESPOND-BEFORE-CODE PROTOCOL

Before starting implementation, Cursor MUST respond with:

1. List of blueprint sections + Jorge-additions sections actually read
2. List of approved PNG screens reviewed
3. Any deviation from spec the implementation will require, with rationale
4. Any feature in the block NOT in either spec source — flagged as "NEW SPEC: ..." for explicit Jorge approval before implementation

If no deviations: "Spec sources reviewed: [list]. Approved screens reviewed: [list]. Proceeding."

This response is the audit gate — implementation does not start without it.

---

## RULE 7 — POST-PUSH CONFIRMATION

After every commit + push, paste back to Claude:

1. Feature branch head commit hash
2. Diff stat
3. Per the block's PAUSE section, every numbered confirmation requested
4. Confirmation typecheck + build green
5. Confirmation db:verify:* PASS (only known pre-existing failures acceptable)
6. Confirmation route registrations updated in apps/backend/src/index.ts if new routes added

---

## RULE 8 — DO-NOT LIST (universal)

- Do NOT modify Phase 1 closed deliverables
- Do NOT serve fake data in production (env-gate fixtures)
- Do NOT delete records (void instead)
- Do NOT skip audit events
- Do NOT inline write SQL that bypasses RLS
- Do NOT mutate the canonical blueprint MD file (additions go in IH35_UNIFIED_BLUEPRINT_ADDITIONS.md)
- Do NOT use "+ New" or "+ Add" — always "+ Create" or "+ Book"

---

## RULE 9 — AMENDMENTS

Any new spec or design change Jorge confirms in chat MUST be added to docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md by Claude before next block ships. The additions file is append-only with date stamps.

End of permanent rules. Read at start of every block.
