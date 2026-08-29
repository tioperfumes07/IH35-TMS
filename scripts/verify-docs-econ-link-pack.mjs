#!/usr/bin/env node
/**
 * DOCS-ECON-01 / DOCS-LINK-01 — generated dispatch packets must be classified and linked at write time.
 * Run: node scripts/verify-docs-econ-link-pack.mjs [--selftest]
 */
import fs from "node:fs";

const LABEL = "verify-docs-econ-link-pack";
const WRITER = "apps/backend/src/dispatch/load-distribution.service.ts";
const ROUTES = "apps/backend/src/dispatch/loads.routes.ts";
const PAGE = "apps/frontend/src/pages/docs/DocsHomePage.tsx";

function inspect(writer, page, routes) {
  const problems = [];
  const categoryUses = writer.match(/code\s*=\s*'dispatch_instructions'/g)?.length ?? 0;
  if (categoryUses < 2) problems.push("both generated docs.files rows must resolve dispatch_instructions category_id");
  for (const required of [
    '[fileId, "load", load.id]',
    '[customerFileId, "load", load.id]',
    '[fileId, "driver", load.assigned_primary_driver_id]',
    '[customerFileId, "customer", load.customer_id]',
  ]) {
    if (!writer.includes(required)) problems.push(`missing generated document link: ${required}`);
  }
  if (!/INSERT INTO docs\.file_links[\s\S]*ON CONFLICT \(file_id, entity_type, entity_id\)/.test(writer)) {
    problems.push("writer must persist idempotent docs.file_links in the same transaction");
  }
  if (!/const loadLinkUpdate = await client\.query<\{ id: string \}>\([\s\S]{0,420}UPDATE mdata\.loads[\s\S]{0,240}AND operating_company_id = \$3::uuid[\s\S]{0,100}RETURNING id[\s\S]{0,180}input\.operating_company_id[\s\S]{0,160}if \(!loadLinkUpdate\.rows\[0\]\?\.id\) throw new Error\("E_LOAD_NOT_FOUND"\)/.test(writer)) {
    problems.push("driver instructions backlink must bind company and prove the canonical load row changed");
  }
  if (!/if \(!isR2Configured\(\)\) throw new Error\("r2_not_configured"\)/.test(writer)) {
    problems.push("distribution must fail closed instead of persisting uploaded docs when R2 is unavailable");
  }
  if (!/await putObjectBytes\(driverR2Key[\s\S]{0,120}uploadedR2Keys\.push\(driverR2Key\)[\s\S]{0,160}await putObjectBytes\(customerR2Key[\s\S]{0,120}uploadedR2Keys\.push\(customerR2Key\)/.test(writer)) {
    problems.push("distribution must track each successfully uploaded packet before the next lifecycle step");
  }
  if (!/const fileId = docsFile\.rows\[0\]\?\.id;[\s\S]{0,100}driver_instructions_document_create_failed/.test(writer) ||
      !/const customerFileId = customerFile\.rows\[0\]\?\.id;[\s\S]{0,100}customer_instructions_document_create_failed/.test(writer)) {
    problems.push("both generated document rows must prove canonical identity before links/delivery");
  }
  if ((writer.match(/enqueueAfterCommit\(client/g) ?? []).length < 2 || /distributionTasks\.push\(\s*sendEmail/.test(writer)) {
    problems.push("driver and customer emails must run only after the document transaction commits");
  }
  if (!/catch \(error\)[\s\S]{0,220}for \(const r2Key of uploadedR2Keys\)[\s\S]{0,180}await deleteObjectBytes\(r2Key\)[\s\S]{0,300}load_distribution_cleanup_failed:[\s\S]{0,140}throw error/.test(writer)) {
    problems.push("failed distribution must compensate every uploaded object and fail loud on cleanup loss");
  }
  if (!/message\.includes\("r2_not_configured"\)[\s\S]{0,240}message\.includes\("instructions_document_create_failed"\)[\s\S]{0,240}message\.includes\("load_distribution_cleanup_failed"\)[\s\S]{0,180}code\(503\)\.send\(\{ error: "instruction_distribution_unavailable" \}\)/.test(routes)) {
    problems.push("mounted distribution route must expose storage/persistence failure as typed retryable 503");
  }
  if (!/COALESCE\([\s\S]{0,100}?c\.customer_name,[\s\S]{0,160}?mdata\.resolve_customer_label_same_company\(l\.customer_id, l\.operating_company_id\)[\s\S]{0,60}?AS customer_name/.test(writer)) {
    problems.push("generated instructions must retain the same-company historical customer label after archive");
  }
  if (!/COALESCE\([\s\S]{0,160}?CONCAT_WS\(' ', d\.first_name, d\.last_name\)[\s\S]{0,180}?mdata\.resolve_driver_label_same_company\(l\.assigned_primary_driver_id, l\.operating_company_id\)[\s\S]{0,60}?AS driver_name/.test(writer)) {
    problems.push("generated instructions must retain the same-company historical assigned-driver label after archive");
  }
  if (!/links\.map\(\(link\)[\s\S]*<EntityLink[\s\S]*id=\{link\.entity_id\}/.test(page)) {
    problems.push("Docs Entity column must render every persisted link with EntityLink");
  }
  if (/label=\{`\$\{link\.entity_type\}`\}/.test(page) || /label=\{link\.entity_type\}/.test(page)) {
    problems.push("EntityLink must resolve the human label; entity_type is not a human entity label");
  }
  return problems;
}

function main() {
  const writer = fs.readFileSync(WRITER, "utf8");
  const page = fs.readFileSync(PAGE, "utf8");
  const routes = fs.readFileSync(ROUTES, "utf8");
  const problems = inspect(writer, page, routes);
  if (problems.length) {
    console.error(`${LABEL}: FAIL\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  if (process.argv.includes("--selftest")) {
    const mutations = [
      writer.replace("code = 'dispatch_instructions'", "code = 'other'"),
      writer.replace('[fileId, "driver", load.assigned_primary_driver_id]', '[fileId, "load", load.id]'),
      writer.replace("INSERT INTO docs.file_links", "INSERT INTO docs.missing_links"),
      writer.replace("AND operating_company_id = $3::uuid", "AND TRUE"),
      writer.replace("if (!loadLinkUpdate.rows[0]?.id)", "if (false)"),
      writer.replace('if (!isR2Configured()) throw new Error("r2_not_configured");', ""),
      writer.replace("uploadedR2Keys.push(customerR2Key);", ""),
      writer.replace('if (!fileId) throw new Error("driver_instructions_document_create_failed");', ""),
      writer.replace("enqueueAfterCommit(client", "runBeforeCommit(client"),
      writer.replace("await deleteObjectBytes(r2Key);", ""),
      writer.replace("mdata.resolve_customer_label_same_company(l.customer_id, l.operating_company_id)", "NULL"),
      writer.replace("mdata.resolve_driver_label_same_company(l.assigned_primary_driver_id, l.operating_company_id)", "NULL"),
    ];
    const detected = mutations.filter((mutant) => inspect(mutant, page, routes).length > 0).length;
    const pageMutant = page.replace("links.map((link)", "links.slice(0, 1).map((link)");
    const routeMutant = routes.replace('error: "instruction_distribution_unavailable"', 'error: "internal_error"');
    if (detected !== mutations.length || inspect(writer, pageMutant, routes).length === 0 || inspect(writer, page, routeMutant).length === 0) {
      console.error(`${LABEL}: selftest FAIL`);
      process.exit(1);
    }
    console.log(`${LABEL}: selftest 14/14`);
  }
  console.log(`${LABEL}: PASS`);
}

main();
