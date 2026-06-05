#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PWA_SRC = path.join(ROOT, "apps/driver-pwa/src");
const EN_PATH = path.join(PWA_SRC, "i18n/en.json");
const ES_PATH = path.join(PWA_SRC, "i18n/es.json");

const SCAN_DIRS = [
  path.join(PWA_SRC, "pages"),
  path.join(PWA_SRC, "components"),
];

const ALLOWED_LITERAL_PROPS = new Set([
  "className",
  "data-testid",
  "type",
  "variant",
  "key",
  "to",
  "href",
  "id",
  "name",
  "role",
  "inputMode",
  "capture",
  "accept",
  "rel",
  "target",
  "style",
  "alt",
  "htmlFor",
  "autoComplete",
  "method",
  "encType",
  "aria-busy",
  "aria-label",
]);

const ALLOWED_STRING_PATTERNS = [
  /^#[0-9a-fA-F]{3,8}$/,
  /^\/[\w/-]*$/,
  /^\+\d+$/,
  /^\([0-9]{3}\)/,
  /^[0-9]+$/,
  /^[a-z_]+$/,
  /^[A-Z_]+$/,
  /^[✓✔→←▴▾…]+$/,
  /^https?:\/\//,
  /^data:/,
  /^application\//,
  /^image\//,
  /^text\//,
  /^min-h-/,
  /^flex-/,
  /^bg-/,
  /^border-/,
  /^text-/,
  /^rounded/,
  /^w-/,
  /^h-/,
  /^px-/,
  /^py-/,
  /^mt-/,
  /^mb-/,
  /^gap-/,
  /^grid-/,
  /^space-/,
  /^inline-/,
  /^block/,
  /^hidden/,
  /^fixed/,
  /^absolute/,
  /^relative/,
  /^uppercase/,
  /^font-/,
  /^tracking-/,
  /^object-/,
  /^max-/,
  /^min-/,
  /^truncate/,
  /^opacity-/,
  /^disabled:/,
  /^hover:/,
  /^focus:/,
  /^\(\d{3}\)/,
  /^driver@/,
  /^conductor@/,
  /^load-/,
  /^pwa-/,
  /^storage\./,
  /^en$/,
  /^es$/,
  /^\+ Upload$/,
  /^\[IMG\]/,
  /^\[FILE\]/,
  /^Preview - /,
  /^📦 /,
  /^IH 35/,
  /^IH35/,
  /^—$/,
  /^-$/,
  /^·$/,
  /^\/$/,
  /^\\n$/,
  /^\\t$/,
  /^%$/,
  /^mi$/,
  /^KB$/,
  /^USD$/,
  /^SMS$/,
  /^WhatsApp$/,
  /^Google$/,
  /^VIN$/,
  /^BOL$/,
  /^POD$/,
  /^HOS$/,
  /^EN$/,
  /^ES$/,
  /^DVIR$/,
  /^ACCEPT$/,
  /^ONLINE$/,
  /^OFFLINE$/,
  /^CONNECTING$/,
  /^UPLOADING$/,
  /^FAILED$/,
  /^SYNCED$/,
  /^QUEUED$/,
  /^Unit \d+$/,
  /^\(\d{3}\) \*\*\*-\*\*\d{2}$/,
  /^6-digit code$/,
  /^\(\d{3}\) \d{3}-\d{4}$/,
  /^\+ Upload Document$/,
  /^Preview$/,
  /^delivered$/,
  /^invoiced$/,
  /^factored$/,
  /^paid$/,
  /^pass$/,
  /^minor$/,
  /^major$/,
  /^open$/,
  /^under_review$/,
  /^resolved_in_favor$/,
  /^partially_resolved$/,
  /^withdrawn$/,
  /^whatsapp$/,
  /^sms$/,
  /^office$/,
  /^driver$/,
  /^\+1$/,
  /^\+52$/,
  /^US \(\+1\)$/,
  /^Mexico \(\+52\)$/,
  /^\(\d{3}\) \d{3}-\d{4}$/,
  /^Synced: /,
  /^Upload failed: /,
  /^Reason for rejection/,
  /^Equipment transfer pending/,
  /^No location provided$/,
  /^Driver$/,
  /^Checking session\.\.\.$/,
  /^Loading\.\.\.$/,
];

function fail(message) {
  console.error(`verify:driver-pwa-i18n-coverage FAIL: ${message}`);
  process.exit(1);
}

function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, next));
    } else {
      keys.push(next);
    }
  }
  return keys;
}

function loadJson(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) fail(`missing ${relPath}`);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function walkTsxFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      walkTsxFiles(full, acc);
      continue;
    }
    if (!entry.name.endsWith(".tsx")) continue;
    if (entry.name.endsWith(".test.tsx")) continue;
    acc.push(full);
  }
  return acc;
}

function extractTranslationKeys(source) {
  const keys = new Set();
  const patterns = [
    /\bt\(\s*["'`]([^"'`${}]+)["'`]/g,
    /\bi18n\.t\(\s*["'`]([^"'`${}]+)["'`]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      keys.add(match[1]);
    }
  }
  return keys;
}

function isAllowedLiteral(value) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.includes("${") || trimmed.includes("{")) return true;
  if (trimmed.includes("t(") || trimmed.includes("i18n.")) return true;
  if (/^[^A-Za-z]/.test(trimmed)) return true;
  if (trimmed.length <= 2) return true;
  if (ALLOWED_STRING_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (/^\d/.test(trimmed)) return true;
  if (/^[A-Z0-9_ -]+$/.test(trimmed) && trimmed.length <= 12) return true;
  return false;
}

function findHardcodedEnglish(source, filePath) {
  const findings = [];
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const match of withoutComments.matchAll(/\b(title|subtitle|placeholder|label)=\{?\s*["'`]([^"'`]+)["'`]/g)) {
    const prop = match[1];
    const text = match[2];
    if (ALLOWED_LITERAL_PROPS.has(prop)) continue;
    if (isAllowedLiteral(text)) continue;
    findings.push({ filePath, text, kind: `prop:${prop}` });
  }

  for (const line of withoutComments.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.includes("<") || trimmed.includes("{") || trimmed.includes("t(")) continue;
    const textMatch = trimmed.match(/>\s*([A-Za-z][A-Za-z0-9 ,.'!?\-—–…:;()/]+)\s*<\//);
    if (!textMatch) continue;
    const text = textMatch[1].trim();
    if (isAllowedLiteral(text)) continue;
    findings.push({ filePath, text, kind: "jsx-text" });
  }

  for (const match of withoutComments.matchAll(/\bpushToast\(\s*["'`]([^"'`]+)["'`]/g)) {
    const text = match[1];
    if (isAllowedLiteral(text)) continue;
    findings.push({ filePath, text, kind: "toast" });
  }

  for (const match of withoutComments.matchAll(/\bsetErrorText\(\s*["'`]([^"'`]+)["'`]/g)) {
    const text = match[1];
    if (isAllowedLiteral(text)) continue;
    findings.push({ filePath, text, kind: "error" });
  }

  return findings;
}

const en = loadJson("apps/driver-pwa/src/i18n/en.json");
const es = loadJson("apps/driver-pwa/src/i18n/es.json");
const enKeys = new Set(flattenKeys(en));
const esKeys = new Set(flattenKeys(es));

for (const key of enKeys) {
  if (!esKeys.has(key)) fail(`key "${key}" in en.json missing from es.json`);
}
for (const key of esKeys) {
  if (!enKeys.has(key)) fail(`key "${key}" in es.json missing from en.json`);
}

const files = SCAN_DIRS.flatMap((dir) => walkTsxFiles(dir));
const usedKeys = new Set();
const hardcoded = [];

for (const filePath of files) {
  const source = fs.readFileSync(filePath, "utf8");
  for (const key of extractTranslationKeys(source)) usedKeys.add(key);
  hardcoded.push(...findHardcodedEnglish(source, path.relative(ROOT, filePath)));
}

for (const key of usedKeys) {
  if (!enKeys.has(key)) fail(`t('${key}') used but missing from en.json`);
  if (!esKeys.has(key)) fail(`t('${key}') used but missing from es.json`);
}

if (hardcoded.length > 0) {
  const sample = hardcoded
    .slice(0, 20)
    .map((item) => `${item.filePath} [${item.kind}]: "${item.text}"`)
    .join("\n  ");
  fail(`${hardcoded.length} hardcoded English string(s) remain:\n  ${sample}`);
}

console.log(
  `verify:driver-pwa-i18n-coverage PASS (${usedKeys.size} keys, ${files.length} files, en/es parity OK)`
);
