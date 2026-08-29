#!/usr/bin/env node
/**
 * GO-0034-TASKS-CROSS-TENANT-IDOR
 *
 * Every route in apps/backend/src/tasks/task.routes.ts took `operating_company_id` from the
 * client (query/body) and used it directly to set the RLS scope GUCs via SET_TASK_SCOPE_SQL --
 * with NO check that the caller actually belongs to that company (tasks.task itself has no RLS
 * at all, so this was the ONLY gate). Any authenticated user of any company could read/write any
 * other company's tasks/comments/links/activity by naming a different operating_company_id.
 *
 * Fix: every handler now calls assertTaskCompanyMembership(reply, user.uuid, <opco>) and returns
 * early on failure, BEFORE its first SET_TASK_SCOPE_SQL use. This guard fails if a route handler
 * uses SET_TASK_SCOPE_SQL without an assertTaskCompanyMembership(...) call appearing earlier in
 * the same handler body -- catching a future route that forgets the check, not just today's 13.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/tasks/task.routes.ts";
const LABEL = "verify-tasks-membership-check-before-scope";

// Split the file into route-handler bodies by top-level `fastify.<method>(` registrations
// (each handler runs from one registration to the next, or EOF for the last one).
function splitIntoHandlers(text) {
  const registrationRe = /fastify\.(get|post|patch|put|delete)\(/g;
  const starts = [];
  let m;
  while ((m = registrationRe.exec(text))) starts.push(m.index);
  const handlers = [];
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    handlers.push(text.slice(starts[i], end));
  }
  return handlers;
}

export function check(text) {
  const failures = [];
  const handlers = splitIntoHandlers(text);
  for (const handler of handlers) {
    if (!handler.includes("SET_TASK_SCOPE_SQL")) continue; // handler doesn't touch tasks scope at all
    const scopeIdx = handler.indexOf("SET_TASK_SCOPE_SQL");
    const membershipIdx = handler.indexOf("assertTaskCompanyMembership(");
    const routeLabel = handler.slice(0, handler.indexOf(")") + 1).replace(/\s+/g, " ").slice(0, 60);
    if (membershipIdx === -1) {
      failures.push(`${FILE}: handler "${routeLabel}" uses SET_TASK_SCOPE_SQL with no assertTaskCompanyMembership(...) call at all`);
    } else if (membershipIdx > scopeIdx) {
      failures.push(`${FILE}: handler "${routeLabel}" calls assertTaskCompanyMembership(...) AFTER SET_TASK_SCOPE_SQL, not before`);
    }
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const handlerCount = splitIntoHandlers(text).length;
  const failures = check(text);
  if (handlerCount < 10) {
    failures.push(`${FILE}: expected at least 10 route handlers, found ${handlerCount} -- splitter may be broken`);
  }
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — every tasks route checks company membership before setting RLS scope`);
}

function selftest() {
  const good = `
export default async function taskRoutes(fastify) {
  fastify.get("/", async (request, reply) => {
    const input = parsed.data;
    if (!(await assertTaskCompanyMembership(reply, user.uuid, input.operating_company_id))) return;
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(SET_TASK_SCOPE_SQL, [input.operating_company_id]);
    });
  });
  fastify.post("/", async (request, reply) => {
    const input = parsed.data;
    if (!(await assertTaskCompanyMembership(reply, user.uuid, input.operating_company_id))) return;
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(SET_TASK_SCOPE_SQL, [input.operating_company_id]);
    });
  });
}
`;
  if (check(good).length) throw new Error(`PASS fail: ${JSON.stringify(check(good))}`);

  const missingCheck = `
export default async function taskRoutes(fastify) {
  fastify.get("/", async (request, reply) => {
    const input = parsed.data;
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(SET_TASK_SCOPE_SQL, [input.operating_company_id]);
    });
  });
  fastify.post("/", async (request, reply) => {
    const input = parsed.data;
    if (!(await assertTaskCompanyMembership(reply, user.uuid, input.operating_company_id))) return;
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(SET_TASK_SCOPE_SQL, [input.operating_company_id]);
    });
  });
}
`;
  if (!check(missingCheck).length) throw new Error("FAIL fail: a route missing the membership check entirely should have been caught");

  const wrongOrder = `
export default async function taskRoutes(fastify) {
  fastify.get("/", async (request, reply) => {
    const input = parsed.data;
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(SET_TASK_SCOPE_SQL, [input.operating_company_id]);
      if (!(await assertTaskCompanyMembership(reply, user.uuid, input.operating_company_id))) return;
    });
  });
  fastify.post("/", async (request, reply) => {
    const input = parsed.data;
    if (!(await assertTaskCompanyMembership(reply, user.uuid, input.operating_company_id))) return;
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(SET_TASK_SCOPE_SQL, [input.operating_company_id]);
    });
  });
}
`;
  if (!check(wrongOrder).length) throw new Error("FAIL fail: a route checking membership AFTER setting scope should have been caught");

  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
