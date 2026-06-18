# Edit Load = full wizard + Settlement-section decision (Block 06 / Priority 2)

Durable record so these survive agent handoffs. Block 06 root cause + the locked Settlement decision.

## Block 06 — root cause (confirmed 2026-06-18)
- **Book Load** = `BookLoadModalV4` (the full unified wizard).
- **Edit Load** = the **`LoadDetailDrawer`** — inline Rate(cents)+Notes edit (`setEditing` toggle) + piecemeal
  tabs (Stops `MultiStopEditor`, Driver Pay `LoadDetailDriverPayTab`, Settlement `SettlementProfitabilityCard`/
  `LoadDetailSettlementTab`). It is **not the wizard**. (`BookLoadModalV3.deprecated` is mounted nowhere.)
- **`BookLoadModalV4` has no edit/prefill mode** — book-only props/defaults, create-only save.

So Jorge's Edit-Load defects (Open misaligned, stops outline, crammed date/time, vertical banner date,
missing Trip Type) are the drawer, not the wizard. **The real fix is "Edit = full wizard":** add edit-mode
to V4 (fetch the load → prefill every field → UPDATE-save path), then point all Edit entry points
(detail/list/table/kanban) at it. That single change resolves the cosmetic defects + surfaces Trip Type
(needs **Block 04**). **Do NOT polish the drawer cosmetics** — the drawer gets replaced; polishing is throwaway.

**Sequencing:** this rides **Priority 2, AFTER `#1180` (trip_type/tour migration) merges**, alongside
Block 04 (Trip Type selector) → Block 05 (Trip Pairing Board) → Block 06 (Edit = full wizard). Not a
standalone Tier-3.

### Already shipped from Block 06 (the standalone parts)
- **06b Driver Pay error → fixed (#1185):** `driver-bills` requires both `load_id` + `operating_company_id`;
  the tab now gates the call on both (missing param produced the 400 it rendered as an error).

## Settlement-section decision (Jorge, 2026-06-18) — WIRE THROUGH (read-only)
When V4 gets edit-mode, the load detail/wizard keeps a **READ-ONLY settlement summary** that **links out to
the real Settlements module record**. Rules:
- **Do NOT duplicate settlement logic** in the load view (settlements live in the Settlements module — locked).
- **Do NOT remove** the section (additive-only).
- It is a **read-through that opens the Settlements module**, never an editable stub.
- Driver settlements close on return to Laredo (SB leg) via the existing settlement module — unchanged.

Implement this as part of the Priority-2 "Edit = full wizard" build: the wizard's Settlement section renders a
summary (read-only) + a link/button to the Settlements module record for that driver/settlement; no editable
fields, no settlement math in the wizard.
