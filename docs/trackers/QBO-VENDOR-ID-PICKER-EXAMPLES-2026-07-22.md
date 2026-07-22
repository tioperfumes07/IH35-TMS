# DriverDetail / VehicleProfile `qbo_vendor_id` — detailed examples (2026-07-22)

Owner asked for **specific detailed examples** before choosing A/B/C. **No code change in this file** — decision only.

## What the field actually stores today

| Surface | Column | Value shape | UI today | Persist API |
|---------|--------|-------------|----------|-------------|
| Driver detail — "QBO reporting (vendor & class)" | `mdata.drivers.qbo_vendor_id` | **QBO vendor id string** (e.g. `"58"`, `"1234"`) — **not** a TMS UUID | `QboCombobox entityType="vendor"` | PATCH driver with `qbo_vendor_id: qboVendorPickId` |
| Driver — QBO Mapping tab | same column | same | status + `VendorLinkageModal` (also QBO-id space) | linkage history APIs |
| Vehicle / unit profile — "QBO mapping" | `mdata.units.qbo_vendor_id` | **QBO vendor id string** | `QboCombobox entityType="vendor"` | `patchUnit({ qbo_vendor_id })` |

TMS vendors live in `mdata.vendors` with UUID `id` and optional `qbo_id` (QBO’s id). Those are **two different identifiers**.

---

## Concrete examples (made-up but realistic)

### Example company data

| TMS vendor (`mdata.vendors`) | `id` (UUID) | `display_name` | `qbo_id` |
|------------------------------|-------------|----------------|---------|
| Faro Factoring LLC | `aaaaaaaa-....-0001` | Faro Factoring LLC | `58` |
| Love's Travel Stops | `aaaaaaaa-....-0002` | Love's Travel Stops | `912` |
| New shop (never pushed to QBO) | `aaaaaaaa-....-0003` | Roadside Pros LLC | `null` |

| Driver | Today’s `qbo_vendor_id` | Meaning |
|--------|-------------------------|---------|
| Juan Perez | `58` | Linked to QBO vendor 58 (= Faro in QBO) |
| Maria Lopez | `null` | Unlinked |

---

### Option A — Keep QBO-id picker (status quo / allowlist)

**Operator action on DriverDetail:**

1. Opens QBO vendor combobox.  
2. Sees QBO list: `58 · Faro Factoring LLC`, `912 · Love's…`.  
3. Picks `58`.  
4. Save writes `drivers.qbo_vendor_id = "58"`.

**Pros:** Matches QBO sync / linkage history; no join required; already how bulk link + VendorLinkageModal work.  
**Cons:** Operator can pick a QBO vendor that has **no** TMS vendor row (or a different TMS vendor than the driver’s settlement vendor). Two “vendor” concepts stay split.

**When A is right:** You want this field to mean “which QBO vendor id does reporting/sync use?” and settlement/pay still uses a separate TMS vendor link elsewhere.

---

### Option B — ReferenceSelect TMS vendor → write QBO id via mapping

**Operator action:**

1. Opens `ReferenceSelect createKind="vendor"` (TMS roster + nested +Create).  
2. Picks **Faro Factoring LLC** (`aaaaaaaa-....-0001`).  
3. Save path: look up `vendors.qbo_id` → `"58"` → write `drivers.qbo_vendor_id = "58"`.  
4. If operator picks **Roadside Pros** (`qbo_id` null): **fail closed** with “Vendor has no QBO id — link in QBO Bulk Link / push vendor first” (recommended) OR leave null (weaker).

**Pros:** One mental model (pick the TMS vendor you already use for bills/settlements); nested +Create works.  
**Cons:** Requires every reportable vendor to have `qbo_id` populated; cannot attach a pure-QBO-only vendor that isn’t in `mdata.vendors`.

**Edge case:** Two TMS vendors share the same `qbo_id` (bad data) — must fail closed or show conflict.

---

### Option C — Dual display

**UI:**

- Line 1 (read-only or link): “TMS settlement vendor: …” (existing driver-as-vendor / vendor_id if present).  
- Line 2: “QBO vendor id: `58` · Faro Factoring LLC” via QboCombobox **or** derived from TMS vendor’s `qbo_id`.  
- Optional: “Sync from TMS vendor” button that copies `vendors.qbo_id` → `qbo_vendor_id`.

**Pros:** Honest about two systems; no silent wrong-id writes.  
**Cons:** More chrome; operators can still diverge TMS vs QBO on purpose.

---

## Same choice applies to VehicleProfile

Unit `qbo_vendor_id` is the same id space (ownership / lease entity in QBO). Whatever you pick for DriverDetail should apply to VehicleProfile unless you explicitly split rules.

---

## What I need back

Reply with one of:

- **A** — keep QboCombobox (allowlist DriverDetail + VehicleProfile)  
- **B** — ReferenceSelect TMS vendor; fail closed if `qbo_id` missing  
- **C** — dual UI as above  

…and whether VehicleProfile follows the **same** letter.


---

## OWNER DECISION (2026-07-22)

**A** — keep `QboCombobox` (QBO-id allowlist) for DriverDetail + VehicleProfile.
**VehicleProfile:** same letter (**A**).

Rationale (architecture): field stores QBO vendor id for driver-as-vendor / parallel-books linkage; hire may leave null until MD-2 reconcile; B would confuse TMS shop pickers with QBO identity.
