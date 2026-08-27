#!/usr/bin/env node
import fs from "node:fs";
const routePath = new URL("../apps/backend/src/safety/rtd.routes.ts", import.meta.url);
const source = fs.readFileSync(routePath, "utf8");
function verify(text) {
  const marker = 'app.patch("/api/v1/safety/rtd/cases/:id"';
  const start = text.indexOf(marker);
  const block = start >= 0 ? text.slice(start) : "";
  const failures = [];
  if (!/const row = res\.rows\[0\];\s*if \(!row\) return null;\s*return enrichRtdCase\(row\);/m.test(block)) failures.push("RTD edit must reject a zero-row UPDATE before enrichment");
  if (!/if \(!updated\) return reply\.code\(404\)/m.test(block)) failures.push("RTD edit zero-row outcome must map to HTTP 404");
  return failures;
}
const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("if (!row) return null;\n      return enrichRtdCase(row);", "return enrichRtdCase(row);"),
    source.replace("return enrichRtdCase(row);\n    });\n\n    if (!updated) return reply.code(404)", "return enrichRtdCase(res.rows[0]);\n    });\n\n    if (!updated) return reply.code(404)"),
    source.replace('if (!updated) return reply.code(404).send({ error: "not_found", message: "RTD case not found." });', 'if (!updated) return reply.code(200).send({ updated: null });'),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length === 0);
  if (escaped.length) { console.error(`FAIL RTD edit zero-row selftest: ${escaped.length} mutation(s) escaped`); process.exit(1); }
  console.log(`PASS RTD edit zero-row selftest (${mutations.length} mutations rejected)`); process.exit(0);
}
if (failures.length) { failures.forEach((failure) => console.error(`FAIL ${failure}`)); process.exit(1); }
console.log("PASS RTD edit maps a zero-row lifecycle race to honest 404 before enrichment");
