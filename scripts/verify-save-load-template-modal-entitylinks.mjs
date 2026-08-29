#!/usr/bin/env node
/**
 * SaveLoadTemplateModal must EntityLink source load + customer
 * (Exact Leaves dispatch.modal.save_load_template:load|customer|reverse_link).
 *
 * FAIL: name-only modal with no EntityLinks to the source load/customer.
 * PASS: data-testid=save-load-template-modal-entitylinks + LoadDetailDrawer props.
 *
 * Self-test: node scripts/verify-save-load-template-modal-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-save-load-template-modal-entitylinks";
const MODAL = path.join(ROOT, "apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx");
const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const SERVICE = path.join(ROOT, "apps/backend/src/dispatch/dispatch-refinements.service.ts");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function checkSource(modal, service = fs.readFileSync(SERVICE, "utf8")) {
  const drawer = fs.readFileSync(DRAWER, "utf8");
  assert(/import\s*\{\s*EntityLinkOrTombstone\s*\}\s*from\s*["'][^"']*\/EntityLinkOrTombstone["']/.test(modal), "modal must import canonical label-aware tombstones");
  assert(
    /data-testid=["']save-load-template-modal-entitylinks["']/.test(modal),
    "must expose save-load-template-modal-entitylinks"
  );
  assert(/kind="load" id=\{loadId\} name=\{loadNumber\} noun="Load"/.test(modal), "load id must be coupled to its nullable human number");
  assert(/kind="customer" id=\{customerId\} name=\{customerName\} noun="Customer"/.test(modal), "customer id must be coupled to its nullable human name");
  assert(/loadId=\{load\.id\}/.test(drawer), "LoadDetailDrawer must pass loadId");
  assert(/customerId=\{load\.customer_id\}/.test(drawer), "LoadDetailDrawer must pass customerId");
  assert(/const scopeGenerationRef = useRef\(0\)/.test(modal), "modal must own a scope generation");
  assert(/\[customerId, customerName, loadId, open, operatingCompanyId\]/.test(modal), "modal must reset on every mounted scope identity");
  assert(/setName\(""\)[\s\S]*setErr\(null\)[\s\S]*setPending\(false\)/.test(modal), "scope reset must clear name, error, and pending state");
  assert(/const submittedCompanyId = operatingCompanyId/.test(modal), "submit must snapshot company scope");
  assert(/const submittedTemplateJson = \{[\s\S]*customer_id: templateCustomerId[\s\S]*customer_name: templateCustomerName/.test(modal), "submit must snapshot customer/template payload");
  assert(/createLoadTemplate\(\{[\s\S]*operating_company_id: submittedCompanyId[\s\S]*name: submittedName[\s\S]*template_json: submittedTemplateJson/.test(modal), "writer must consume only the submitted scope snapshot");
  assert(/scopeGenerationRef\.current !== submittedGeneration\) return/.test(modal), "late success must not close a replacement scope");
  assert(/scopeGenerationRef\.current === submittedGeneration\) setErr\("Save failed"\)/.test(modal), "late failure must not contaminate a replacement scope");
  assert(/<Modal open=\{open\} onClose=\{closeUnlessPending\}/.test(modal), "modal dismissal must be locked while saving");
  assert(/<EntityPicker[\s\S]*disabled=\{pending\}[\s\S]*dataTestId="save-load-template-modal-customer"/.test(modal), "customer picker must be locked while saving");
  assert(/<input value=\{name\}[^\n]*disabled=\{pending\}/.test(modal), "name must be locked while saving");
  assert(/onClick=\{closeUnlessPending\} disabled=\{pending\}/.test(modal), "Cancel must be locked while saving");
  assert(/const template = res\.rows\[0\];[\s\S]*if \(!template\)[\s\S]*code: "E_TEMPLATE_CREATE_FAILED"[\s\S]*return template;/.test(service), "backend create must fail loud when INSERT RETURNING yields no canonical template identity");
  assert(/z\.string\(\)\.uuid\(\)\.safeParse\(customerId\)/.test(service), "backend create must validate the nested customer id before its SQL UUID cast");
  assert(/!parsedCustomerId\.success[\s\S]*statusCode: 400[\s\S]*code: "E_TEMPLATE_CUSTOMER_ID_INVALID"/.test(service), "malformed nested customer ids must return a typed client error");
  assert(/\[parsedCustomerId\.data, input\.operating_company_id\]/.test(service), "same-company customer lookup must consume only the validated UUID");
  assert(/await appendCrudAudit\([\s\S]*?"dispatch\.load_template\.created"[\s\S]*?operating_company_id: input\.operating_company_id[\s\S]*?load_template_id: template\.id[\s\S]*?customer_id: customerId \|\| null/.test(service), "backend create must audit the persisted template identity and company/customer linkage");
}

function check() {
  checkSource(fs.readFileSync(MODAL, "utf8"));
}

function selftest() {
  const original = fs.readFileSync(MODAL, "utf8");
  const mutations = [
    [/data-testid=["']save-load-template-modal-entitylinks["']/, 'data-testid="planted-missing"'],
    [/name=\{loadNumber\}/, "name={loadId}"],
    [/name=\{customerName\}/, "name={customerId}"],
    [/EntityLinkOrTombstone/, "EntityLink"],
    [/const scopeGenerationRef = useRef\(0\)/, "const scopeGenerationRef = { current: 0 }"],
    [/\[customerId, customerName, loadId, open, operatingCompanyId\]/, "[customerId, customerName, open]"],
    [/setName\(""\)/, "setName(name)"],
    [/const submittedCompanyId = operatingCompanyId/, "const submittedCompanyId = ''"],
    [/template_json: submittedTemplateJson/, "template_json: initialJson"],
    [/scopeGenerationRef\.current !== submittedGeneration\) return/, "false) return"],
    [/scopeGenerationRef\.current === submittedGeneration\) setErr\("Save failed"\)/, 'true) setErr("Save failed")'],
    [/<Modal open=\{open\} onClose=\{closeUnlessPending\}/, "<Modal open={open} onClose={onClose}"],
    [/disabled=\{pending\}\n            placeholder="No customer/, 'disabled={false}\n            placeholder="No customer'],
    [/onChange=\{\(ev\) => setName\(ev\.target\.value\)\} disabled=\{pending\}/, "onChange={(ev) => setName(ev.target.value)} disabled={false}"],
    [/onClick=\{closeUnlessPending\} disabled=\{pending\}/, "onClick={onClose}"],
  ];
  for (const [pattern, replacement] of mutations) {
    const broken = original.replace(pattern, replacement);
    assert(broken !== original, `--selftest plant must mutate ${pattern}`);
    let failed = false;
    try { checkSource(broken); } catch { failed = true; }
    assert(failed, `--selftest expected FAIL for ${pattern}`);
  }
  const service = fs.readFileSync(SERVICE, "utf8");
  const brokenService = service.replace('code: "E_TEMPLATE_CREATE_FAILED"', 'code: "REMOVED"');
  assert(brokenService !== service, "--selftest must plant the missing create-identity guard");
  let serviceFailed = false;
  try { checkSource(original, brokenService); } catch { serviceFailed = true; }
  assert(serviceFailed, "--selftest expected FAIL when backend create-identity guard is removed");
  const serviceMutations = [
    [/z\.string\(\)\.uuid\(\)\.safeParse\(customerId\)/, "{ success: true, data: customerId }"],
    [/code: "E_TEMPLATE_CUSTOMER_ID_INVALID"/, 'code: "REMOVED"'],
    [/\[parsedCustomerId\.data, input\.operating_company_id\]/, "[customerId, input.operating_company_id]"],
    [/"dispatch\.load_template\.created"/, '"dispatch.load_template.removed"'],
    [/load_template_id: template\.id/, "load_template_id: null"],
  ];
  for (const [pattern, replacement] of serviceMutations) {
    const broken = service.replace(pattern, replacement);
    assert(broken !== service, `--selftest plant must mutate backend ${pattern}`);
    let failed = false;
    try { checkSource(original, broken); } catch { failed = true; }
    assert(failed, `--selftest expected FAIL for backend ${pattern}`);
  }
  check();
  console.log(`${LABEL}: OK — selftest PASS (${mutations.length + 1 + serviceMutations.length} mutations)`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
