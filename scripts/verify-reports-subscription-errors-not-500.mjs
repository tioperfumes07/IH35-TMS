#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["error_states"],"leaves":["reports.scheduled.subscriptions_deactivate"]} */
/**
 * GAP43-SUBSCRIPTIONS-500-ON-EXPECTED-STATE: live-verified on prod that PATCH
 * /api/v1/reports/scheduled/subscriptions/:uuid/deactivate on an already-inactive subscription
 * returned HTTP 500 `{"message":"scheduled_subscription_not_found_or_already_inactive"}` — a plain
 * Error thrown by subscription.service.ts's deactivateSubscription()/updateSubscription() with no
 * try/catch at the route call site, so Fastify's default handler turned an ordinary business
 * condition (row already gone/inactive) into an uncaught Internal Server Error. The frontend surfaced
 * this as a generic "Deactivate failed" toast — indistinguishable from a real server fault, and the
 * stale row stayed labelled "Active" in the UI.
 *
 * Fix: both mutating routes in reports/scheduled/routes.ts now wrap their service call in try/catch
 * and map the two known service-layer error messages to the correct 4xx status
 * (already_inactive_or_not_found -> 409, not_found -> 404) via replyForSubscriptionError(); the
 * frontend's deactivate mutation treats a 409 as "stale list, refetch" rather than "failed".
 *
 * Self-test: node scripts/verify-reports-subscription-errors-not-500.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  routes: "apps/backend/src/reports/scheduled/routes.ts",
  panel: "apps/frontend/src/pages/reports/SubscriptionManager.tsx",
};
const LABEL = "verify-reports-subscription-errors-not-500";

export function audit(src) {
  const failures = [];

  if (!/function replyForSubscriptionError\(/.test(src.routes)) {
    failures.push(`${FILES.routes}: replyForSubscriptionError() helper is missing.`);
  }
  if (!/scheduled_subscription_not_found_or_already_inactive["']\)\s*\{\s*\n\s*return reply\.code\(409\)/.test(src.routes)) {
    failures.push(`${FILES.routes}: the "already inactive" service error must map to HTTP 409, not fall through to 500.`);
  }
  if (!/scheduled_subscription_not_found["']\)\s*\{\s*\n\s*return reply\.code\(404\)/.test(src.routes)) {
    failures.push(`${FILES.routes}: the "not found" service error must map to HTTP 404, not fall through to 500.`);
  }

  // Both the update (:uuid) and deactivate (:uuid/deactivate) route bodies must call the mapper --
  // scoped per-route so removing the wrapper from just one of the two is still caught.
  const updateRouteIdx = src.routes.indexOf('app.patch("/api/v1/reports/scheduled/subscriptions/:uuid"');
  const deactivateRouteIdx = src.routes.indexOf("/api/v1/reports/scheduled/subscriptions/:uuid/deactivate");
  if (updateRouteIdx === -1 || deactivateRouteIdx === -1) {
    failures.push(`${FILES.routes}: could not locate both the update and deactivate route registrations.`);
  } else {
    const updateBody = src.routes.slice(updateRouteIdx, deactivateRouteIdx);
    const deactivateBody = src.routes.slice(deactivateRouteIdx, deactivateRouteIdx + 800);
    if (!/catch \(error\) \{\s*\n\s*return replyForSubscriptionError\(reply, error\);/.test(updateBody)) {
      failures.push(`${FILES.routes}: the PATCH :uuid (update) route must catch and map service errors via replyForSubscriptionError.`);
    }
    if (!/catch \(error\) \{\s*\n\s*return replyForSubscriptionError\(reply, error\);/.test(deactivateBody)) {
      failures.push(`${FILES.routes}: the PATCH :uuid/deactivate route must catch and map service errors via replyForSubscriptionError.`);
    }
  }

  if (!/error instanceof ApiError && error\.status === 409/.test(src.panel)) {
    failures.push(`${FILES.panel}: deactivateMut's onError must special-case ApiError status 409 (already inactive) instead of always showing "Deactivate failed".`);
  }
  if (!/import \{ apiRequest, ApiError \}/.test(src.panel)) {
    failures.push(`${FILES.panel}: must import ApiError from "../../api/client" to distinguish a 409 from a real failure.`);
  }

  return failures;
}

function loadSrc(root) {
  const out = {};
  for (const [key, rel] of Object.entries(FILES)) out[key] = fs.readFileSync(path.join(root, rel), "utf8");
  return out;
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    { key: "routes", from: "function replyForSubscriptionError", to: "function replyForSubscriptionErrorRenamed" },
    { key: "routes", from: 'return reply.code(409).send({ error: "already_inactive_or_not_found" });', to: "throw error;" },
    { key: "routes", from: 'return reply.code(404).send({ error: "not_found" });', to: "throw error;" },
    {
      key: "routes",
      from: `      const row = await updateSubscription(
        params.data.uuid,
        query.data.operating_company_id,
        {
          cadence: body.data.cadence,
          dayOfWeek: body.data.day_of_week,
          dayOfMonth: body.data.day_of_month,
          timeOfDay: body.data.time_of_day,
          timezone: body.data.timezone,
          recipientEmails: body.data.recipient_emails,
          recipientUserUuids: body.data.recipient_user_uuids,
          deliveryFormat: body.data.delivery_format,
        },
        String(user.uuid)
      );
      return { row };
    } catch (error) {
      return replyForSubscriptionError(reply, error);
    }`,
      to: `      const row = await updateSubscription(
        params.data.uuid,
        query.data.operating_company_id,
        {
          cadence: body.data.cadence,
          dayOfWeek: body.data.day_of_week,
          dayOfMonth: body.data.day_of_month,
          timeOfDay: body.data.time_of_day,
          timezone: body.data.timezone,
          recipientEmails: body.data.recipient_emails,
          recipientUserUuids: body.data.recipient_user_uuids,
          deliveryFormat: body.data.delivery_format,
        },
        String(user.uuid)
      );
      return { row };`,
    },
    {
      key: "routes",
      from: `        await deactivateSubscription(params.data.uuid, query.data.operating_company_id, String(user.uuid));
        return reply.code(204).send();
      } catch (error) {
        return replyForSubscriptionError(reply, error);
      }`,
      to: `        await deactivateSubscription(params.data.uuid, query.data.operating_company_id, String(user.uuid));
        return reply.code(204).send();`,
    },
    { key: "panel", from: "error instanceof ApiError && error.status === 409", to: "false" },
    { key: "panel", from: "apiRequest, ApiError", to: "apiRequest" },
  ];
  let detected = 0;
  for (const m of mutations) {
    const mutated = good[m.key].split(m.from).join(m.to);
    if (mutated === good[m.key]) {
      console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor: ${JSON.stringify(m.from.slice(0, 60))}`);
      process.exit(1);
    }
    const mutatedSrc = { ...good, [m.key]: mutated };
    if (audit(mutatedSrc).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${JSON.stringify(m.from.slice(0, 60))}`);
      process.exit(1);
    }
    detected += 1;
  }
  console.log(`${LABEL} SELFTEST PASS — ${detected} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — scheduled-subscription update/deactivate map expected-state errors to 4xx, not 500`);
