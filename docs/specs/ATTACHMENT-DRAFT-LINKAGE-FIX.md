# Design: Fix orphaned create-time attachments (draft-id linkage)

**Status:** DESIGN — awaiting Jorge's OK. No code shipped. Backend + financial/legal-evidence → §1.3/§1.4 gate.
**Author:** agent (paired) · **Date:** 2026-06-17
**Severity:** HIGH — silent loss of financial/legal evidence (receipts, bill scans, WO photos).

---

## 1. The bug (verified, not guessed — §4)

Every "create" form that lets you attach a file **before the record exists** stores that file under a
throway id that no record will ever read back.

**Write side** — e.g. `CreateWorkOrderModal.tsx`:
```tsx
const [draftAttachmentEntityId] = useState(() => crypto.randomUUID());   // random, ephemeral
<UploadZone entityType="work_order" entityId={draftAttachmentEntityId} ... />
```
`UploadZone` uploads immediately to `documents.attachments` with `entity_id = <random draft id>`.

**Read side** — `WorkOrderDetailPage.tsx:431`:
```tsx
<UploadZone entityType="work_order" entityId={id} ... />   // id = the REAL work order id
```
The detail page lists attachments by the **real** record id → the draft-keyed rows are invisible.

**The draft id is never bridged.** In each form it appears in exactly two places — the `useState(randomUUID)`
and the `entityId` prop — and **nowhere else**: it is not threaded into the create payload, and the create
routes do not accept it. `POST /api/v1/expenses` (and peers) have no `attachment_draft_id` field. There is
no server reconcile. So the row sits in `documents.attachments` with an `entity_id` that matches nothing.

### Proof chain
1. `documents.attachments` (migration 0106) keys evidence by `(entity_type, entity_id)`; `entity_id` is a
   plain `uuid` (no FK), `PK id DEFAULT gen_random_uuid()`.
2. `attachments.service.ts` inserts with the caller-supplied `entity_id` verbatim.
3. `UploadZone` is the **only** attachment lister (`listAttachments({ entity_type, entity_id })`).
4. Create modals pass a random `entityId`; detail pages pass the real record id. They never match.

## 2. Blast radius

7 create surfaces use the random-draft-id pattern (file attached during creation is orphaned):

| Form | entity_type | Evidence lost |
|------|-------------|---------------|
| `components/accounting/VendorBillForm.tsx` | bill | vendor invoice scans |
| `components/expenses/RecordExpenseModal.tsx` | expense | receipts |
| `pages/accounting/RecordPaymentModal.tsx` | payment | check/ACH/wire confirmations |
| `pages/accounting/modals/InvoiceTypeModalBase.tsx` | invoice | rate cons / BOL |
| `pages/maintenance/components/CreateExpenseModal.tsx` | expense | receipts |
| `pages/maintenance/components/CreateBillModal.tsx` | bill | vendor invoices |
| `pages/maintenance/components/CreateWorkOrderModal.tsx` | work_order | WO photos/estimates |

(`SevereRepairEstimateModal.tsx` references UploadZone but no draft-id state — separate check.)

Attachments added **after** creation (via a detail-page UploadZone keyed to the real id) are fine. Only
the create-time uploads are lost.

## 3. Options (the fork — surfaced, not silently chosen)

### Option B — server reconcile  ⭐ recommended
- Create routes accept optional `attachment_draft_id: uuid`.
- Inside the same transaction that inserts the record, re-key the draft attachments:
  ```sql
  UPDATE documents.attachments
     SET entity_id = $newRecordId
   WHERE operating_company_id = $oci
     AND entity_type = $type
     AND entity_id = $draftId;
  ```
- One shared helper `reassignDraftAttachments(client, { operatingCompanyId, entityType, draftId, newId })`,
  called from each create service after the insert. Frontend change is one line per form (send the draft id).
- **Pros:** atomic (same txn as create → no orphan window, no partial state on failure); keeps
  server-generated UUIDv7 PKs (§2); minimal frontend churn; no migration (table already shaped for it).
- **UNIQUE (oci, sha256, entity_type, entity_id):** re-key can only collide if the identical file was already
  attached to the real record — guard with `ON CONFLICT DO NOTHING` / pre-delete the dup draft row.
- **Gate:** backend, touches create routes (not `accounting.*` schema/posting) → §1.3 backend gate
  (your OK), not the §1.4 financial-cluster lockdown. No migration.

### Option A — deferred attach (frontend only)
- `UploadZone` gains a "deferred" mode: stage files in memory, expose them to the parent; after create
  returns the real id, upload to that id.
- **Pros:** no backend change. **Cons:** more frontend churn per form; an upload window after create where
  a failure leaves files unsent; duplicates UploadZone's upload logic.

### Option C — client-supplied PK (record.id = draft id)  ❌ rejected
- Violates §2 "UUIDv7 server-generated PKs." Do not pursue.

## 4. Recommendation

**Option B.** Atomic, smallest surface, honors PK invariant, no migration.

### Rollout (atomicity dictates the order)
- **Increment 1 (this PR):** shared `reassignDraftAttachments` helper + the two create routes that insert
  the record **inline inside their own transaction** — `POST /api/v1/expenses` (expense) and
  `POST /api/v1/work-orders` (work_order). The reconcile runs in that same txn → fully atomic.
- **Increment 2 (follow-up PR):** `bill`, `invoice`, `payment` create routes thread the draft id **into
  their service functions** (`createBill`, invoice/payment services) so the re-key stays inside the
  service's transaction (doing it in the route after the service returns would be a *separate* txn — an
  orphan window — so it must go into the service). Same helper, same guard extended.

Each increment is its own gated PR with your OK.

## 5. Verification plan (per fixed route)
- Unit: `reassignDraftAttachments` re-keys only matching `(oci, entity_type, draftId)` rows; no-op when none.
- Integration: create with `attachment_draft_id` → attachment now visible under the real id; without it → unchanged.
- Static guard `verify-attachment-draft-reconcile`: each create route that renders a draft-id UploadZone must
  call `reassignDraftAttachments` (prevents new orphan surfaces and regressions).
- **End-to-end live verify (GUARD, not code-inspection):** create a bill WITH a receipt → open the bill →
  the receipt is THERE. Repeat for one expense and one work order.

## 5a. Historical orphans already in prod (Jorge must decide)

**Every create-time attachment uploaded before this fix is already orphaned** in `documents.attachments`
(+ the R2 object in `ih35-tms-evidence`) under a random draft `entity_id` that matches no record. The fix is
forward-only — it does **not** recover past evidence on its own.

**Is a backfill feasible?** Partially, best-effort, NOT guaranteed:
- The orphan row still has `operating_company_id`, `entity_type`, `category`, `uploaded_by_user_id`,
  `uploaded_at`, `filename`, `sha256_hash`, and the live R2 object — so the **files are not lost**, only the
  *linkage*.
- To re-link, match each orphan to a record by: same `operating_company_id` + `entity_type`, `uploaded_at`
  within a tight window of the record's `created_at`, same `uploaded_by_user_id`. This is heuristic — a
  draft `entity_id` carries **no** hard pointer to the record, so matches are probabilistic and a creator who
  made two same-type records minutes apart could be ambiguous.
- **Recommendation:** ship the forward fix first. Then, as a separate **owner-reviewed** one-off, produce a
  *proposed* match list (orphan → candidate record, with confidence) for Jorge to approve before any re-key —
  never auto-link financial/legal evidence on a heuristic. Unmatchable orphans stay queryable via an
  "unlinked evidence" admin view rather than being deleted (void-not-delete).
- **If not backfilled:** the files remain in R2 and the rows remain in the table; they're simply not shown on
  any record. Nothing is destroyed — it's recoverable later if priorities change.

## 6. Relationship to GAP-11
GAP-11 ("wire UploadZone into the expense form, match the bill pattern") is **blocked** by this: matching the
current pattern would add an 8th orphan surface. GAP-11 should land *on top of* Option B (send the draft id +
reconcile), not before it.

## 7. END-TO-END STATUS (2026-06-17, honest) — backend plumbed, UI NOT connected yet

Increments 1 (#1152, merged) and 2 (#1165, held) wired the `reassignDraftAttachments` re-key into backend
create routes. **But the fix does NOTHING end-to-end yet** — two gaps:

1. **No frontend form sends `attachment_draft_id`.** All 7 create forms generate a `draftAttachmentEntityId`,
   pass it to `UploadZone`, but do **not** include it in their create payload. So `draftId` arrives
   `undefined` at the backend and the helper no-ops. Each form must send
   `attachment_draft_id = draftAttachmentEntityId` in its create call. (Forms delegate create to
   parent-provided fns — the wiring is multi-hop and must be traced per form.)
2. **Endpoint mismatch (work_order).** inc-1 wired `POST /api/v1/work-orders`, but the Create WO modal
   actually posts to `POST /api/v1/maintenance/work-orders` (`maintenance/work-orders.routes.ts`), which has
   **no** reconcile. The reconcile must move/also-apply to the endpoint the UI uses. Every form↔endpoint pair
   must be confirmed before claiming the surface is fixed.

**Corrected completion plan (per surface — do NOT claim fixed until all three hold):**
| Surface | Form(s) | Actual create endpoint | Reconcile on that endpoint? | Form sends draft id? |
|---------|---------|------------------------|-----------------------------|----------------------|
| expense | RecordExpenseModal, maint CreateExpenseModal | (trace) `/api/v1/expenses`? | inc-1 ✅ if so | ❌ |
| work_order | CreateWorkOrderModal | `/api/v1/maintenance/work-orders` | ❌ (wired the other endpoint) | ❌ |
| bill | VendorBillForm, maint CreateBillModal | (trace) | inc-2 (held) | ❌ |
| invoice | InvoiceTypeModalBase | (trace) `/api/v1/accounting/invoices`? | inc-2 (held) if so | ❌ |
| payment | RecordPaymentModal | `/api/v1/accounting/payments` ✅ | inc-2 (held) ✅ | ❌ |

**Definition of done (revised):** for every form, GUARD creates the record WITH an attachment and confirms it
appears on the record's detail view live. Backend plumbing alone is NOT done — it must be traced to the UI's
real endpoint AND the form must send the draft id. This is the lesson again: merged ≠ working
(see [[merged-not-live-landmines]]).
