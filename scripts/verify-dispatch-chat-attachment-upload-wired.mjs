#!/usr/bin/env node
/**
 * verify-dispatch-chat-attachment-upload-wired — 0441-mod4-dispatch-chat-no-attachment-upload
 *
 * Fails if photo/document msg_types exist but the composer has no real upload path
 * (file input + uploadChatAttachment / attachments/presign+commit).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-chat-attachment-upload-wired";
const PAGE = "apps/frontend/src/pages/chat/DispatchChatPage.tsx";
const API = "apps/frontend/src/api/chat.ts";
const ROUTES = "apps/backend/src/chat/chat.routes.ts";
const SERVICE = "apps/backend/src/chat/chat.service.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function assertWired({ page, api, routes, service }) {
  const errors = [];
  if (!page) errors.push(`missing ${PAGE}`);
  if (!api) errors.push(`missing ${API}`);
  if (!routes) errors.push(`missing ${ROUTES}`);
  if (!service) errors.push(`missing ${SERVICE}`);
  if (errors.length) return errors;

  if (!/msg_type.*photo|photo.*document/.test(api) && !/"photo"/.test(api)) {
    errors.push(`${API}: ChatMessage must include photo/document msg_types`);
  }
  if (!/type="file"/.test(page) && !/type=\{\s*["']file["']\s*\}/.test(page)) {
    errors.push(`${PAGE}: composer must expose a file <input>`);
  }
  if (!/uploadChatAttachment|presignChatAttachment/.test(page)) {
    errors.push(`${PAGE}: composer must call uploadChatAttachment (or presignChatAttachment)`);
  }
  if (!/uploadChatAttachment|\/api\/v1\/chat\/attachments\/presign/.test(api)) {
    errors.push(`${API}: must expose uploadChatAttachment / attachments/presign client`);
  }
  if (!/\/api\/v1\/chat\/attachments\/presign/.test(routes)) {
    errors.push(`${ROUTES}: missing POST /api/v1/chat/attachments/presign`);
  }
  if (!/\/api\/v1\/chat\/attachments\/commit/.test(routes)) {
    errors.push(`${ROUTES}: missing POST /api/v1/chat/attachments/commit`);
  }
  if (!/commitAttachment/.test(service) || !/INSERT\s+INTO\s+chat\.attachments/i.test(service)) {
    errors.push(`${SERVICE}: commitAttachment must INSERT INTO chat.attachments`);
  }
  if (!/uploadFileToR2/.test(api)) {
    errors.push(`${API}: must reuse uploadFileToR2 (existing docs/R2 PUT helper)`);
  }
  return errors;
}

function selftest() {
  const good = {
    page: `type="file" uploadChatAttachment(companyId, activeThreadId, file)`,
    api: `msg_type photo document uploadChatAttachment presign /api/v1/chat/attachments/presign uploadFileToR2`,
    routes: `app.post("/api/v1/chat/attachments/presign" app.post("/api/v1/chat/attachments/commit"`,
    service: `export async function commitAttachment INSERT INTO chat.attachments`,
  };
  const bad = {
    page: `textarea Send confirmation`,
    api: `msg_type: "text" | "photo" | "document"`,
    routes: `app.post("/api/v1/chat/attachments/presign"`,
    service: `attachmentR2Key`,
  };
  if (assertWired(good).length) {
    console.error(`${LABEL} SELFTEST FAILED — good fixture rejected`);
    process.exit(1);
  }
  if (!assertWired(bad).length) {
    console.error(`${LABEL} SELFTEST FAILED — bad fixture accepted`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = assertWired({
    page: read(PAGE),
    api: read(API),
    routes: read(ROUTES),
    service: read(SERVICE),
  });
  if (errors.length) {
    console.error(`${LABEL} — FAILED`);
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK (composer file input + uploadChatAttachment + presign/commit + chat.attachments INSERT)`);
}

main();
