#!/usr/bin/env node
// V3/V4/V5/V6 GUARD — the Vendors page must expose a top-level "+ Create Vendor" CTA (§7 vocab: "+ Create",
// never "+ New"/"+ Add") wired to the full QBO-parity creator modal, and the Vendor profile edit must cover
// 100% of the persisted vendor fields (incl. tax_id + vendor_code) with no read-only summary card duplicating
// the editable rows (no box-within-box). Locks the parity so it can't silently regress.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8");
}

const vendorsPath = "apps/frontend/src/pages/Vendors.tsx";
const modalPath = "apps/frontend/src/components/vendors/VendorCreateModal.tsx";
const detailPath = "apps/frontend/src/pages/VendorDetail.tsx";

const vendors = read(vendorsPath);
const modal = read(modalPath);
const detail = read(detailPath);

if (!vendors) failures.push(`missing:${vendorsPath}`);
if (!modal) failures.push(`missing:${modalPath}`);
if (!detail) failures.push(`missing:${detailPath}`);

// V3 — the "+ Create Vendor" CTA with correct §7 vocab.
if (vendors && !vendors.includes("+ Create Vendor")) failures.push("missing_create_vendor_cta");
if (vendors && /\+\s*(New|Add)\s+Vendor/.test(vendors)) failures.push("wrong_vocab_new_or_add_vendor");
if (vendors && !vendors.includes("VendorCreateModal")) failures.push("missing_vendor_create_modal_usage");

// V4/V5 — full creator modal: real create endpoint + notes-meta serialization + QBO-parity sections.
if (modal && !modal.includes("createVendor")) failures.push("modal_missing_create_endpoint");
if (modal && !modal.includes("serializeVendorNotes")) failures.push("modal_missing_notes_meta_serialization");
if (modal && !modal.includes('title="Create Vendor"')) failures.push("modal_missing_create_vendor_title");
for (const section of ["Name and contact", "Address", "Classification", "Notes"]) {
  if (modal && !modal.includes(section)) failures.push(`modal_missing_section_${section.replace(/\s+/g, "_")}`);
}

// V6 — profile edit covers 100% of persisted fields (tax_id + vendor_code were previously not editable) and
// no read-only FlatFieldGrid summary duplicating the editable rows (box-within-box removed).
if (detail && !detail.includes("vendorCode")) failures.push("detail_missing_vendor_code_edit");
if (detail && !detail.includes("taxId")) failures.push("detail_missing_tax_id_edit");
if (detail && !detail.includes("vendor_code:")) failures.push("detail_missing_vendor_code_persist");
if (detail && !detail.includes("tax_id:")) failures.push("detail_missing_tax_id_persist");
if (detail && detail.includes("FlatFieldGrid")) failures.push("detail_box_within_box_summary_present");

if (failures.length > 0) {
  console.error("verify:vendor-create-profile FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:vendor-create-profile OK");
