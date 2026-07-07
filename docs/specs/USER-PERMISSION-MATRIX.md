# IH35-TMS — User Permission Matrix Design

**Block:** USERS-PAR-1 · Phase: PARITY / Design-only  
**Author:** Claude (parity research 2026-07-02 + GUARD findings)  
**Status:** DESIGN ONLY — Jorge approves before any build block is cut  
**Parity basis:** QBO Advanced custom roles (action-level: view/create/edit/delete/approve per area; data restrictions); QB Enterprise (115 granular permissions, 14 predefined roles); single primary-admin holder rule

---

## 1. Current Role Catalog

IH35 has five fixed roles:

| Role | Description |
|---|---|
| **Owner** | Full access; sole holder of financial-approve rights; single-holder rule applies |
| **Administrator** | Near-full access; cannot approve financial posts |
| **Manager** | Operational write access; read-only on financial admin |
| **Dispatcher** | Load booking + driver assignment; no financial access |
| **Safety** | Safety events, violations, compliance; no financial access |

The current catalog is solid. This matrix layers ADDITIVE action-level permissions on top — existing roles keep working; the matrix constrains them within each area.

---

## 2. Permission Matrix: Areas × Actions × Roles

### Legend
- **✓** = full access
- **R** = read-only
- **─** = no access
- **A** = approve-only (financial maker≠checker; approve ≠ create)

### Core TMS Operations

| Area | Owner | Admin | Manager | Dispatcher | Safety |
|---|---|---|---|---|---|
| **Loads — view** | ✓ | ✓ | ✓ | ✓ | R |
| **Loads — create/edit** | ✓ | ✓ | ✓ | ✓ | ─ |
| **Loads — cancel** | ✓ | ✓ | ✓ | ─ | ─ |
| **Loads — void** | ✓ | ✓ | ─ | ─ | ─ |
| **Dispatch board** | ✓ | ✓ | ✓ | ✓ | ─ |
| **Drivers — view** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Drivers — create/edit** | ✓ | ✓ | ✓ | ─ | ─ |
| **Drivers — deactivate** | ✓ | ✓ | ─ | ─ | ─ |
| **Fleet/Units — view** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Fleet/Units — create/edit** | ✓ | ✓ | ✓ | ─ | ─ |
| **Maintenance — view** | ✓ | ✓ | ✓ | ─ | ─ |
| **Maintenance — create WO** | ✓ | ✓ | ✓ | ─ | ─ |
| **Fuel entries** | ✓ | ✓ | ✓ | ─ | ─ |

### Accounting & Financial

| Area | Owner | Admin | Manager | Dispatcher | Safety |
|---|---|---|---|---|---|
| **Invoices — view** | ✓ | ✓ | ✓ | R | ─ |
| **Invoices — create/edit** | ✓ | ✓ | ✓ | ─ | ─ |
| **Invoices — void** | ✓ | ✓ | ─ | ─ | ─ |
| **Invoices — approve GL post** | ✓ | ─ | ─ | ─ | ─ |
| **Bills — view** | ✓ | ✓ | ✓ | ─ | ─ |
| **Bills — create/edit** | ✓ | ✓ | ✓ | ─ | ─ |
| **Bills — approve GL post** | ✓ | ─ | ─ | ─ | ─ |
| **Expenses — view** | ✓ | ✓ | ✓ | ─ | ─ |
| **Expenses — create/edit** | ✓ | ✓ | ✓ | ─ | ─ |
| **Journal entries — view** | ✓ | ✓ | R | ─ | ─ |
| **Journal entries — create** | ✓ | ✓ | ─ | ─ | ─ |
| **Journal entries — approve** | A | ─ | ─ | ─ | ─ |
| **Chart of accounts — view** | ✓ | ✓ | R | ─ | ─ |
| **Chart of accounts — edit** | ✓ | ✓ | ─ | ─ | ─ |
| **Accounting periods — manage** | ✓ | ─ | ─ | ─ | ─ |
| **Opening balances** | ✓ | ─ | ─ | ─ | ─ |

### Banking & Reconciliation

| Area | Owner | Admin | Manager | Dispatcher | Safety |
|---|---|---|---|---|---|
| **Bank transactions — view** | ✓ | ✓ | ✓ | ─ | ─ |
| **Bank transactions — categorize** | ✓ | ✓ | ✓ | ─ | ─ |
| **Bank reconciliation — run** | ✓ | ✓ | ─ | ─ | ─ |
| **Plaid connection** | ✓ | ✓ | ─ | ─ | ─ |

### Factoring

| Area | Owner | Admin | Manager | Dispatcher | Safety |
|---|---|---|---|---|---|
| **Factoring — view** | ✓ | ✓ | ✓ | ─ | ─ |
| **Factoring — submit batch** | ✓ | ✓ | ✓ | ─ | ─ |
| **Factor — activate/deactivate** | ✓ | ─ | ─ | ─ | ─ |
| **Faro import** | ✓ | ✓ | ─ | ─ | ─ |

### Driver Finance & Settlements

| Area | Owner | Admin | Manager | Dispatcher | Safety |
|---|---|---|---|---|---|
| **Settlements — view** | ✓ | ✓ | ✓ | ✓ | ─ |
| **Settlements — create/edit** | ✓ | ✓ | ✓ | ─ | ─ |
| **Settlements — finalize (post)** | ✓ | ✓ | ─ | ─ | ─ |
| **Escrow — open/deposit** | ✓ | ✓ | ─ | ─ | ─ |
| **Escrow — release** | ✓ | ─ | ─ | ─ | ─ |
| **Cash advances** | ✓ | ✓ | ✓ | ─ | ─ |
| **Deductions** | ✓ | ✓ | ✓ | ─ | ─ |

### Safety & Compliance

| Area | Owner | Admin | Manager | Dispatcher | Safety |
|---|---|---|---|---|---|
| **Safety events — view** | ✓ | ✓ | ✓ | ─ | ✓ |
| **Safety events — create/edit** | ✓ | ✓ | ─ | ─ | ✓ |
| **Violations** | ✓ | ✓ | ─ | ─ | ✓ |
| **DOT inspections** | ✓ | ✓ | ─ | ─ | ✓ |
| **Accidents** | ✓ | ✓ | ─ | ─ | ✓ |
| **Drug & alcohol** | ✓ | ✓ | ─ | ─ | ✓ |
| **Insurance policies** | ✓ | ✓ | R | ─ | R |

### Master Data

| Area | Owner | Admin | Manager | Dispatcher | Safety |
|---|---|---|---|---|---|
| **Customers — view** | ✓ | ✓ | ✓ | R | ─ |
| **Customers — create/edit** | ✓ | ✓ | ✓ | ─ | ─ |
| **Vendors — view** | ✓ | ✓ | ✓ | ─ | ─ |
| **Vendors — create/edit** | ✓ | ✓ | ✓ | ─ | ─ |
| **Reports — view** | ✓ | ✓ | ✓ | ─ | ─ |
| **Reports — export** | ✓ | ✓ | ✓ | ─ | ─ |
| **Reports — schedule** | ✓ | ✓ | ─ | ─ | ─ |

### Admin & Users

| Area | Owner | Admin | Manager | Dispatcher | Safety |
|---|---|---|---|---|---|
| **Users — view** | ✓ | ✓ | ─ | ─ | ─ |
| **Users — invite** | ✓ | ✓ | ─ | ─ | ─ |
| **Users — role-change** | ✓ | ─ | ─ | ─ | ─ |
| **Users — deactivate** | ✓ | ─ | ─ | ─ | ─ |
| **Admin jobs** | ✓ | ─ | ─ | ─ | ─ |
| **System settings** | ✓ | ─ | ─ | ─ | ─ |

---

## 3. Financial Maker ≠ Checker Rule

When GL posting flags are on, two categories of actions require cross-user approval:

| Action | Maker | Approver |
|---|---|---|
| Journal entry create | Admin / Manager | Owner only |
| Invoice GL post | Admin / Manager | Owner only |
| Bill GL post | Admin / Manager | Owner only |
| Settlement finalize (post) | Manager | Admin or Owner |
| Escrow release | Admin | Owner only |

**Implementation:** the approve action on any of these records must be performed by a different user than the one who created it. Same-user approve is a 403 with explicit error: `"maker_checker_violation"`.

---

## 4. Entity-Scoping of User Grants (USMCA Readiness)

Currently roles are global (a user's role applies to all entities). Before USMCA launch (three entities: TRANSP, TRK, USMCA), roles must be entity-scoped:

- A user may have different roles per operating company (e.g., Owner in TRANSP, read-only in USMCA)
- Entity membership is separate from role assignment
- The `operating_company_id` RLS already scopes data; role-per-entity adds the permission gate

**Migration path:** add `operating_company_id` to the user-role binding; existing rows default to TRANSP. No behavior change until USMCA users are added. ADDITIVE.

---

## 5. Single-Owner Holder Rule

- Exactly one user may hold the Owner role per entity at any time
- Owner transfer requires: current Owner initiates → new user accepts → old Owner demoted → audit row
- System enforces: `INSERT/UPDATE` on the user-role table rejects a second Owner assignment when one exists (DB constraint or application-layer guard)
- If the current Owner account is deactivated, the system surfaces a blocker: "Transfer ownership before deactivating"

---

## 6. Invited vs Active Status

Current: any non-deactivated user shows "Active" regardless of whether they have credentials.

Correct semantics:
- **Invited** — invite sent, user has never logged in (`last_login_at IS NULL` + auth_method = 'Invite pending')
- **Active** — user has authenticated at least once (`last_login_at IS NOT NULL`)
- **Inactive** — `deactivated_at IS NOT NULL`

This change is **additive derivation** — no schema change. The `userStatus()` function in `Users.tsx` already implements "Invited" per SWEEP-FIX-17-27 item 9.

---

## 7. Migration Path from Current Fixed Catalog

1. **Phase 0 (now):** existing five roles remain. Matrix is documentary only.
2. **Phase 1 (USMCA prep):** add entity-scoped role binding (migration required, STOP-GATE). User-role table gains `operating_company_id` column; existing rows backfilled to TRANSP.
3. **Phase 2 (post-USMCA):** implement in-app permission checks per matrix row. Each protected route/action checks the calling user's role against the matrix at runtime.
4. **Phase 3 (financial post flags on):** enforce maker≠checker at the application layer for the five financial actions listed in §3.

---

## 8. Open Questions for Jorge

1. **Data restrictions** — QBO Advanced allows restricting a user to specific classes (profit center) or locations. Do any users need entity-scoped CLASS restrictions? (e.g., a dispatcher sees only loads for their assigned trucks)
2. **Manager vs Admin** — currently the boundary is blurry in practice. Should Manager be able to create bills? (Current matrix: yes.) Should Manager be able to finalize settlements? (Current matrix: no.) Confirm or adjust per your operational pattern.
3. **Safety role** — should Safety be able to VIEW financial data (invoices, settlements) at all? Currently: no. Is this correct?
4. **Dispatcher** — should Dispatcher see customer AR data (invoices)? Current matrix: read-only. Correct?
5. **Accountant role** — QBO has a dedicated Accountant role (external CPA access). Does IH35 need one? (Not in current catalog.) If yes, this is additive.
6. **Entity-scoping timeline** — Phase 1 above requires a migration. Is USMCA launch planned before or after the posting flags go live?

---

## 9. What Is NOT Adopted (Deliberate)

- **115 QB Enterprise granular permissions** — IH35 is a single-location carrier, not a 500-person enterprise. The five-role catalog + maker≠checker is the right complexity level.
- **Class-level data restrictions** — no identified use case; can be added in Phase 3 if needed.
- **Sub-customer hierarchy** — no trucking use case for IH35.
