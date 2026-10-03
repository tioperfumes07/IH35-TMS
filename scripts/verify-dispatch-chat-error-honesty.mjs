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
  if (source.includes("text-[11px]")) errors.push("leftover text-[11px]");
  if (source.includes("#8A92AB") || source.includes("#334155")) errors.push("leftover off-scale muted");
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
  const leftoverPlant = `${good}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`;
  if (!failures(leftoverPlant).length) throw new Error(`${LABEL}: leftover plant escaped`);
  const live = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const liveErrors = failures(live);
  if (liveErrors.length) throw new Error(`${LABEL}: live leftover/honesty fail: ${liveErrors.join("; ")}`);
  console.log(`${LABEL}: selftest PASS (${mutations.length + 1} mutations caught)`);
} else {
  const errors = failures(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (errors.length) throw new Error(`${LABEL}: ${errors.join("; ")}`);
  console.log(`${LABEL}: PASS`);
}
