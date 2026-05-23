#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const APPS_DIR = path.join(ROOT, "apps");
const TARGET_EXTENSIONS = new Set([".ts", ".tsx"]);
const BRACE_DIAGNOSTIC_CODES = new Set([
  1005, // "'x' expected"
  1010, // "'*/' expected"
  1012, // Unexpected token
  1109, // Expression expected
  1128, // Declaration or statement expected
  1131, // Property or signature expected
]);

function fail(message) {
  console.error(`verify:ts-brace-balance — FAILED\n- ${message}`);
  process.exit(1);
}

function collectFiles(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolute, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name);
    if (!TARGET_EXTENSIONS.has(ext)) continue;
    out.push(absolute);
  }
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function scanFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind);
  const diagnostics = sourceFile.parseDiagnostics.filter((d) => BRACE_DIAGNOSTIC_CODES.has(d.code));
  if (diagnostics.length > 0) {
    const first = diagnostics[0];
    const line = ts.getLineAndCharacterOfPosition(sourceFile, first.start ?? 0).line + 1;
    const message = ts.flattenDiagnosticMessageText(first.messageText, " ");
    return `${relative(filePath)}:${line} ${message}`;
  }

  return null;
}

if (!fs.existsSync(APPS_DIR)) {
  fail("apps directory not found");
}

const files = [];
collectFiles(APPS_DIR, files);

const problems = [];
for (const file of files) {
  const issue = scanFile(file);
  if (issue) problems.push(issue);
}

if (problems.length > 0) {
  fail(problems.slice(0, 20).join("\n- "));
}

console.log(`verify:ts-brace-balance — OK (${files.length} files)`);
