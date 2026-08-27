#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/maintenance/road-service/tickets.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const route = candidate.slice(candidate.indexOf('/api/v1/road-service-tickets"'));
  const checks = [
    ["creator limiter", /road-service-tickets"[\s\S]{0,160}rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/],
    ["insert returns canonical row", /INSERT INTO maintenance\.road_service_tickets[\s\S]{0,900}RETURNING \*/],
    ["insert identity failure truth", /const ticket = res\.rows\[0\];\s*if \(!ticket\?\.id\) throw new Error\("road_service_ticket_insert_failed"\)/],
    ["audit uses proven identity", /resource_id: String\(ticket\.id\)/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-road-service-ticket-create-result FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['{ config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },', ""],
    ['if (!ticket?.id) throw new Error("road_service_ticket_insert_failed");', ""],
    ["resource_id: String(ticket.id)", 'resource_id: String(ticket?.id ?? "")'],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-road-service-ticket-create-result selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-road-service-ticket-create-result --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-road-service-ticket-create-result PASS — create requires a canonical ticket before audit/201");
