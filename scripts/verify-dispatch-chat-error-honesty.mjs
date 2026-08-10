#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/chat/DispatchChatPage.tsx";
const LABEL = "verify-dispatch-chat-error-honesty";

function failures(source) {
  const errors = [];
  for (const needle of [
    "threads.length === 0 && !threadsQuery.isError",
    'userFacingApiError(messagesQuery.error, "Failed to load chat messages")',
    "onRetry={() => void messagesQuery.refetch()}",
    "messages.length === 0 && !messagesQuery.isError",
  ]) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = `threads.length === 0 && !threadsQuery.isError
    userFacingApiError(messagesQuery.error, "Failed to load chat messages")
    onRetry={() => void messagesQuery.refetch()}
    messages.length === 0 && !messagesQuery.isError`;
  if (failures(good).length) throw new Error(`${LABEL}: good fixture failed`);
  const mutations = [
    "threads.length === 0 && !threadsQuery.isError",
    'userFacingApiError(messagesQuery.error, "Failed to load chat messages")',
    "onRetry={() => void messagesQuery.refetch()}",
    "messages.length === 0 && !messagesQuery.isError",
  ];
  for (const mutation of mutations) {
    if (!failures(good.replace(mutation, "MUTATED")).length) throw new Error(`${LABEL}: mutation survived: ${mutation}`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length} mutations caught)`);
} else {
  const errors = failures(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (errors.length) throw new Error(`${LABEL}: ${errors.join("; ")}`);
  console.log(`${LABEL}: PASS`);
}
