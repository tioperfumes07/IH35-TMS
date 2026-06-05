# DEEP-AUDIT-A — Driver Detail Edit Modal + Equipment Assignments

**Date:** 2026-06-05 (CST / Laredo) · **Block:** CLOSURE-14-DEEP-AUDIT-A · **Lane:** B  
**Base SHA:** `011e9ad0` · **Method:** Static source walk of `DriverDetail.tsx`  
**Regression guards:** `verify:deep-audit-a-driver-edit-modal`, `verify:deep-audit-a-equipment-assignments`

---

## Driver Detail — 8 sub-tabs

Profile · QBO Mapping · Earnings & Debt · Equipment Assignments · Safety File · Documents · Audit History · Legal Matters  
(RBAC may hide Safety File, Documents, Legal Matters per role.)

---

## Edit Modal (Profile tab header)

### Action bar buttons

| Control | Type | ARIA | Behavior |
|---------|------|------|----------|
| HOS Detail | `Link` | link | `/drivers/:id/hos` |
| **Edit** | `Button` | button | `setEditMode(true)` — enables all profile inputs |
| **Save** | `Button` (edit only) | button | Validates B1/CURP rules → `updateDriver` PATCH |
| Deactivate | `Button` | button | Confirm → `deactivateDriver` |
| Resend Invite | `Button` | button | `resendDriverInvite` (Owner/Admin, email required) |

**Finding HIGH-DA-C-01:** No **Cancel** button when `editMode=true`. User cannot discard edits without navigating away or saving. VendorDetail Profile has Edit/Cancel/Save — driver flow is inconsistent.

### Edit modal fields (disabled until Edit clicked)

| Field | Type | Required |
|-------|------|----------|
| First Name | text | implicit |
| Last Name | text | implicit |
| Phone | text | — |
| Email | email | — |
| CDL # | text | — |
| CDL Expires | date | — |
| Hire Date | date | — |
| DOT Medical Expires | date | — |
| Hazmat Endorsement Expires | date | — |
| CDL State | Combobox | catalog `listUsStates` |
| CDL Class | Combobox | A/B/C |
| Status | Combobox | Probation/Active/Inactive/Terminated/OnLeave |
| Pay Basis | Combobox | short_miles / practical_miles |
| Preferred Language | Combobox | en / es |
| Visa & Passport block | text/date | B1 requires INE + CURP |
| Emergency Contact block | text/textarea | — |
| Mexican address block (B1) | text/Combobox | CURP format validated |
| INE / CURP | text | B1 conditional required |

**Network on Save:** `PATCH /api/v1/mdata/drivers/:id` via `updateDriver`.  
**On success:** `setEditMode(false)`, toast "Driver updated", invalidates drivers list.  
**On cancel (missing):** N/A — no cancel affordance.

## QBO (Profile tab subsection + Mapping tab)

### QBO subsection (Profile tab, always visible)

| Control | Behavior |
|---------|----------|
| QBO vendor | `QboCombobox` — local state `qboVendorPickId` |
| Class (TMS catalog) | `SelectCombobox` from `listClassesForJe` |
| Save QBO fields | Separate `saveDriverQboMutation` → `updateDriver` with `qbo_vendor_id`, `qbo_class_id` only |

**Finding MEDIUM-DA-C-02:** Profile **Save** does not push to QBO. QBO vendor/class changes require explicit "Save QBO fields". Edit-header Save and QBO Save are separate writes — operators may assume one Save syncs both.

**QBO sync on profile save:** No outbox push triggered from `updateDriver` profile fields in frontend; QBO linkage is explicit via QBO Mapping tab + Save QBO fields. **Rollback plan:** PATCH is idempotent; revert via Audit History / manual re-edit. No destructive QBO write from profile Save alone.

---

## QBO Mapping tab

| Control | Network |
|---------|---------|
| Link to existing / Edit Linkage | Opens `VendorLinkageModal` (Owner only) |
| Linkage history list | `listQboVendorLinkageHistory` |

---

## Equipment Assignments tab

**Scope note:** Tab implements **equipment qualifications + pay rates**, not truck/trailer unit assignment (blueprint §7.2.2.2 mentions equipment assignment — current UI is qualification-centric).

| Control | Type | RBAC | Network |
|---------|------|------|---------|
| Show inactive qualifications | checkbox | canManageRates | Refetch `listDriverQualifications(includeInactive)` |
| + Create Equipment Qualification | `Button` | canManageRates | Opens modal → `createDriverQualification` |
| Pencil (rate edit) | `Button` | canManageRates | Opens rate modal → `changeDriverQualificationRate` |
| History icon | `Button` | all viewers | Opens history modal |
| Deactivate | `Button` danger | canManageRates | `deactivateDriverQualification` |
| Reactivate | `Button` | canManageRates | `reactivateQualification` |

**Create qualification modal fields:** equipment_type_id* (Combobox), qualified_at* (date), notes (optional).

**Rate change modal fields:** amount*, effective_from*, change_reason*, change_notes.

**Empty state:** "No qualifications found for this driver."

**Finding HIGH-DA-C-03:** No assign truck / unassign / transfer-to-driver actions — tab name "Equipment Assignments" over-promises vs qualifications-only implementation.

**Finding MEDIUM-DA-C-04:** `+ Create Equipment Qualification` disabled when all equipment types already qualified (`equipmentTypeOptions.length === 0`) with no explanation tooltip.

---

## CRITICAL findings

None identified on driver surfaces in this pass.

## HIGH findings

| ID | Finding |
|----|---------|
| DA-C-01 | Driver Edit lacks Cancel — cannot discard edits |
| DA-C-03 | Equipment Assignments is qualifications-only, not unit assignment |

## Severity summary (Driver)

| ID | Severity | Finding |
|----|----------|---------|
| DA-C-01 | **HIGH** | Driver Edit lacks Cancel — cannot discard edits |
| DA-C-03 | **HIGH** | Equipment Assignments is qualifications-only, not unit assignment |
| DA-C-02 | MEDIUM | Profile Save vs Save QBO fields are separate writes |
| DA-C-04 | MEDIUM | Create qualification disabled without user-facing reason |
