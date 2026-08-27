#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/safety/medical-cards.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const route = candidate.slice(candidate.indexOf('/api/v1/safety/medical-cards"'));
  const checks = [
    ["write limiter", /app\.post\("\/api\/v1\/safety\/medical-cards", RL_WRITE/],
    ["company driver", /FROM mdata\.drivers d[\s\S]{0,180}d\.operating_company_id = \$2::uuid[\s\S]{0,380}medical_card_create_driver_dca\.is_authorized = true[\s\S]{0,160}deactivated_at IS NULL/],
    ["insert identity", /const card = res\.rows\[0\][\s\S]{0,100}if \(!card\?\.id\) throw new Error\("safety_medical_card_insert_failed"\)/],
    ["audit identity", /"safety\.medical_card\.created"[\s\S]{0,180}resource_id: card\.id[\s\S]{0,160}operating_company_id: company\.data\.operating_company_id[\s\S]{0,100}driver_id: body\.data\.driver_id/],
    ["proven result", /return card;[\s\S]{0,240}reply\.code\(201\)\.send\(created\)/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-safety-medical-card-create-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['app.post("/api/v1/safety/medical-cards", RL_WRITE', 'app.post("/api/v1/safety/medical-cards", {}'],
    ["medical_card_create_driver_dca.is_authorized = true", "TRUE"],
    ['if (!card?.id) throw new Error("safety_medical_card_insert_failed");', ""],
    ["resource_id: card.id", "resource_id: null"],
    ["return card;", "return res.rows[0];"],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-safety-medical-card-create-truth selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-safety-medical-card-create-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-safety-medical-card-create-truth PASS — authorized driver and persisted card identity are distinct, proven gates");
