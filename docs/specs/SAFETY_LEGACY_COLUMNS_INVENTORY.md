# Safety Legacy Columns Inventory

Date: 2026-05-07  
Block: P3-T11.18

Scope:
- `safety.dot_inspections`
- `safety.complaints`

Method:
- Live column introspection from `information_schema.columns` via local `DATABASE_DIRECT_URL`.
- Baseline comparison against the `CREATE TABLE` shapes in `db/migrations/0051_p3_t11_17_2_safety_v6_4_schema.sql`.
- First-introduced migration traced with repository search in `db/migrations/`.
- Current backend route reads/writes checked under `apps/backend/src/routes/`.

## 1) `safety.dot_inspections` legacy columns

These columns are present in DB but not part of the v6.4 `0051` table definition.

| Column | Data type | First added in migration | Current backend endpoint usage | Recommendation | Rationale |
|---|---|---|---|---|---|
| `inspection_level` | `smallint` | `0050_two_section_v5_and_safety_restructure.sql` | Not read directly; create endpoint maps request `inspection_level` into `fmcsa_level` target column | DEPRECATE | v6.4 canonical field is `fmcsa_level`; keep until P4 cleanup migration to avoid breakage for old data/backfill paths. |
| `cited_violations` | `jsonb` | `0050_two_section_v5_and_safety_restructure.sql` | No current route references | DEPRECATE | Superseded by `violations_jsonb`. |
| `csa_basic_total_points` | `integer` | `0050_two_section_v5_and_safety_restructure.sql` | No current route references | DEPRECATE | Superseded by `csa_points`. |
| `pdf_evidence_id` | `uuid` | `0050_two_section_v5_and_safety_restructure.sql` | No current route references | DEPRECATE | Superseded by `inspection_pdf_url` and endpoint `/upload-pdf`. |
| `spawned_wo_id` | `uuid` | `0050_two_section_v5_and_safety_restructure.sql` | No current route references | DEPRECATE | Superseded by `auto_spawned_wo_id`. |
| `notes` | `text` | `0050_two_section_v5_and_safety_restructure.sql` | Actively written by `POST /api/v1/safety/dot-inspections` | KEEP | Still used by current create flow and useful operational context field. |

## 2) `safety.complaints` legacy columns

These columns are present in DB but not part of the v6.4 `0051` table definition.

| Column | Data type | First added in migration | Current backend endpoint usage | Recommendation | Rationale |
|---|---|---|---|---|---|
| `created_at` | `timestamp with time zone` | `0050_two_section_v5_and_safety_restructure.sql` | Not directly referenced in current routes | KEEP | Generic metadata field; low-risk to retain for historical compatibility. |
| `complaint_date` | `date` | `0050_two_section_v5_and_safety_restructure.sql` | Not used by v6.4 routes | DEPRECATE | Superseded by `filed_at` (migration `0051` includes data backfill into `filed_at`). |
| `complainant_name` | `text` | `0050_two_section_v5_and_safety_restructure.sql` | Not used by v6.4 routes | DEPRECATE | Superseded by structured complainant columns (`complainant_*`). |
| `complainant_id` | `uuid` | `0050_two_section_v5_and_safety_restructure.sql` | Not used by v6.4 routes | DEPRECATE | Superseded by typed columns (`complainant_driver_id`, `complainant_user_id`, `complainant_customer_id`). |
| `respondent_id` | `uuid` | `0050_two_section_v5_and_safety_restructure.sql` | Not used by v6.4 routes | DEPRECATE | Superseded by typed columns (`respondent_driver_id`, `respondent_user_id`). |
| `complaint_type_id` | `uuid` | `0050_two_section_v5_and_safety_restructure.sql` | Not used by v6.4 routes | DEPRECATE | Superseded by text `complaint_type` value in v6.4 endpoint contract. |
| `investigation_notes` | `text` | `0050_two_section_v5_and_safety_restructure.sql` | Not used by v6.4 routes | DEPRECATE | Superseded by `resolution` + status lifecycle fields. |
| `resolved_by_user_id` | `uuid` | `0050_two_section_v5_and_safety_restructure.sql` | Not used by v6.4 routes | DEPRECATE | Superseded by `resolved_by`. |

## 3) Cleanup posture

- No columns are dropped in P3-T11.18.
- Recommended next step: P4 schema cleanup migration to remove DEPRECATE columns after:
  - confirming no external dependencies/reporting queries use them,
  - running a safe backfill/validation report,
  - updating verify scripts for the final column contract.
