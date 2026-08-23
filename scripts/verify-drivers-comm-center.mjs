#!/usr/bin/env node
/**
 * Block A24-10: Driver communication center (office inbox + PWA + SMS/email bridge).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  messagesRoutes: path.join(ROOT, "apps/backend/src/drivers/messages.routes.ts"),
  messagesService: path.join(ROOT, "apps/backend/src/drivers/messages.service.ts"),
  profileCommunicationsService: path.join(ROOT, "apps/backend/src/drivers/communications.service.ts"),
  smsBridge: path.join(ROOT, "apps/backend/src/notifications/sms-bridge.service.ts"),
  inboxPage: path.join(ROOT, "apps/frontend/src/pages/drivers/MessagesInboxPage.tsx"),
  pwaMessages: path.join(ROOT, "apps/driver-pwa/src/pages/Messages.tsx"),
  migration: path.join(ROOT, "db/migrations/0349_driver_comm_inbox.sql"),
  backendTest: path.join(ROOT, "apps/backend/src/drivers/__tests__/messages.routes.test.ts"),
  frontendTest: path.join(ROOT, "apps/frontend/src/pages/drivers/__tests__/MessagesInboxPage.test.tsx"),
  pwaTest: path.join(ROOT, "apps/driver-pwa/src/pages/__tests__/Messages.test.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-comm-center] ${msg}`);
  process.exit(1);
}

function verifySharedDriverMessaging(messagesRoutes, messagesService, profileCommunicationsService) {
  const aliases = ["select_dca", "inbox_dca", "read_dca", "delivery_dca"];
  const failures = [];
  for (const alias of aliases) {
    for (const needle of [
      `mdata.driver_company_authorizations ${alias}`,
      `${alias}.driver_id = d.id`,
      `${alias}.is_authorized = true`,
      `${alias}.deactivated_at IS NULL`,
    ]) {
      if (!messagesService.includes(needle)) failures.push(`shared-driver messaging missing ${needle}`);
    }
  }
  for (const needle of [
    "select_dca.company_id = m.operating_company_id",
    "inbox_dca.company_id = $1::uuid",
    "read_dca.company_id = $2::uuid",
    "delivery_dca.company_id = $2::uuid",
  ]) {
    if (!messagesService.includes(needle)) failures.push(`shared-driver messaging missing ${needle}`);
  }
  for (const needle of [
    "withCurrentUser, withLuciaBypass",
    'app.get("/api/v1/driver/messages"',
    "withLuciaBypass(async (client)",
    "listDriverPwaMessages(client as Queryable, driver.id)",
    "{ actorUserId: req.user!.uuid }",
  ]) {
    if (!messagesRoutes.includes(needle)) failures.push(`driver PWA shared-company read missing ${needle}`);
  }
  const pwaRoute = messagesRoutes.slice(
    messagesRoutes.indexOf('app.get("/api/v1/driver/messages"'),
    messagesRoutes.indexOf('app.post("/api/v1/driver/messages"')
  );
  if (pwaRoute.includes("set_config('app.operating_company_id'")) {
    failures.push("driver PWA shared-company read must not collapse the inbox to the home-company GUC");
  }
  for (const needle of [
    "mdata.driver_company_authorizations profile_dca",
    "profile_dca.driver_id = d.id",
    "profile_dca.company_id = m.operating_company_id",
    "profile_dca.is_authorized = true",
    "profile_dca.deactivated_at IS NULL",
  ]) {
    if (!profileCommunicationsService.includes(needle)) failures.push(`profile communications missing ${needle}`);
  }
  return failures;
}

function main() {
  const messagesRoutes = read(paths.messagesRoutes);
  const messagesService = read(paths.messagesService);
  const profileCommunicationsService = read(paths.profileCommunicationsService);
  const smsBridge = read(paths.smsBridge);
  const inboxPage = read(paths.inboxPage);
  const pwaMessages = read(paths.pwaMessages);
  const migration = read(paths.migration);
  const backendTest = read(paths.backendTest);
  const frontendTest = read(paths.frontendTest);
  const pwaTest = read(paths.pwaTest);
  const manifest = read(paths.manifest);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!messagesRoutes.includes("/api/v1/drivers/messages/inbox")) failures.push("Office inbox route required");
  if (!messagesRoutes.includes("/api/v1/driver/messages")) failures.push("Driver PWA messages route required");
  if (!messagesService.includes("deliverDriverProfileMessage")) failures.push("Delivery bridge service required");
  failures.push(...verifySharedDriverMessaging(messagesRoutes, messagesService, profileCommunicationsService));
  if (!smsBridge.includes("bridgeDriverSms")) failures.push("SMS bridge service required");
  if (!inboxPage.includes("MessagesInboxPage")) failures.push("Office inbox page required");
  if (!inboxPage.includes('EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver"')) {
    failures.push("Inbox conversation list must drill driver identity (EntityLinkOrTombstone)");
  }
  if (!inboxPage.includes('EntityLinkOrTombstone kind="driver" id={driverId} name={driverName} noun="Driver"')) {
    failures.push("Inbox thread heading must drill driver identity");
  }
  if (!pwaMessages.includes("MessagesPage")) failures.push("PWA messages page required");
  if (!migration.includes("read_at")) failures.push("Migration must add read_at");
  if (!manifest.includes("/drivers/messages")) failures.push("Frontend route /drivers/messages required");
  if (!backendTest.includes("A24-10")) failures.push("Backend vitest must reference A24-10");
  if (!frontendTest.includes("A24-10")) failures.push("Frontend vitest must reference A24-10");
  if (!pwaTest.includes("A24-10")) failures.push("PWA vitest must reference A24-10");

  if (!archDesign.includes("verify:drivers-comm-center")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-comm-center");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  if (process.argv.includes("--selftest")) {
    const aliases = ["select_dca", "inbox_dca", "read_dca", "delivery_dca"];
    const mutations = aliases.map((alias) => ({ routes: messagesRoutes, messages: messagesService.replace(`${alias}.is_authorized = true`, `${alias}.is_authorized = false`), profile: profileCommunicationsService }));
    mutations.push({ routes: messagesRoutes, messages: messagesService, profile: profileCommunicationsService.replace("profile_dca.is_authorized = true", "profile_dca.is_authorized = false") });
    mutations.push({ routes: messagesRoutes.replace("withLuciaBypass(async (client)", "withCurrentUser(req.user!.uuid, async (client)"), messages: messagesService, profile: profileCommunicationsService });
    mutations.push({ routes: messagesRoutes.replace("listDriverPwaMessages(client as Queryable, driver.id)", "listDriverPwaMessages(client as Queryable, req.user!.uuid)"), messages: messagesService, profile: profileCommunicationsService });
    const escaped = mutations.filter(({ routes, messages, profile }) => verifySharedDriverMessaging(routes, messages, profile).length === 0);
    if (escaped.length > 0) fail(`SELFTEST: ${escaped.length}/${mutations.length} shared-driver mutations escaped`);
    console.log(`[verify-drivers-comm-center] SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  }

  console.log("[verify-drivers-comm-center] OK");
}

main();
