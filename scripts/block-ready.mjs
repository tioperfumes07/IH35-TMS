#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { resolveBlockReadyManifest, aggregateBlockReadyManifests } from "./block-ready-agent-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FETCH_MAX_AGE_MS = 5 * 60 * 1000;

export function parseArgs(argv, options = {}) {
  const defaultManifest =
    options.defaultManifest ??
    resolveBlockReadyManifest({
      agentEnv: options.agentEnv,
      worktreePath: options.worktreePath ?? ROOT,
    }).manifest;
  const args = { manifest: defaultManifest };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--manifest" && argv[i + 1]) {
      args.manifest = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function runCommand(command, checkId, options = {}) {
  const cwd = options.cwd ? path.resolve(ROOT, options.cwd) : ROOT;
  console.log(`[${checkId}] RUN ${command}`);
  const res = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (res.status === 0) {
    console.log(`[${checkId}] PASS ${command}`);
    return { ok: true, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
  }
  const merged = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
  const tail = merged.split(/\r?\n/).slice(-20).join("\n");
  return {
    ok: false,
    reason: `${command} exited with code ${res.status}`,
    tail,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

function fail(checkId, reason, tail = "") {
  const blockId = globalThis.__blockReadyBlockId ?? "UNKNOWN";
  console.error(`BLOCK NOT READY: ${blockId}`);
  console.error(`Failed check: ${checkId} — ${reason}`);
  if (tail) {
    console.error("Tail of failing command:");
    console.error(tail);
  }
  console.error("Do NOT push. Fix and rerun: npm run block-ready");
  process.exit(1);
}

function pass(checkId, detail) {
  if (detail) {
    console.log(`[${checkId}] PASS ${detail}`);
  }
}

export { aggregateBlockReadyManifests } from "./block-ready-agent-manifest.mjs";

export function globToRegExp(globPattern) {
  const normalized = globPattern.replace(/\\/g, "/");
  let regex = "^";
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === "*" && next === "*") {
      regex += ".*";
      i += 1;
      continue;
    }
    if (ch === "*") {
      regex += "[^/]*";
      continue;
    }
    if (ch === "?") {
      regex += "[^/]";
      continue;
    }
    if (".+^${}()|[]\\".includes(ch)) {
      regex += `\\${ch}`;
      continue;
    }
    regex += ch;
  }
  regex += "$";
  return new RegExp(regex);
}

export function matchesAnyAllowedFile(filePath, patterns) {
  const normalized = filePath.replace(/\\/g, "/");
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

export function validateManifest(manifest) {
  const errors = [];
  const required = {
    block_id: "string",
    phase: "string",
    task: "string",
    allowed_files: "array",
    extra_gates: "array",
    runtime_path: "enum",
    db_required: "boolean",
    guard_required: "boolean",
  };

  for (const [key, kind] of Object.entries(required)) {
    if (!(key in manifest)) {
      errors.push(`missing required field: ${key}`);
      continue;
    }
    const value = manifest[key];
    if (kind === "string" && typeof value !== "string") {
      errors.push(`${key} must be string`);
    }
    if (kind === "boolean" && typeof value !== "boolean") {
      errors.push(`${key} must be boolean`);
    }
    if (kind === "array") {
      if (!Array.isArray(value)) {
        errors.push(`${key} must be array`);
      } else if (!value.every((item) => typeof item === "string")) {
        errors.push(`${key} must contain only strings`);
      }
    }
    if (kind === "enum" && !["src", "dist", "both", "docs"].includes(value)) {
      errors.push(`${key} must be one of src|dist|both|docs`);
    }
  }

  return errors;
}

export function readUtf8FileFromStableHandle(filePath) {
  let fileDescriptor;
  try {
    const noFollow = fs.constants.O_NOFOLLOW ?? 0;
    fileDescriptor = fs.openSync(filePath, fs.constants.O_RDONLY | noFollow);
    const stat = fs.fstatSync(fileDescriptor);
    if (!stat.isFile()) {
      return { ok: false, code: "NOT_REGULAR_FILE", reason: `${filePath} is not a regular file` };
    }
    return { ok: true, source: fs.readFileSync(fileDescriptor, "utf8") };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "READ_ERROR";
    return {
      ok: false,
      code,
      reason:
        code === "ENOENT"
          ? `${filePath} does not exist`
          : `cannot read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
  }
}

export function parseManifest(manifestPath) {
  const absolutePath = path.resolve(ROOT, manifestPath);
  const manifestRead = readUtf8FileFromStableHandle(absolutePath);
  if (!manifestRead.ok && manifestRead.code === "ENOENT") {
    throw new Error(`manifest file not found: ${manifestPath}`);
  }
  if (!manifestRead.ok) throw new Error(`manifest cannot be read: ${manifestRead.reason}`);
  let parsed;
  try {
    parsed = JSON.parse(manifestRead.source);
  } catch (error) {
    throw new Error(`manifest is not valid JSON: ${error.message}`);
  }
  const errors = validateManifest(parsed);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return { manifest: parsed, absolutePath };
}

export function readVerifyMeta(rootDir = ROOT) {
  const verifyMetaPath = path.resolve(rootDir, "scripts/verify-meta.json");
  const metaRead = readUtf8FileFromStableHandle(verifyMetaPath);
  if (!metaRead.ok && metaRead.code === "ENOENT") {
    return { db_gated_verify_scripts: [], block_ready_c5_skip_after_c4: [] };
  }
  if (!metaRead.ok) throw new Error(`verify-meta cannot be read: ${metaRead.reason}`);
  const data = JSON.parse(metaRead.source);
  const list = Array.isArray(data.db_gated_verify_scripts) ? data.db_gated_verify_scripts : [];
  const skipAfterC4 = Array.isArray(data.block_ready_c5_skip_after_c4) ? data.block_ready_c5_skip_after_c4 : [];
  return { db_gated_verify_scripts: list, block_ready_c5_skip_after_c4: skipAfterC4 };
}

/** C4 already runs verify:arch-design (full meta-chain). Skip those scripts in C5. */
export function shouldSkipC5VerifyScript(name, verifyMeta) {
  const skipAfterC4 = new Set(verifyMeta.block_ready_c5_skip_after_c4 ?? []);
  return skipAfterC4.has(name);
}

function getChangedFiles(range) {
  const res = runCommand(`git diff --name-only ${range}`, "C9");
  if (!res.ok) {
    throw new Error(res.reason);
  }
  return res.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getChangedNameStatus(range) {
  const res = runCommand(`git diff --name-status ${range}`, "C8");
  if (!res.ok) {
    throw new Error(res.reason);
  }
  return res.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\s+/);
      return { status, path: rest.join(" ") };
    });
}

function getNewestMtimeMs(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return 0;
  }
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return stat.mtimeMs;
  }
  let max = stat.mtimeMs;
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const candidate = getNewestMtimeMs(path.join(targetPath, entry.name));
    if (candidate > max) {
      max = candidate;
    }
  }
  return max;
}

function parseJavaScriptSource(filename, source) {
  if (typeof source !== "string" || source.trim() === "") {
    return { ok: false, sourceFile: null, reason: "source is empty" };
  }
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    return {
      ok: false,
      sourceFile,
      reason: `parse diagnostics: ${sourceFile.parseDiagnostics
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))
        .join("; ")}`,
    };
  }
  return { ok: true, sourceFile, reason: null };
}

function functionDeclarations(sourceFile) {
  const declarations = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      declarations.set(statement.name.text, statement);
    }
  }
  return declarations;
}

function walkAst(node, visitor, { skipNestedFunctions = false } = {}) {
  if (visitor(node) === false) return;
  if (
    skipNestedFunctions &&
    node.parent &&
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node))
  ) {
    return;
  }
  ts.forEachChild(node, (child) => walkAst(child, visitor, { skipNestedFunctions }));
}

function isRepositoryInputCall(call, declarations, seenFunctions = new Set()) {
  const expression = call.expression;
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "fs" &&
    [
      "readFileSync",
      "readdirSync",
      "existsSync",
      "statSync",
      "lstatSync",
      "realpathSync",
      "readlinkSync",
    ].includes(expression.name.text)
  ) {
    return true;
  }
  if (
    ts.isIdentifier(expression) &&
    ["readFileSync", "readdirSync", "existsSync", "statSync", "execSync", "spawnSync"].includes(
      expression.text
    )
  ) {
    return true;
  }
  if (ts.isIdentifier(expression) && declarations.has(expression.text)) {
    return functionInspectsRepository(expression.text, declarations, seenFunctions);
  }
  return false;
}

function functionInspectsRepository(name, declarations, seenFunctions = new Set()) {
  if (seenFunctions.has(name)) return false;
  const declaration = declarations.get(name);
  if (!declaration?.body) return false;
  const nextSeen = new Set(seenFunctions).add(name);
  let inspects = false;
  walkAst(declaration.body, (node) => {
    if (ts.isCallExpression(node) && isRepositoryInputCall(node, declarations, nextSeen)) {
      inspects = true;
      return false;
    }
  });
  return inspects;
}

function expressionDependsOn(expression, taintedNames, declarations, mode) {
  let depends = false;
  walkAst(expression, (node) => {
    if (ts.isIdentifier(node) && taintedNames.has(node.text)) {
      depends = true;
      return false;
    }
    if (ts.isCallExpression(node)) {
      if (mode === "repository" && isRepositoryInputCall(node, declarations)) {
        depends = true;
        return false;
      }
      if (
        mode === "check" &&
        ts.isIdentifier(node.expression) &&
        declarations.has(node.expression.text)
      ) {
        depends = true;
        return false;
      }
    }
  });
  return depends;
}

function staticallyFalse(expression) {
  return expression.kind === ts.SyntaxKind.FalseKeyword ||
    (ts.isNumericLiteral(expression) && Number(expression.text) === 0);
}

function isNonZeroExitCall(node) {
  return (
    Boolean(node) &&
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "process" &&
    node.expression.name.text === "exit" &&
    node.arguments.length > 0 &&
    ts.isNumericLiteral(node.arguments[0]) &&
    Number(node.arguments[0].text) !== 0
  );
}

function statementContainsFailure(statement, declarations, seenFunctions = new Set()) {
  if (ts.isThrowStatement(statement) || isNonZeroExitCall(statement.expression)) return true;
  if (ts.isBlock(statement)) {
    for (const child of statement.statements) {
      if (statementContainsFailure(child, declarations, seenFunctions)) return true;
      if (
        ts.isReturnStatement(child) ||
        ts.isThrowStatement(child) ||
        isNonZeroExitCall(child.expression)
      ) {
        break;
      }
    }
    return false;
  }
  if (ts.isIfStatement(statement)) {
    if (!staticallyFalse(statement.expression) &&
        statementContainsFailure(statement.thenStatement, declarations, seenFunctions)) {
      return true;
    }
    return Boolean(
      statement.elseStatement &&
      statementContainsFailure(statement.elseStatement, declarations, seenFunctions)
    );
  }
  if (
    ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) &&
    ts.isIdentifier(statement.expression.expression)
  ) {
    const name = statement.expression.expression.text;
    if (seenFunctions.has(name)) return false;
    const declaration = declarations.get(name);
    return Boolean(
      declaration?.body &&
      statementContainsFailure(
        declaration.body,
        declarations,
        new Set(seenFunctions).add(name)
      )
    );
  }
  return false;
}

function statementsHaveDataDependentFailure(statements, declarations, mode) {
  const taintedNames = new Set();
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          expressionDependsOn(declaration.initializer, taintedNames, declarations, mode)
        ) {
          taintedNames.add(declaration.name.text);
        }
      }
    }
    if (
      ts.isIfStatement(statement) &&
      !staticallyFalse(statement.expression) &&
      expressionDependsOn(statement.expression, taintedNames, declarations, mode) &&
      statementContainsFailure(statement.thenStatement, declarations)
    ) {
      return true;
    }
    if (
      ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression) &&
      ts.isIdentifier(statement.expression.expression)
    ) {
      const called = declarations.get(statement.expression.expression.text);
      if (called?.body && statementsHaveDataDependentFailure(called.body.statements, declarations, mode)) {
        return true;
      }
    }
    if (ts.isBlock(statement) &&
        statementsHaveDataDependentFailure(statement.statements, declarations, mode)) {
      return true;
    }
    if (ts.isIfStatement(statement) && !staticallyFalse(statement.expression)) {
      const thenStatements = ts.isBlock(statement.thenStatement)
        ? statement.thenStatement.statements
        : [statement.thenStatement];
      if (statementsHaveDataDependentFailure(thenStatements, declarations, mode)) return true;
      if (statement.elseStatement) {
        const elseStatements = ts.isBlock(statement.elseStatement)
          ? statement.elseStatement.statements
          : [statement.elseStatement];
        if (statementsHaveDataDependentFailure(elseStatements, declarations, mode)) return true;
      }
    }
    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) break;
  }
  return false;
}

function isSelftestCondition(expression) {
  if (
    !ts.isCallExpression(expression) ||
    !ts.isPropertyAccessExpression(expression.expression) ||
    expression.expression.name.text !== "includes" ||
    expression.arguments.length !== 1 ||
    !ts.isStringLiteralLike(expression.arguments[0]) ||
    expression.arguments[0].text !== "--selftest"
  ) {
    return false;
  }
  const target = expression.expression.expression;
  return (
    ts.isPropertyAccessExpression(target) &&
    ts.isIdentifier(target.expression) &&
    target.expression.text === "process" &&
    target.name.text === "argv"
  );
}

function calledLocalFunctions(node, declarations) {
  const names = new Set();
  walkAst(
    node,
    (child) => {
      if (
        ts.isCallExpression(child) &&
        ts.isIdentifier(child.expression) &&
        declarations.has(child.expression.text)
      ) {
        names.add(child.expression.text);
      }
    },
    { skipNestedFunctions: true }
  );
  return names;
}

function reachableLocalFunctions(statements, declarations) {
  const reachable = new Set();
  const queue = [];
  for (const statement of statements) {
    queue.push(...calledLocalFunctions(statement, declarations));
  }
  while (queue.length > 0) {
    const name = queue.shift();
    if (reachable.has(name)) continue;
    reachable.add(name);
    const declaration = declarations.get(name);
    if (declaration?.body) {
      queue.push(...calledLocalFunctions(declaration.body, declarations));
    }
  }
  return reachable;
}

function selftestPlantsViolation(declaration, declarations, actualFunctions) {
  if (!declaration?.body) return false;
  let plantsInput = false;
  walkAst(declaration.body, (node) => {
    if (
      (ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ["replace", "replaceAll", "push", "splice"].includes(node.expression.name.text)) ||
      (ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left)))
    ) {
      plantsInput = true;
    }
  });
  const selftestChecks = reachableLocalFunctions(declaration.body.statements, declarations);
  return (
    plantsInput &&
    [...selftestChecks].some((name) => actualFunctions.has(name)) &&
    statementsHaveDataDependentFailure(declaration.body.statements, declarations, "check")
  );
}

export function analyzeNewGuardSource(source) {
  const parsed = parseJavaScriptSource("verify-guard.mjs", source);
  if (!parsed.ok) return parsed;
  const { sourceFile } = parsed;
  const declarations = functionDeclarations(sourceFile);
  const selftestGate = sourceFile.statements.find(
    (statement) => ts.isIfStatement(statement) && isSelftestCondition(statement.expression)
  );
  if (!selftestGate || !ts.isIfStatement(selftestGate)) {
    return { ok: false, reason: "guard must expose a process.argv --selftest branch" };
  }

  const actualStatements = sourceFile.statements.flatMap((statement) => {
    if (statement !== selftestGate) return [statement];
    return selftestGate.elseStatement
      ? ts.isBlock(selftestGate.elseStatement)
        ? [...selftestGate.elseStatement.statements]
        : [selftestGate.elseStatement]
      : [];
  });
  const actualFunctions = reachableLocalFunctions(actualStatements, declarations);
  const selftestFunctions = calledLocalFunctions(selftestGate.thenStatement, declarations);
  if (
    selftestFunctions.size === 0 ||
    ![...selftestFunctions].some((name) =>
      selftestPlantsViolation(declarations.get(name), declarations, actualFunctions)
    )
  ) {
    return {
      ok: false,
      reason: "guard selftest must plant a violation into an actual guard check and fail if it is not detected",
    };
  }
  const inspectsRepository = [...declarations.keys()].some((name) =>
    functionInspectsRepository(name, declarations)
  );
  if (!inspectsRepository) {
    return { ok: false, reason: "guard must inspect repository or target input" };
  }
  if (!statementsHaveDataDependentFailure(actualStatements, declarations, "repository")) {
    return {
      ok: false,
      reason: "guard must have a reachable repository-data-dependent throw or non-zero process.exit path",
    };
  }
  return { ok: true, reason: null };
}

export function analyzeVerifyStepSource(source) {
  const parsed = parseJavaScriptSource("verify-step.mjs", source);
  if (!parsed.ok) return { ...parsed, invoked: new Set() };
  const invoked = new Set();
  walkAst(parsed.sourceFile, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "ctx" &&
      node.expression.name.text === "run" &&
      node.arguments.length >= 2 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      node.arguments[0].text === "node" &&
      ts.isArrayLiteralExpression(node.arguments[1])
    ) {
      const [guardArgument] = node.arguments[1].elements;
      if (
        guardArgument &&
        ts.isStringLiteralLike(guardArgument) &&
        /^scripts\/verify-[^/]+\.mjs$/.test(guardArgument.text)
      ) {
        invoked.add(guardArgument.text);
      }
    }
  });
  return { ok: true, reason: null, invoked };
}

export function invokedGuardsFromVerifyStep(source) {
  return analyzeVerifyStepSource(source).invoked;
}

export function evaluateGuardRequirement({
  guardRequired,
  changedNameStatus,
  changedFileSources = new Map(),
}) {
  if (!guardRequired) {
    return { ok: true, matchedGuardFiles: [], matchedStepFiles: [], wiredGuardFiles: [], hasCiWiring: true };
  }
  const addedFiles = changedNameStatus
    .filter((item) => item.status.startsWith("A"))
    .map((item) => item.path);

  const sourceFor = (filePath) =>
    changedFileSources instanceof Map
      ? changedFileSources.get(filePath)
      : changedFileSources?.[filePath];
  const guardCandidates = addedFiles.filter((filePath) =>
    /^scripts\/verify-[^/]+\.mjs$/.test(filePath)
  );
  const guardAnalyses = new Map(
    guardCandidates.map((filePath) => [
      filePath,
      analyzeNewGuardSource(sourceFor(filePath)),
    ])
  );
  const invalidGuardFiles = guardCandidates.filter(
    (filePath) => !guardAnalyses.get(filePath)?.ok
  );
  const matchedGuardFiles = guardCandidates.filter(
    (filePath) => guardAnalyses.get(filePath)?.ok
  );
  const matchedStepFiles = addedFiles.filter((filePath) =>
    /^scripts\/verify-steps\/[^/]+\.mjs$/.test(filePath)
  );
  const stepAnalyses = new Map(
    matchedStepFiles.map((filePath) => [
      filePath,
      analyzeVerifyStepSource(sourceFor(filePath)),
    ])
  );
  const invalidStepFiles = matchedStepFiles.filter(
    (filePath) => !stepAnalyses.get(filePath)?.ok
  );
  const wiredGuardFiles = matchedGuardFiles.filter((guardFile) =>
    matchedStepFiles.some((stepFile) =>
      stepAnalyses.get(stepFile)?.invoked.has(guardFile)
    )
  );
  const hasCiWiring = wiredGuardFiles.length > 0;

  if (invalidGuardFiles.length > 0) {
    return {
      ok: false,
      reason: `guard_required=true but added guard contract failed: ${invalidGuardFiles
        .map((filePath) => `${filePath} (${guardAnalyses.get(filePath)?.reason})`)
        .join(", ")}`,
      matchedGuardFiles,
      matchedStepFiles,
      invalidGuardFiles,
      invalidStepFiles,
      wiredGuardFiles,
      hasCiWiring,
    };
  }
  if (invalidStepFiles.length > 0) {
    return {
      ok: false,
      reason: `guard_required=true but added verify-step parse failed: ${invalidStepFiles
        .map((filePath) => `${filePath} (${stepAnalyses.get(filePath)?.reason})`)
        .join(", ")}`,
      matchedGuardFiles,
      matchedStepFiles,
      invalidGuardFiles,
      invalidStepFiles,
      wiredGuardFiles,
      hasCiWiring,
    };
  }

  if (matchedGuardFiles.length === 0) {
    return {
      ok: false,
      reason: "guard_required=true but no real scripts/verify-*.mjs guard implementation was added",
      matchedGuardFiles,
      matchedStepFiles,
      invalidGuardFiles,
      invalidStepFiles,
      wiredGuardFiles,
      hasCiWiring,
    };
  }
  if (!hasCiWiring) {
    return {
      ok: false,
      reason:
        "guard_required=true but no added auto-discovered verify-step directly invokes an added guard with ctx.run(\"node\", [\"scripts/verify-*.mjs\"])",
      matchedGuardFiles,
      matchedStepFiles,
      invalidGuardFiles,
      invalidStepFiles,
      wiredGuardFiles,
      hasCiWiring,
    };
  }

  return {
    ok: true,
    matchedGuardFiles,
    matchedStepFiles,
    invalidGuardFiles,
    invalidStepFiles,
    wiredGuardFiles,
    hasCiWiring,
  };
}

export function computeDbGatePlan(manifest) {
  if (manifest.db_required) {
    return { deferToCi: true, runBootSmoke: false, smokeScripts: [] };
  }
  const smokeScripts = manifest.extra_gates.filter((name) => name.startsWith("smoke:"));
  const runBootSmoke = manifest.runtime_path === "dist" || manifest.runtime_path === "both";
  return { deferToCi: false, runBootSmoke, smokeScripts };
}

function runCheckC1() {
  const branchRes = runCommand("git rev-parse --abbrev-ref HEAD", "C1");
  if (!branchRes.ok) {
    fail("C1", branchRes.reason, branchRes.tail);
  }
  const branch = branchRes.stdout.trim();
  if (["main", "master", "origin/main", "HEAD"].includes(branch)) {
    fail("C1", `must run on a non-main branch (current: ${branch})`);
  }

  const statusRes = runCommand("git status --porcelain", "C1");
  if (!statusRes.ok) {
    fail("C1", statusRes.reason, statusRes.tail);
  }
  const lines = statusRes.stdout.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("??")) {
      fail("C1", `untracked file present: ${line.slice(3)}`);
    }
    const x = line[0] ?? " ";
    const y = line[1] ?? " ";
    const file = line.slice(3);
    if (y !== " ") {
      fail("C1", `unstaged change present: ${file}`);
    }
    if (x === " ") {
      fail("C1", `dirty file not staged: ${file}`);
    }
  }

  const fetchHeadPath = path.resolve(ROOT, ".git/FETCH_HEAD");
  let shouldFetch = true;
  if (fs.existsSync(fetchHeadPath)) {
    const age = Date.now() - fs.statSync(fetchHeadPath).mtimeMs;
    shouldFetch = age > FETCH_MAX_AGE_MS;
  }
  if (shouldFetch) {
    const fetchRes = runCommand("git fetch origin", "C1");
    if (!fetchRes.ok) {
      fail("C1", fetchRes.reason, fetchRes.tail);
    }
  }

  const mergeBaseRes = runCommand("git merge-base HEAD origin/main", "C1");
  if (!mergeBaseRes.ok) {
    fail("C1", mergeBaseRes.reason, mergeBaseRes.tail);
  }
  const originMainRes = runCommand("git rev-parse origin/main", "C1");
  if (!originMainRes.ok) {
    fail("C1", originMainRes.reason, originMainRes.tail);
  }
  const mergeBase = mergeBaseRes.stdout.trim();
  const originMain = originMainRes.stdout.trim();
  if (mergeBase !== originMain) {
    const missingRes = runCommand("git log --oneline -1 HEAD..origin/main", "C1");
    const missing = (missingRes.stdout || "").trim() || originMain;
    const mergeBranchHintMatch = missing.match(/Merge pull request #\d+ from [^/]+\/(.+)$/);
    if (mergeBranchHintMatch && mergeBranchHintMatch[1] === branch) {
      fail(
        "C1",
        `branch appears merged upstream (${missing}); run "git checkout main && git pull --ff-only origin main && git branch -D ${branch}" then start next block from main`
      );
    }
    fail("C1", `branch is not rebased onto origin/main; missing commit ${missing}`);
  }

  const mergeCommitsRes = runCommand("git rev-list --merges origin/main..HEAD", "C1");
  if (!mergeCommitsRes.ok) {
    fail("C1", mergeCommitsRes.reason, mergeCommitsRes.tail);
  }
  const mergeCommits = mergeCommitsRes.stdout.split(/\r?\n/).filter(Boolean);
  if (mergeCommits.length > 0) {
    fail("C1", `merge commit introduced on branch: ${mergeCommits[0]}`);
  }

  pass("C1", branch);
}

function runCheckC2(manifestPath) {
  try {
    const parsed = parseManifest(manifestPath);
    globalThis.__blockReadyBlockId = parsed.manifest.block_id;
    pass("C2", parsed.absolutePath);
    return parsed.manifest;
  } catch (error) {
    fail("C2", error.message);
  }
}

function runCheckC3() {
  const steps = [
    "rm -rf apps/backend/dist",
    "npm run build:backend",
    "cd apps/frontend && npx tsc -b && cd ../..",
  ];
  for (const step of steps) {
    const res = runCommand(step, "C3");
    if (!res.ok) {
      fail("C3", res.reason, res.tail);
    }
  }
}

function runCheckC4() {
  const res = runCommand("npm run verify:arch-design", "C4");
  if (!res.ok) {
    fail("C4", res.reason, res.tail);
  }
}

function runCheckC5(verifyMeta) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(ROOT, "package.json"), "utf8"));
  const verifyScriptNames = Object.keys(pkg.scripts).filter((name) => name.startsWith("verify:"));
  const dbGatedVerifyScripts = verifyMeta.db_gated_verify_scripts ?? [];
  let passed = 0;
  for (const name of verifyScriptNames) {
    if (dbGatedVerifyScripts.includes(name)) {
      console.log(`[C5] SKIP ${name} (db-gated)`);
      continue;
    }
    if (shouldSkipC5VerifyScript(name, verifyMeta)) {
      console.log(`[C5] SKIP ${name} (already run in C4)`);
      continue;
    }
    const res = runCommand(`npm run ${name}`, "C5");
    if (!res.ok) {
      fail("C5", `${name} failed`, res.tail);
    }
    passed += 1;
  }
  pass("C5", `${passed} verify scripts passed`);
  return passed;
}

function runCheckC6(extraGates) {
  let passed = 0;
  for (const gate of extraGates) {
    const res = runCommand(`npm run ${gate}`, "C6");
    if (!res.ok) {
      fail("C6", `${gate} failed`, res.tail);
    }
    passed += 1;
  }
  pass("C6", `${passed} extra gates passed`);
  return passed;
}

function runCheckC7(manifest) {
  const runtime = manifest.runtime_path;
  const extra = manifest.extra_gates;
  if (runtime === "dist" || runtime === "both") {
    const distCandidates = [path.resolve(ROOT, "apps/backend/dist"), path.resolve(ROOT, "dist")];
    const distPath = distCandidates.find((candidate) => fs.existsSync(candidate));
    if (!distPath) {
      fail("C7", "runtime_path requires dist but neither apps/backend/dist nor dist/ exists");
    }
    const srcNewest = getNewestMtimeMs(path.resolve(ROOT, "apps/backend/src"));
    const distNewest = getNewestMtimeMs(distPath);
    if (distNewest < srcNewest) {
      fail("C7", `${path.relative(ROOT, distPath)} is older than apps/backend/src; run build first`);
    }
    const distGates = extra.filter((name) => /dist|smoke|autoload-coverage/i.test(name));
    for (const gate of distGates) {
      const res = runCommand(`npm run ${gate}`, "C7");
      if (!res.ok) {
        fail("C7", `dist runtime gate failed: ${gate}`, res.tail);
      }
    }
  }

  if (runtime === "src" || runtime === "both") {
    const srcGates = extra.filter((name) => /src/i.test(name));
    for (const gate of srcGates) {
      const res = runCommand(`npm run ${gate}`, "C7");
      if (!res.ok) {
        fail("C7", `src runtime gate failed: ${gate}`, res.tail);
      }
    }
  }

  pass("C7", runtime);
}

function runCheckC8(manifest, range) {
  const changedNameStatus = getChangedNameStatus(range);
  const changedFileSources = new Map();
  for (const item of changedNameStatus) {
    if (!item.status.startsWith("A")) continue;
    if (
      !/^scripts\/verify-[^/]+\.mjs$/.test(item.path) &&
      !/^scripts\/verify-steps\/[^/]+\.mjs$/.test(item.path)
    ) {
      continue;
    }
    const absolutePath = path.resolve(ROOT, item.path);
    const sourceRead = readUtf8FileFromStableHandle(absolutePath);
    if (!sourceRead.ok) {
      fail("C8", `cannot safely read added guard source ${item.path}: ${sourceRead.reason}`);
    }
    changedFileSources.set(item.path, sourceRead.source);
  }
  const result = evaluateGuardRequirement({
    guardRequired: manifest.guard_required,
    changedNameStatus,
    changedFileSources,
  });

  if (!result.ok) {
    fail("C8", result.reason);
  }

  if (manifest.guard_required) {
    pass(
      "C8",
      `matched guards: ${result.matchedGuardFiles.join(", ")}; wired guards: ${result.wiredGuardFiles.join(", ")}`
    );
  } else {
    pass("C8", "guard not required");
  }
}

// Paths matching these patterns are documentation and are exempt from C9 scope.
// Docs do not require a block manifest runtime_path entry or an allowed_files listing.
const C9_DOCS_EXEMPT_PATTERNS = [
  "docs/**",
  "*.md",
  "**/*.md",
];

function isDocsExempt(filePath) {
  return C9_DOCS_EXEMPT_PATTERNS.some((pattern) => globToRegExp(pattern).test(filePath));
}

function runCheckC9(manifest, range) {
  const changed = getChangedFiles(range);
  const outOfScope = changed.filter(
    (filePath) => !matchesAnyAllowedFile(filePath, manifest.allowed_files) && !isDocsExempt(filePath)
  );
  if (outOfScope.length > 0) {
    fail("C9", `out-of-scope changed files: ${outOfScope.join(", ")}`);
  }
  pass("C9", `${changed.length} changed files within allowed scope`);
  return changed.length;
}

function runCheckC10(manifest) {
  const plan = computeDbGatePlan(manifest);
  if (plan.deferToCi) {
    console.log(
      "DB-gated checks deferred to CI per Standing Order #16 v2. Do NOT run locally with substituted DB."
    );
    pass("C10", "deferred");
    return "deferred";
  }

  if (plan.runBootSmoke) {
    const boot = runCommand("npm run ci:boot-api-smoke", "C10");
    if (!boot.ok) {
      fail("C10", "ci:boot-api-smoke failed", boot.tail);
    }
  }

  for (const smokeScript of plan.smokeScripts) {
    const res = runCommand(`npm run ${smokeScript}`, "C10");
    if (!res.ok) {
      fail("C10", `${smokeScript} failed`, res.tail);
    }
  }

  pass("C10", "local-passed");
  return "local-passed";
}

function main() {
  const resolved = resolveBlockReadyManifest({ worktreePath: ROOT });
  const args = parseArgs(process.argv.slice(2), {
    defaultManifest: resolved.manifest,
    worktreePath: ROOT,
    agentEnv: process.env.AGENT,
  });

  // Aggregate all per-block manifests for informational purposes
  const allManifests = aggregateBlockReadyManifests(ROOT);
  if (allManifests.length > 0) {
    const ids = allManifests.map((m) => m.block_id ?? "<unknown>").join(", ");
    console.log(`[C2] KNOWN blocks in .block-ready/: ${ids}`);
  }

  console.log(`[C2] RESOLVED manifest=${args.manifest} agent=${resolved.agent}`);
  runCheckC1();
  const manifest = runCheckC2(args.manifest);
  const verifyMeta = readVerifyMeta();

  runCheckC3();
  runCheckC4();
  const verifyCount = runCheckC5(verifyMeta);
  const extraCount = runCheckC6(manifest.extra_gates);
  runCheckC7(manifest);

  const range = "origin/main..HEAD";
  runCheckC8(manifest, range);
  const changedCount = runCheckC9(manifest, range);
  const dbGate = runCheckC10(manifest);

  console.log(`BLOCK READY: ${manifest.block_id}`);
  console.log(`Allowed files changed: ${changedCount}`);
  console.log(`Verify gates passed:   ${verifyCount}`);
  console.log(`Extra gates passed:    ${extraCount}`);
  console.log(`Runtime parity:        ${manifest.runtime_path}`);
  console.log(`DB gate:               ${dbGate}`);
  console.log("New SHA when pushed will be ready to merge once CI is green.");
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}
