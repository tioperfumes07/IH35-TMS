import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-dispute-object-sets-never-share-a-query.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-dispute-object-sets-never-share-a-query.mjs"], { stdio: "inherit" });
// 443.99 — owns the accounting.modal.open_dispute connectivity leaf (Open dispute → POST /invoices/:id/disputes).
execFileSync(process.execPath, ["scripts/verify-open-dispute-modal-connectivity.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-open-dispute-modal-connectivity.mjs"], { stdio: "inherit" });
