#!/usr/bin/env node
/**
 * ROUND 313 E-13: Samsara's webhook URL carries no ?operating_company_id= (one webhook per Samsara org), so a route
 * that REQUIRES it rejects every delivery (0 rows ever). Fails if the query param becomes required again, if the
 * tenant fallback (payload orgId -> samsara_config, else the one enabled config) disappears, or if anything is
 * persisted before the signature verifies.
 */
import { readFileSync } from "node:fs";
const s = readFileSync("apps/backend/src/integrations/samsara/samsara-webhook.routes.ts", "utf8");
const fails = [];
if (!/operating_company_id: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s)) fails.push("operating_company_id must be optional on the webhook route");
if (!/async function resolveWebhookCompany\(/.test(s) || !/samsara_org_id === orgId/.test(s)) fails.push("tenant must resolve from payload orgId / the single enabled config");
const verifyAt = s.indexOf("verifySamsaraWebhookSignature(\n") >= 0 ? s.indexOf("verifySamsaraWebhookSignature(\n") : s.indexOf("verifySamsaraWebhookSignature(");
const insertAt = s.indexOf("INSERT INTO integrations.samsara_webhook_events");
if (verifyAt < 0 || insertAt < 0 || insertAt < verifyAt) fails.push("signature must be verified before any insert");
if (fails.length) { console.error("verify-samsara-webhook-tenant-resolution: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-samsara-webhook-tenant-resolution: OK");
