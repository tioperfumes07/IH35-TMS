# Required Document Types — Regulatory Defaults & Enforcement Model

> **HOLD LANGUAGE SUPERSEDED — OWNER LAW 2026-08-03 / owner directive 2026-08-06.** There are NO holds and no approval gate. All owner questions are asked-and-answered. Coders build, apply on Neon, and MERGE ON GREEN with proof. Any "build-and-hold", "Jorge merges", "never self-merge" or "wait for approval" wording below is HISTORICAL RECORD ONLY and must not be followed.

**Status:** SPEC (owner-locked decision #6, 2026-07-02). The catalog + seed is a migration → **Tier-1
build-and-ship** (never self-merged; the coder merges on green). This document is the design the migration implements.
Governed by the additive-only product locks (CLAUDE.md §7) and schema invariants (§2, §4).

---

## 1. Problem this closes
Today "Missing required documents" is meaningless because no catalog defines *which* documents are required
per entity type. A driver with no CDL on file and a driver missing only an optional form look identical. We
seed the real **FMCSA / IRS regulatory defaults** so compliance surfaces (driver files, unit compliance,
customer/vendor onboarding) can compute a truthful "missing required" set.

## 2. Locked decisions (owner, 2026-07-02)
- **Seed FMCSA/IRS regulatory defaults** as the out-of-the-box required set (matrix in §4).
- **Warn-first**, not block-first. A missing required doc raises a **warning** by default. Each type is
  independently **promote-to-hard-block** (owner action) when the carrier wants it to gate an operation.
- **Configurable per carrier** (per `operating_company_id`): a carrier may add its own required types,
  deactivate a seeded one (void-not-delete → `is_active=false`), or flip warn ⇄ hard-block per type.
- **Additive only.** This introduces a NEW catalog + a per-entity requirement view. It does not remove or
  rewire any existing document/upload surface (`docs.*`, driver safety file, insurance COI, etc.).

## 3. Data model (migration builds-and-holds — do NOT self-merge)
Two tables, both entity-scoped, FORCED RLS, `is_active` + audit, GRANTs to `ih35_app` (0065 pattern),
money-free. Names verified against §4 schema reality before the migration is written.

**`compliance.required_document_types`** — the catalog (one row per required doc type per carrier).
- `id uuid` pk (UUIDv7, server-generated)
- `operating_company_id uuid NOT NULL` (RLS scope)
- `entity_kind text NOT NULL CHECK (entity_kind IN ('driver','unit','customer','vendor'))`
- `code text NOT NULL` — stable machine code (e.g. `cdl`, `med_cert`, `form_2290`)
- `label text NOT NULL` — single-line display name (§7 vocab)
- `authority text` — regulatory citation shown to the user (e.g. `FMCSA §391.41`, `IRS Form 2290`)
- `enforcement text NOT NULL DEFAULT 'warn' CHECK (enforcement IN ('warn','hard_block'))`
- `has_expiry boolean NOT NULL DEFAULT false` — expiring credential (drives renewal reminders)
- `is_seed boolean NOT NULL DEFAULT false` — true = seeded regulatory default (carrier may deactivate, not
  delete)
- `is_active boolean NOT NULL DEFAULT true` — void-not-delete
- `sort_order int NOT NULL DEFAULT 0`
- `created_at/updated_at timestamptz`
- UNIQUE `(operating_company_id, entity_kind, code)` — per-entity catalog, no global-unique regression.

**`compliance.document_requirement_status`** *(optional, phase 2)* — a per-entity computed roll-up cache
(entity_kind, entity_id, missing_required_count, worst_enforcement). Phase 1 computes this live from the
catalog + the existing document surfaces; the cache is only for dashboard performance and is derivable, so
it is deferred until the live compute proves too slow.

RLS: reuse the exact `accounts_entity_select/write` pattern (`is_lucia_bypass() OR operating_company_id =
current_setting('app.operating_company_id')::uuid`). No DELETE grant (void via `is_active`).

## 4. Regulatory-default seed matrix (owner-locked)
`has_expiry` marks credentials that drive renewal reminders. All seeded rows: `enforcement='warn'`,
`is_seed=true`, per entity, for every operating company that exists at seed time (and re-applied on carrier
bootstrap so USMCA/future carriers inherit them).

### Drivers  (`entity_kind='driver'`)
| code | label | authority | expiry |
|---|---|---|---|
| `cdl` | Commercial Driver License | FMCSA §383 | yes |
| `med_cert` | DOT Medical Certificate | FMCSA §391.41 | yes |
| `mvr` | Motor Vehicle Record | FMCSA §391.25 | yes (annual) |
| `clearinghouse` | Drug & Alcohol Clearinghouse query | FMCSA §382.701 | yes (annual) |
| `driver_application` | Driver Employment Application | FMCSA §391.21 | no |
| `w9` | Form W-9 (TIN) | IRS | no |

> Foreign-driver note: W-8BEN capture already lives on the driver profile (PR #1767) — the tax-form
> requirement resolves to **W-9 OR W-8BEN** depending on `foreign_status`; the requirement resolver treats
> the pair as one satisfied slot. (Cross-ref driver W-8BEN yearly renewal.)

### Units  (`entity_kind='unit'`)
| code | label | authority | expiry |
|---|---|---|---|
| `registration` | Vehicle Registration (cab card) | State DMV | yes |
| `annual_inspection` | Annual DOT Inspection | FMCSA §396.17 | yes (annual) |
| `ifta` | IFTA License / Decal | IFTA | yes (annual) |
| `form_2290` | Form 2290 (HVUT) Schedule 1 | IRS Form 2290 | yes (annual) |
| `insurance` | Insurance / Cab-card proof | State / FMCSA | yes |

### Customers  (`entity_kind='customer'`)
| code | label | authority | expiry |
|---|---|---|---|
| `credit_app` | Credit Application | — | no |
| `w9` | Form W-9 | IRS | no |
| `msa` | Master Service Agreement | — | no |
| `noa` | Notice of Assignment (if factored) | — | no |

> `noa` is **conditional**: required only when the customer is factored (Faro/RTS). The resolver marks it
> required only if the customer has a factoring assignment; otherwise it is not counted missing.

### Vendors  (`entity_kind='vendor'`)
| code | label | authority | expiry |
|---|---|---|---|
| `w9` | Form W-9 | IRS | no |
| `coi` | Certificate of Insurance | — | yes |
| `agreement` | Vendor / Carrier Agreement | — | no |

## 5. Enforcement model
- **warn (default):** the entity shows a compliance warning + a "Missing required: N" chip listing the
  types; nothing is blocked. This is the state every seeded row ships in.
- **hard_block (opt-in per type):** the resolver additionally exposes `blocks: true` for that type so an
  operation owner (e.g. book-load, activate-driver) can gate on it. **No operation is auto-gated by this
  spec** — wiring a specific block into dispatch/onboarding is a separate, owner-approved change per surface.
- Conditional types (`noa` if-factored, driver tax-form W-9/W-8BEN pair) are resolved by the requirement
  resolver, not by static catalog rows.

## 6. Requirement resolver (read-only service, phase 1 — non-financial, ships on green)
`resolveMissingRequired(entity_kind, entity_id, opco)` → `{ missing: RequiredDocType[], worst: 'none'|'warn'
|'hard_block' }`. Reads the catalog (active rows for the opco+entity_kind) and joins the existing document
presence surfaces (`docs.*` / driver safety file / insurance COI / unit inspection events) to decide which
required slots are satisfied. Pure read; entity-scoped; no writes. This service + its UI chip are the
shippable, non-migration deliverable that turns "Missing required" into truth **once the catalog exists**.

## 7. Build order
1. **DOC-REQ-1 (Tier-1 HOLD, migration):** catalog table + FORCED RLS + grants + the §4 seed (idempotent
   `ON CONFLICT DO NOTHING`, re-applied on carrier bootstrap). CI guard: entity-scope + forced-RLS +
   seed-present. **the coder merges on green.**
2. **DOC-REQ-2 (Tier-3, ships on green):** the read-only `resolveMissingRequired` service + the "Missing
   required: N" chip on driver/unit/customer/vendor surfaces + per-type enforcement config UI (owner-only,
   warn ⇄ hard-block, add/deactivate carrier-specific types).
3. **DOC-REQ-3 (per surface, owner-approved):** wire a specific `hard_block` type into a specific operation
   (e.g. no book-load if unit annual inspection expired) — one owner decision per gate, never bulk.

## 8. Landmines / cross-refs
- Do not create `catalogs.*`/`accounting.*` tables for this — it is a **compliance** concern; keep it in a
  `compliance.*` schema so it is not caught by the financial-cluster gate needlessly (still a migration →
  still Jorge-merged).
- `safety.safety_settings` has an INSERT-policy gap that breaks company creation as `ih35_app` — if the
  seed re-applies on carrier bootstrap, verify the bootstrap path is not blocked by that gap first.
- Reuse existing expiry/reminder infra (safety cert monitor, document expiry alerts) for `has_expiry`
  types rather than building a new reminder engine.
- This spec is the canonical source for "which documents are required." If a handoff doc or screen states a
  different required set, flag the drift and reconcile here.
