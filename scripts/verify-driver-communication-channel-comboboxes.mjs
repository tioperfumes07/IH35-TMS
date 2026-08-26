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
  console.log("verify-driver-communication-channel-comboboxes --selftest PASS");
  process.exit(0);
}

assertContract({
  timeline: process.env.DRIVER_F6480_TIMELINE ?? disk.timeline,
  send: process.env.DRIVER_F6480_SEND ?? disk.send,
});
console.log("verify-driver-communication-channel-comboboxes PASS — timeline + send channel controls preserve query/payload wiring");
