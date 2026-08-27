#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/routes/safety/complaints.ts", "utf8");
function verify(text) {
  const create = text.slice(text.indexOf('app.post("/api/v1/safety/complaints"'), text.indexOf('app.patch("/api/v1/safety/complaints/:id"'));
  const failures = [];
  if (!/rateLimit: \{ max: 60, timeWindow: "1 minute" \}/.test(create)) failures.push("creator must be rate limited");
  if ((create.match(/d\.archived_at IS NULL/g) ?? []).length !== 2) failures.push("both driver roles must reject archived drivers");
  if (!/cardinality\(\$8::uuid\[\]\)[\s\S]*?FROM docs\.files f[\s\S]*?f\.operating_company_id = \$1::uuid[\s\S]*?f\.deleted_at IS NULL/.test(create)) failures.push("all evidence docs must be active and company scoped");
  if (!/body\.data\.evidence_doc_ids \?\? \[\]/.test(create)) failures.push("evidence ids must bind to linkage validation");
  if (!/if \(!row\?\.id\) throw new Error\("safety_complaint_insert_failed"\)/.test(create)) failures.push("creator must require inserted identity");
  if (!/complaint_id: row\.id/.test(create)) failures.push("audit must use proven identity");
  return failures;
}
const failures = verify(source);
if (failures.length) { console.error(`verify-safety-complaint-create-linkage-truth: FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('app.post("/api/v1/safety/complaints", { config: { rateLimit: { max: 60', 'app.post("/api/v1/safety/complaints", { config: { rateLimit: { max: 0'),
    source.replace("AND d.archived_at IS NULL", "AND true"),
    source.replace(/AND d\.archived_at IS NULL/g, (match, offset) => offset === source.indexOf("AND d.archived_at IS NULL") ? match : "AND true"),
    source.replace("FROM docs.files f", "FROM docs.files_missing f"),
    source.replace("f.operating_company_id = $1::uuid", "true"),
    source.replace("if (!row?.id)", "if (false)"),
    source.replace("complaint_id: row.id", "complaint_id: null"),
  ];
  const survived = mutations.filter((mutation) => verify(mutation).length === 0);
  if (survived.length) { console.error(`verify-safety-complaint-create-linkage-truth --selftest: FAIL; ${survived.length} mutation(s) survived`); process.exit(1); }
  console.log("verify-safety-complaint-create-linkage-truth --selftest: PASS (7/7 mutations red)");
} else console.log("verify-safety-complaint-create-linkage-truth: PASS — creator validates active drivers/docs and requires its inserted audit identity");
