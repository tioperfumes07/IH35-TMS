#!/usr/bin/env node
// verify:dispatch-notify-prefs-onerror
// Guard for 0441-mod4-dispatch-notify-prefs-no-onerror.
//
// The customer notification-preferences toggles fire fire-and-forget mutations. Without an onError
// handler a failed save is silent — the toggle appears to have saved when it did not. Both mutations
// (saveM, syncM) MUST carry an onError that surfaces feedback. This guard fails if either regresses to
// no onError. Additive only. LINKAGE: dispatch notify prefs -> user feedback (toast).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx";

export function audit(src) {
  const failures = [];
  const onErrorCount = (src.match(/onError\s*:/g) || []).length;
  const mutationCount = (src.match(/useMutation\(/g) || []).length;
  const safeErrorCount = (src.match(/pushToast\(userFacingApiError\(error,/g) || []).length;
  if (mutationCount < 2) failures.push(`expected >=2 useMutation() calls (saveM + syncM), found ${mutationCount}.`);
  if (onErrorCount < mutationCount) failures.push(`each useMutation must have an onError: found ${onErrorCount} onError for ${mutationCount} mutations.`);
  if (safeErrorCount < mutationCount) failures.push(`each mutation error must use userFacingApiError: found ${safeErrorCount} safe handlers for ${mutationCount} mutations.`);
  if (/pushToast\(error instanceof Error \? error\.message/.test(src)) failures.push("raw Error.message still reaches a notification toast.");
  if (!/mutationFn:\s*\(input:[\s\S]{0,260}updateCustomerNotifyPreferences\(input\.customerId,\s*\{ operating_company_id: input\.companyId/.test(src)) failures.push("preference save must snapshot customer and company scope.");
  if ((src.match(/queryKey:\s*\["customer-notify-prefs", input\.companyId, input\.customerId\]/g) || []).length < 2) failures.push("success and failure must invalidate only the submitted customer/company scope.");
  if (!/enabled=\{Boolean\(companyId\) && !saveM\.isPending\}/.test(src)) failures.push("customer picker must lock during preference save.");
  if ((src.match(/disabled=\{saveM\.isPending(?: \|\| !prefs\.opt_in)?\}/g) || []).length < 7) failures.push("all preference toggles must serialize while a save is pending.");
  return { failures, onErrorCount, mutationCount };
}

if (process.argv.includes("--selftest")) {
  const good = `useMutation({ mutationFn: (input: { companyId: string; customerId: string }) => updateCustomerNotifyPreferences(input.customerId, { operating_company_id: input.companyId }), onSuccess: (_data, input) => invalidate({ queryKey: ["customer-notify-prefs", input.companyId, input.customerId] }), onError: (error, input) => { pushToast(userFacingApiError(error, "Save failed")); invalidate({ queryKey: ["customer-notify-prefs", input.companyId, input.customerId] }); } });\nuseMutation({ onError: (error) => pushToast(userFacingApiError(error, "Sync failed")) });\nenabled={Boolean(companyId) && !saveM.isPending}\ndisabled={saveM.isPending}\ndisabled={saveM.isPending || !prefs.opt_in}\ndisabled={saveM.isPending || !prefs.opt_in}\ndisabled={saveM.isPending || !prefs.opt_in}\ndisabled={saveM.isPending || !prefs.opt_in}\ndisabled={saveM.isPending || !prefs.opt_in}\ndisabled={saveM.isPending || !prefs.opt_in}`;
  if (audit(good).failures.length) { console.error("selftest good fixture FAIL"); process.exit(1); }
  const planted = good.replace('pushToast(userFacingApiError(error, "Sync failed"))', 'pushToast(error instanceof Error ? error.message : "Sync failed")');
  if (!audit(planted).failures.some((failure) => failure.includes("raw Error.message"))) { console.error("selftest planted raw message not detected"); process.exit(1); }
  for (const [name, before, after] of [["scope", "input.customerId", "customerId"], ["picker lock", "enabled={Boolean(companyId) && !saveM.isPending}", "enabled={Boolean(companyId)}"], ["toggle lock", "disabled={saveM.isPending}", "disabled={false}"]]) {
    const changed = good.replace(before, after);
    if (changed === good || audit(changed).failures.length === 0) { console.error(`selftest ${name} mutation not detected`); process.exit(1); }
  }
  console.log("verify:dispatch-notify-prefs-onerror --selftest PASS");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, file), "utf8");
const { failures, onErrorCount, mutationCount } = audit(src);

if (failures.length > 0) {
  console.error("verify:dispatch-notify-prefs-onerror FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`verify:dispatch-notify-prefs-onerror PASS (${onErrorCount} onError handlers for ${mutationCount} mutations)`);
