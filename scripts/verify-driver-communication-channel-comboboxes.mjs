#!/usr/bin/env node
/** DRIVER-F6480 — Driver communication channel controls share canonical Combobox chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  timeline: "apps/frontend/src/components/drivers/DriverCommunicationsTab.tsx",
  send: "apps/frontend/src/components/drivers/SendMessageModal.tsx",
};
const disk = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

function assertContract(source) {
  for (const [key, text] of Object.entries(source)) {
    if (/<select\b/.test(text)) throw new Error(`native channel select returned to ${key}`);
  }
  for (const [key, id] of [["timeline", "driver-communications-channel"], ["send", "send-message-channel"]]) {
    if (!source[key].includes(`htmlFor="${id}"`) || !source[key].includes(`id="${id}"`)) {
      throw new Error(`missing associated ${key} channel Combobox`);
    }
  }
  for (const token of [
    'onChange={(next) => handleChannelChange(next ?? "")}',
    'setPage(0)',
    'channel: channel || undefined',
  ]) if (!source.timeline.includes(token)) throw new Error(`missing timeline channel contract: ${token}`);
  for (const token of [
    'onChange={(next) => next && setChannel(next as typeof channel)}',
    'message: message.trim(),\n        channel,',
    '{ value: "in_app", label: "In-app" }',
    '{ value: "sms", label: "SMS" }',
    '{ value: "email", label: "Email" }',
  ]) if (!source.send.includes(token)) throw new Error(`missing send channel contract: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = {
    ...disk,
    send: disk.send.replace('message: message.trim(),\n        channel,', 'message: message.trim(),\n        channel: "email",'),
  };
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, DRIVER_F6480_TIMELINE: planted.timeline, DRIVER_F6480_SEND: planted.send },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted send-channel payload miswire stayed green");
  // BANK-F91296 leftover plant — DriverCommunicationsTab page-scoped text token ratchet
  const leftoverPlant = '<div className="text-[11px] text-[#8A92AB]">plant</div>';
  const leftoverHits = [];
  if (leftoverPlant.includes("text-[11px]")) leftoverHits.push(`${FILES.timeline}: leftover text-[11px]`);
  if (leftoverPlant.includes("#8A92AB") || leftoverPlant.includes("#334155")) leftoverHits.push(`${FILES.timeline}: leftover off-scale muted`);
  if (!leftoverHits.some((e) => e.includes("leftover text-[11px]")) || !leftoverHits.some((e) => e.includes("leftover off-scale muted"))) {
    throw new Error(`leftover plant escaped: ${JSON.stringify(leftoverHits)}`);
  }
  console.log("verify-driver-communication-channel-comboboxes --selftest PASS");
  process.exit(0);
}

assertContract({
  timeline: process.env.DRIVER_F6480_TIMELINE ?? disk.timeline,
  send: process.env.DRIVER_F6480_SEND ?? disk.send,
});
// BANK-F91296 leftover refuse — DriverCommunicationsTab.tsx page-scoped text token ratchet
const timelineSrc = process.env.DRIVER_F6480_TIMELINE ?? disk.timeline;
const leftover = [];
if (timelineSrc.includes("text-[11px]")) leftover.push(`${FILES.timeline}: leftover text-[11px]`);
if (timelineSrc.includes("#8A92AB") || timelineSrc.includes("#334155")) leftover.push(`${FILES.timeline}: leftover off-scale muted`);
if (leftover.length) {
  console.error("verify-driver-communication-channel-comboboxes FAIL leftover:\n  " + leftover.join("\n  "));
  process.exit(1);
}
console.log("verify-driver-communication-channel-comboboxes PASS — timeline + send channel controls preserve query/payload wiring");
