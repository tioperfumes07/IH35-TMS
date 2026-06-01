#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const envExamplePath = path.join(ROOT, ".env.example");
const backendDbPath = path.join(ROOT, "apps/backend/src/db");

function fail(message) {
  console.error(`verify:postgres-ssl-explicit failed: ${message}`);
  process.exit(1);
}

function ensureEnvExampleHasExplicitSslmode() {
  if (!fs.existsSync(envExamplePath)) {
    fail("missing .env.example");
  }

  const envSource = fs.readFileSync(envExamplePath, "utf8");
  const databaseUrlLine = envSource
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("DATABASE_URL="));

  if (!databaseUrlLine) {
    fail(".env.example missing DATABASE_URL");
  }

  const urlMatch = databaseUrlLine.match(/^DATABASE_URL=(.*)$/);
  if (!urlMatch) {
    fail(".env.example DATABASE_URL line could not be parsed");
  }

  const rawValue = urlMatch[1].trim();
  const unquoted = rawValue.replace(/^['"]|['"]$/g, "");
  const lower = unquoted.toLowerCase();

  if (!(lower.startsWith("postgres://") || lower.startsWith("postgresql://"))) {
    fail(".env.example DATABASE_URL must be a postgres URL");
  }

  if (!lower.includes("sslmode=")) {
    fail(".env.example DATABASE_URL must include explicit sslmode parameter");
  }
}

function walkFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
      files.push(fullPath);
    }
  }
  return files;
}

function ensureNoRawBackendPostgresUrlWithoutSslmode() {
  const files = walkFiles(backendDbPath);

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    const regex = /(postgres(?:ql)?:\/\/[^\s"'`)]*)/gim;
    let match;
    while ((match = regex.exec(source)) !== null) {
      const candidate = match[1];
      if (!candidate.toLowerCase().includes("sslmode=")) {
        const relative = path.relative(ROOT, filePath);
        fail(`${relative} contains postgres URL without sslmode (${candidate})`);
      }
    }
  }
}

ensureEnvExampleHasExplicitSslmode();
ensureNoRawBackendPostgresUrlWithoutSslmode();
console.log("verify:postgres-ssl-explicit: ok");
