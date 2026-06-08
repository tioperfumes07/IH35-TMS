# GAP-37 — Equipment Dual-Confirm Transfer (G14 · WF-047)

Source: **G14** master rule + **WF-047**. Equipment handoffs between drivers
previously updated assignment in the database from the dispatcher side only, with
no outbound drop confirmation, inbound pickup confirmation, or linked photo
evidence. WF-047 requires both drivers to confirm the physical handoff with an
audit chain.

## Problem

When a trailer is dropped at a yard for another driver to pick up, accountability
was ambiguous if damage was discovered later. A single-side DB update does not
establish when custody changed or who attested to equipment condition.

## Schema reality (adaptation from the original spec)

| Spec assumption | Live schema (used here) |
| --- | --- |
| `operating_company_id TEXT` | `uuid NOT NULL REFERENCES org.companies(id)` |
| `gen_random_uuid_v7()` | `gen_random_uuid()` |
| role `app_user` | role `ih35_app` |
| `equipment.current_driver` | `mdata.equipment.assigned_driver_id` |

## What shipped (ADDITIVE)

### Migration — `db/migrations/202606080204_equipment_transfer_requests.sql`

- Creates `dispatch.equipment_transfer_requests` with dual-confirm lifecycle:
  `pending_outbound` → `outbound_confirmed` → `completed` (or `cancelled`).
- Stores outbound/inbound evidence UUIDs and confirmation timestamps.
- RLS scoped to `app.operating_company_id`, `ih35_app` grants.

### Request service — `apps/backend/src/dispatch/equipment-transfer/request.service.ts`

- `initiateTransfer` — dispatcher starts a transfer at a yard/location.
- `listPendingForDriver` — driver PWA pending drop or pickup queue; omit
  `driver` to list all active transfers for the dispatcher board.
- `cancelTransfer` — cancels an in-progress request.

### Dual-confirm service — `apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts`

- `confirmOutbound` — validates `from_driver_uuid`, records drop evidence, sets
  `outbound_confirmed`.
- `confirmInbound` — validates `to_driver_uuid`, records pickup evidence, sets
  `completed`, reassigns `mdata.equipment.assigned_driver_id`, and emits a linked
  audit chain referencing both evidence UUIDs.
- Wrong-driver confirmation returns `driver_mismatch` (403).

### Routes — `apps/backend/src/dispatch/equipment-transfer/routes.ts`

- `POST  /api/v1/dispatch/equipment-transfers/initiate`
- `GET   /api/v1/dispatch/equipment-transfers/pending?operating_company_id=&driver=&direction=`
- `POST  /api/v1/dispatch/equipment-transfers/:uuid/confirm-outbound`
- `POST  /api/v1/dispatch/equipment-transfers/:uuid/confirm-inbound`
- `POST  /api/v1/dispatch/equipment-transfers/:uuid/cancel`

### Frontend

- `EquipmentTransferModal.tsx` — dispatcher initiate flow.
- `EquipmentTransferRequests.tsx` — `/dispatch/equipment-transfers` queue with
  status and audit drill-down.

### Driver PWA

- `IncomingTransferRequest.tsx` — Today-screen card for pending drop (outbound)
  or pickup (inbound) with photo evidence confirm modal.

### CI guard — `scripts/verify-equipment-transfer-dual-confirm.mjs`

Asserts migration DDL, services, five routes, UI surfaces, tests, and docs
(`verify:equipment-transfer-dual-confirm`, wired into CI).

## Post-merge

Integrates with **GAP-38** damage continuity: damage discovered at inbound
confirmation can trigger **WF-027** insurance claim linkage.
