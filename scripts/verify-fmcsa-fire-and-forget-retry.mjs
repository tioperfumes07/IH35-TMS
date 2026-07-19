#!/usr/bin/env node
/**
 * acct-fmcsa-fire-and-forget-retry
 *
 * Fail-closed semantic guard that evaluates EXECUTABLE code only:
 *  - comments stripped with a string-safe lexer (does not corrupt // or /* inside strings)
 *  - string/template bodies masked so comment/string decoys cannot satisfy checks
 *  - SQL extracted from template literals for ON CONFLICT predicate checks
 *
 * Self-test plants include executable defects AND comment/string decoys.
 * Rule 17: verify-step only (no package.json / workflow thrash).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:fmcsa-fire-and-forget-retry";

const paths = {
  customersRoutes: path.join(ROOT, "apps/backend/src/mdata/customers.routes.ts"),
  chain: path.join(ROOT, "apps/backend/src/integrations/fmcsa/fmcsa-customer-verify-chain.service.ts"),
  safer: path.join(ROOT, "apps/backend/src/integrations/fmcsa/safer.service.ts"),
  errors: path.join(ROOT, "apps/backend/src/integrations/fmcsa/errors.ts"),
  httpErrors: path.join(ROOT, "apps/backend/src/lib/fmcsa-http-errors.ts"),
  fmcsaClient: path.join(ROOT, "apps/backend/src/lib/fmcsa-client.ts"),
  handler: path.join(ROOT, "apps/backend/src/outbox/handlers/fmcsa-customer-verify.handler.ts"),
  registry: path.join(ROOT, "apps/backend/src/outbox/handlers/registry.ts"),
  processor: path.join(ROOT, "apps/backend/src/outbox/processor.ts"),
  reusableDedupe: path.join(ROOT, "apps/backend/src/outbox/reusable-dedupe.ts"),
  backoff: path.join(ROOT, "apps/backend/src/outbox/retry-backoff.ts"),
  deliveryErrors: path.join(ROOT, "apps/backend/src/outbox/delivery-errors.ts"),
  verifyStep: path.join(ROOT, "scripts/verify-steps/913-verify-fmcsa-fire-and-forget-retry.mjs"),
  dbTest: path.join(ROOT, "apps/backend/src/integrations/fmcsa/__tests__/fmcsa-outbox-dedupe.db.test.ts"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

/** Heuristic: `/` starts a regex literal rather than division. */
function canStartRegexLiteral(codeSoFar) {
  const trimmed = codeSoFar.replace(/\s+$/u, "");
  if (!trimmed) return true;
  if (/[([{,;=!&|?:~^%*+\-<>]$/u.test(trimmed)) return true;
  if (/(?:^|[^\w$.])(?:return|throw|case|typeof|delete|void|new|in|of|instanceof|await|yield)$/u.test(trimmed)) {
    return true;
  }
  return false;
}

/** Scan a regex literal starting at `/` (index i). Returns index after flags. */
function scanRegexLiteral(src, i) {
  let j = i + 1;
  let inClass = false;
  while (j < src.length) {
    const cj = src[j];
    if (cj === "\n") return j;
    if (cj === "\\" && j + 1 < src.length) {
      j += 2;
      continue;
    }
    if (cj === "[") {
      inClass = true;
      j++;
      continue;
    }
    if (cj === "]" && inClass) {
      inClass = false;
      j++;
      continue;
    }
    if (cj === "/" && !inClass) {
      j++;
      while (j < src.length && /[gimsuy]/u.test(src[j])) j++;
      return j;
    }
    j++;
  }
  return j;
}

/**
 * Lex JS/TS into executable skeleton:
 *  - strip // and /* *\/ comments (preserve newlines)
 *  - mask string / template literal *bodies* with spaces so decoy tokens inside
 *    strings cannot satisfy presence checks
 *  - keep template ${…} expressions as executable code (recursive)
 * Does NOT strip comment-like text inside strings (those stay as spaces after mask).
 *
 * @param {string} src
 * @returns {{ code: string, sqlTemplates: string[], stringLiterals: string[] }}
 */
export function toExecutableSemantics(src) {
  let code = "";
  const sqlTemplates = [];
  const stringLiterals = [];
  /** @type {Array<{ kind: 'code' | 'line' | 'block' | 's' | 'd' | 't', depth?: number, tplBuf?: string, strBuf?: string }>} */
  const stack = [{ kind: "code" }];

  let i = 0;
  while (i < src.length) {
    const top = stack[stack.length - 1];
    const c = src[i];
    const n = src[i + 1];

    if (top.kind === "line") {
      if (c === "\n") {
        code += "\n";
        stack.pop();
      }
      i++;
      continue;
    }
    if (top.kind === "block") {
      if (c === "*" && n === "/") {
        i += 2;
        stack.pop();
        continue;
      }
      if (c === "\n") code += "\n";
      i++;
      continue;
    }
    if (top.kind === "s" || top.kind === "d") {
      const quote = top.kind === "s" ? "'" : '"';
      if (c === "\\") {
        top.strBuf += c + (n ?? "");
        code += "  ";
        i += 2;
        continue;
      }
      if (c === quote) {
        stringLiterals.push(top.strBuf ?? "");
        code += c;
        stack.pop();
        i++;
        continue;
      }
      top.strBuf += c;
      code += c === "\n" ? "\n" : " ";
      i++;
      continue;
    }
    if (top.kind === "t") {
      if (c === "\\") {
        top.tplBuf += c + (n ?? "");
        code += "  ";
        i += 2;
        continue;
      }
      if (c === "`") {
        const body = top.tplBuf ?? "";
        stringLiterals.push(body);
        if (/INSERT\s+INTO\s+/i.test(body) || /ON CONFLICT/i.test(body) || /SELECT\s+/i.test(body)) {
          sqlTemplates.push(body);
        }
        code += c;
        stack.pop();
        i++;
        continue;
      }
      if (c === "$" && n === "{") {
        top.tplBuf += "${";
        code += "${";
        stack.push({ kind: "code", depth: 1 });
        i += 2;
        continue;
      }
      top.tplBuf += c;
      code += c === "\n" ? "\n" : " ";
      i++;
      continue;
    }

    // code
    if (c === "/" && n === "/") {
      stack.push({ kind: "line" });
      i += 2;
      continue;
    }
    if (c === "/" && n === "*") {
      stack.push({ kind: "block" });
      i += 2;
      continue;
    }
    // Regex literal — must not treat /…'…/ as a string (apostrophe in char class).
    if (c === "/" && canStartRegexLiteral(code)) {
      const j = scanRegexLiteral(src, i);
      code += "/RE/";
      i = j;
      continue;
    }
    if (c === "'") {
      code += c;
      stack.push({ kind: "s", strBuf: "" });
      i++;
      continue;
    }
    if (c === '"') {
      code += c;
      stack.push({ kind: "d", strBuf: "" });
      i++;
      continue;
    }
    if (c === "`") {
      code += c;
      stack.push({ kind: "t", tplBuf: "" });
      i++;
      continue;
    }
    if (c === "{") {
      code += c;
      if (typeof top.depth === "number") top.depth += 1;
      i++;
      continue;
    }
    if (c === "}") {
      code += c;
      if (typeof top.depth === "number") {
        top.depth -= 1;
        if (top.depth === 0) {
          stack.pop();
          const parent = stack[stack.length - 1];
          if (parent?.kind === "t" && parent.tplBuf !== undefined) parent.tplBuf += "}";
        }
      }
      i++;
      continue;
    }
    code += c;
    i++;
  }

  return { code, sqlTemplates, stringLiterals };
}

function exe(src) {
  return toExecutableSemantics(src).code;
}

function lit(src) {
  return toExecutableSemantics(src).stringLiterals.join("\n");
}

function sqlFrom(src) {
  return toExecutableSemantics(src).sqlTemplates;
}

/** Comment-stripped source with string/template bodies preserved (for route registration shape). */
export function stripCommentsOnly(src) {
  let out = "";
  /** @type {Array<{ kind: string, depth?: number }>} */
  const stack = [{ kind: "code" }];
  let i = 0;
  while (i < src.length) {
    const top = stack[stack.length - 1];
    const c = src[i];
    const n = src[i + 1];
    if (top.kind === "line") {
      if (c === "\n") {
        out += "\n";
        stack.pop();
      }
      i++;
      continue;
    }
    if (top.kind === "block") {
      if (c === "*" && n === "/") {
        i += 2;
        stack.pop();
        continue;
      }
      if (c === "\n") out += "\n";
      i++;
      continue;
    }
    if (top.kind === "s" || top.kind === "d") {
      const quote = top.kind === "s" ? "'" : '"';
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === quote) stack.pop();
      i++;
      continue;
    }
    if (top.kind === "t") {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === "`") {
        stack.pop();
        i++;
        continue;
      }
      if (c === "$" && n === "{") {
        out += "{";
        stack.push({ kind: "code", depth: 1 });
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      stack.push({ kind: "line" });
      i += 2;
      continue;
    }
    if (c === "/" && n === "*") {
      stack.push({ kind: "block" });
      i += 2;
      continue;
    }
    if (c === "/" && canStartRegexLiteral(out)) {
      const j = scanRegexLiteral(src, i);
      out += src.slice(i, j);
      i = j;
      continue;
    }
    if (c === "'") {
      out += c;
      stack.push({ kind: "s" });
      i++;
      continue;
    }
    if (c === '"') {
      out += c;
      stack.push({ kind: "d" });
      i++;
      continue;
    }
    if (c === "`") {
      out += c;
      stack.push({ kind: "t" });
      i++;
      continue;
    }
    if (c === "{") {
      out += c;
      if (typeof top.depth === "number") top.depth += 1;
      i++;
      continue;
    }
    if (c === "}") {
      out += c;
      if (typeof top.depth === "number") {
        top.depth -= 1;
        if (top.depth === 0) stack.pop();
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Route has rateLimit either inline in options OR via a named const used as the
 * second argument whose initializer includes rateLimit (project canonical pattern).
 * @param {string} commentStripped
 * @param {string} routePath
 * @param {string} [method] optional HTTP method (get|post|patch|…)
 */
function routeHasRateLimit(commentStripped, routePath, method) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const methodPart = method ? method.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "(?:post|get|put|patch|delete)";
  const inline = new RegExp(
    `\\.${methodPart}\\s*(?:<[^>]*>)?\\s*\\(\\s*["'\`]${escaped}["'\`]\\s*,\\s*\\{[\\s\\S]{0,500}?rateLimit\\s*:`,
    "i"
  );
  if (inline.test(commentStripped)) return true;

  const named = new RegExp(
    `\\.${methodPart}\\s*(?:<[^>]*>)?\\s*\\(\\s*["'\`]${escaped}["'\`]\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*,`,
    "i"
  );
  const m = named.exec(commentStripped);
  if (!m) return false;
  const ident = m[1];
  const decl = new RegExp(
    `(?:const|let|var)\\s+${ident.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*\\{[\\s\\S]{0,400}?rateLimit\\s*:`,
    "i"
  );
  return decl.test(commentStripped);
}

/** @param {Record<string, string>} sources — raw file contents */
export function collectFailures(sources) {
  const failures = [];
  const routes = exe(sources.customersRoutes);
  const routesShape = stripCommentsOnly(sources.customersRoutes);
  const routesLit = lit(sources.customersRoutes);
  const chainCode = exe(sources.chain);
  const chainLit = lit(sources.chain);
  const chainSql = sqlFrom(sources.chain);
  const safer = exe(sources.safer);
  const httpErrors = exe(sources.httpErrors);
  const fmcsaClient = exe(sources.fmcsaClient);
  const fmcsaLit = lit(sources.fmcsaClient);
  const handler = exe(sources.handler);
  const handlerLit = lit(sources.handler);
  const handlerSql = sqlFrom(sources.handler).join("\n");
  const registry = exe(sources.registry);
  const processor = exe(sources.processor);
  const reusableDedupe = exe(sources.reusableDedupe);
  const reusableLit = lit(sources.reusableDedupe);
  const backoff = exe(sources.backoff);
  const deliveryErrors = exe(sources.deliveryErrors);
  const dbTestCode = exe(sources.dbTest ?? "");
  const dbTestLit = lit(sources.dbTest ?? "");

  if (/void\s+verifyCustomerWithSafer\s*\(/.test(routes)) {
    failures.push("customers.routes.ts must not fire-and-forget via void verifyCustomerWithSafer");
  }
  if (!/enqueueFmcsaCustomerVerifyRequested/.test(routes)) {
    failures.push("customers.routes.ts must enqueue FMCSA verify via enqueueFmcsaCustomerVerifyRequested");
  }
  // trigger literals are string values adjacent to executable property keys
  if (!/trigger\s*:\s*"create"/.test(sources.customersRoutes.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1")) &&
      !(/trigger\s*:/.test(routes) && /create/.test(routesLit) && /update/.test(routesLit))) {
    // Prefer executable property assignment: trigger: "create" survives as trigger: "      " after mask —
    // so require both create+update trigger keys in code and the literal values in stringLiterals near enqueue.
  }
  {
    const unmaskedCommentsOnly = (() => {
      // Strip comments with lexer, keep string bodies for trigger: "create" shape check via raw-minus-comments.
      let out = "";
      const { code } = toExecutableSemantics(sources.customersRoutes);
      // Reconstruct trigger checks: property name in code + literal in stringLiterals list.
      void code;
      const hasCreate = /\btrigger\b/.test(routes) && routesLit.split("\n").includes("create");
      const hasUpdate = /\btrigger\b/.test(routes) && routesLit.split("\n").includes("update");
      return hasCreate && hasUpdate;
    })();
    if (!unmaskedCommentsOnly) {
      failures.push("customers.routes.ts must enqueue on both create and update (MC/DOT change) paths");
    }
  }
  if (!routesLit.includes("fmcsa_verify_retryable") || !/reply\.code\(\s*503\s*\)/.test(routes)) {
    failures.push("manual verify must map transient failure to truthful 503 fmcsa_verify_retryable (no fake completion)");
  }
  if (!/retryable\s*:\s*true/.test(routes)) {
    failures.push("manual verify 503 body must include retryable: true");
  }
  if (!routeHasRateLimit(routesShape, "/api/v1/mdata/customers/:id/verify-fmcsa", "post")) {
    failures.push("verify-fmcsa route must declare config.rateLimit (CodeQL js/missing-rate-limiting)");
  }
  if (!routeHasRateLimit(routesShape, "/api/v1/mdata/customers/:id", "patch")) {
    failures.push("PATCH /api/v1/mdata/customers/:id must declare config.rateLimit (CodeQL alert #1162)");
  }

  const insertSql = chainSql.find((s) => /INSERT\s+INTO\s+outbox\.events/i.test(s)) ?? "";
  if (!insertSql) {
    failures.push("fmcsa-customer-verify-chain must INSERT into outbox.events");
  } else if (!/ON CONFLICT\s*\(\s*dedupe_key\s*\)\s*WHERE\s+dedupe_key\s+IS\s+NOT\s+NULL\s+DO\s+NOTHING/i.test(insertSql)) {
    failures.push("chain must use ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL (partial unique index predicate)");
  }
  if (!chainLit.includes("fmcsa_verify_enqueued") || !chainLit.includes("fmcsa_verify_deduped")) {
    failures.push("chain must audit enqueue AND dedupe outcomes");
  }
  // parity annotation lives in a block comment — intentional exception (scanner directive)
  if (!sources.chain.includes('outbox-handler-parity: literal-types=["fmcsa.customer.verify_requested"]')) {
    failures.push("chain must annotate outbox-handler-parity for fmcsa.customer.verify_requested");
  }

  if (!reusableLit.includes("fmcsa.customer.verify_requested") || !/shouldReleaseOutboxDedupeKey/.test(reusableDedupe)) {
    failures.push("reusable-dedupe must list fmcsa.customer.verify_requested for terminal dedupe_key release");
  }
  {
    const processorLit = lit(sources.processor);
    const hasReleaseLiteral = /dedupe_key\s*=\s*NULL/.test(processorLit) || /dedupe_key\s*=\s*NULL/.test(processor);
    if (!hasReleaseLiteral || !/shouldReleaseOutboxDedupeKey/.test(processor)) {
      failures.push("processor must release dedupe_key on terminal FMCSA events (lifetime re-enqueue)");
    }
  }
  if (!/OUTBOX_CLAIM_IS_GLOBAL_ARCHITECTURAL/.test(processor)) {
    failures.push("processor must document global claim + payload tenant safety contract");
  }
  if (!/retryAfterMsFromError/.test(processor)) {
    failures.push("processor must honor bounded Retry-After from typed FMCSA errors");
  }

  if (!/operating_company_id\s*=\s*\$2/.test(handlerSql) && !/operating_company_id\s*=\s*\$2/.test(handler)) {
    failures.push("handler must tenant-scope customer load (no cross-tenant processing)");
  }
  if (!handlerLit.includes("fmcsa_customer_missing_or_cross_tenant")) {
    failures.push("handler must permanently fail cross-tenant / missing customer");
  }

  if (!/parseRetryAfterMs/.test(httpErrors) || !/FmcsaRetryableError/.test(httpErrors)) {
    failures.push("fmcsa-http-errors must export typed retryable + parseRetryAfterMs");
  }
  if (!/FmcsaRetryableError/.test(fmcsaClient) || !/\b429\b/.test(fmcsaClient)) {
    failures.push("fmcsa-client must throw typed retryable on 429");
  }
  if (!/parseRetryAfterMs/.test(fmcsaClient)) {
    failures.push("fmcsa-client must read Retry-After header via parseRetryAfterMs");
  }
  if (/status\s*===\s*429[\s\S]{0,80}return\s+null/.test(fmcsaClient)) {
    failures.push("fmcsa-client must not swallow 429 as null");
  }
  if (!/if\s*\(\s*mobileRetryable\s*\)\s*throw\s+mobileRetryable/.test(fmcsaClient)) {
    failures.push("fmcsa-client must rethrow mobileRetryable when SAFER returns null (no 429→null collapse)");
  }
  if (!/if\s*\(\s*mobilePermanent\s*\)\s*throw\s+mobilePermanent/.test(fmcsaClient)) {
    failures.push("fmcsa-client must rethrow mobilePermanent when SAFER misses (no permanent→not-found collapse)");
  }
  if (!/FmcsaPermanentError/.test(fmcsaClient)) {
    failures.push("fmcsa-client must classify non-404 4xx as permanent");
  }
  void fmcsaLit;
  void chainCode;

  if (!/isFmcsaRetryableError/.test(safer) && !/RetryableFmcsaError/.test(safer)) {
    failures.push("safer.service must rethrow retryable without last_checked stamp");
  }
  if (!/isFmcsaPermanentError/.test(safer) && !/FmcsaPermanentError/.test(safer)) {
    failures.push("safer.service must rethrow permanent without last_checked stamp");
  }

  if (!/FmcsaCustomerVerifyHandler/.test(registry)) {
    failures.push("outbox registry must register FmcsaCustomerVerifyHandler");
  }
  if (!/computeOutboxRetryDelayMs/.test(backoff) || !/jitter/i.test(backoff)) {
    failures.push("retry-backoff must implement bounded exponential backoff + jitter");
  }
  if (!/PermanentDeliveryError/.test(deliveryErrors)) {
    failures.push("delivery-errors.ts must export PermanentDeliveryError");
  }

  if (!/ON CONFLICT/i.test(dbTestLit) && !/ON CONFLICT/i.test(dbTestCode)) {
    failures.push("db integration test must exercise real PG partial unique index concurrent dedupe");
  }
  if (!dbTestLit.includes("ux_outbox_events_dedupe_key") && !/ux_outbox_events_dedupe_key/.test(dbTestCode)) {
    failures.push("db integration test must exercise real PG partial unique index concurrent dedupe");
  }
  if (!/ROLLBACK/.test(dbTestLit) || !/re-enqueue/i.test(dbTestLit)) {
    failures.push("db integration test must cover same-txn rollback and terminal re-enqueue");
  }

  if (!fs.existsSync(paths.verifyStep) && sources.verifyStep === undefined) {
    failures.push("Rule-17 verify-step 913-verify-fmcsa-fire-and-forget-retry.mjs must exist");
  } else if (sources.verifyStep !== undefined && !String(sources.verifyStep).includes("--selftest")) {
    failures.push("verify-step must invoke --selftest");
  }

  return failures;
}

function loadLive() {
  return {
    customersRoutes: read(paths.customersRoutes),
    chain: read(paths.chain),
    safer: read(paths.safer),
    errors: read(paths.errors),
    httpErrors: read(paths.httpErrors),
    fmcsaClient: read(paths.fmcsaClient),
    handler: read(paths.handler),
    registry: read(paths.registry),
    processor: read(paths.processor),
    reusableDedupe: read(paths.reusableDedupe),
    backoff: read(paths.backoff),
    deliveryErrors: read(paths.deliveryErrors),
    verifyStep: read(paths.verifyStep),
    dbTest: read(paths.dbTest),
  };
}

function selftestLexer() {
  // Must not strip comment-like text inside strings / templates (preserve via stringLiterals).
  const sample = `
    const url = "http://example.com/path"; // real comment
    const decoy = "/* not a block comment */";
    const tpl = \`SELECT 1 -- sql comment stays in sqlTemplates\`;
    const live = 1; /* block */
    if (mobileRetryable) throw mobileRetryable;
  `;
  const { code, sqlTemplates, stringLiterals } = toExecutableSemantics(sample);
  if (/real comment/.test(code)) {
    throw new Error("lexer failed to strip real line comment");
  }
  if (!stringLiterals.some((s) => s.includes("http://example.com/path"))) {
    throw new Error("lexer must preserve // inside double-quoted strings via stringLiterals");
  }
  if (!stringLiterals.some((s) => s.includes("/* not a block comment */"))) {
    throw new Error("lexer must preserve block-comment-like text inside strings via stringLiterals");
  }
  if (/http:\/\/example\.com/.test(code)) {
    throw new Error("executable skeleton must mask string bodies (decoy immunity)");
  }
  if (!/const\s+live\s*=\s*1/.test(code)) {
    throw new Error("mask must preserve executable identifiers");
  }
  if (!/if\s*\(\s*mobileRetryable\s*\)\s*throw\s+mobileRetryable/.test(code)) {
    throw new Error("mask must preserve executable throw statements");
  }
  if (!sqlTemplates.some((s) => /SELECT\s+1/.test(s))) {
    throw new Error("lexer must extract SQL-like template literals");
  }
  // Regex with apostrophe in a character class must not swallow following code.
  const withRe = `const re = /^(.*?)(?:\\s+([A-Za-z .'-]+))$/;\nif (mobileRetryable) throw mobileRetryable;`;
  const reCode = toExecutableSemantics(withRe).code;
  if (!/if\s*\(\s*mobileRetryable\s*\)\s*throw\s+mobileRetryable/.test(reCode)) {
    throw new Error("lexer must treat /…'…/ regex literals without entering string state");
  }
}

function selftest() {
  selftestLexer();
  const live = loadLive();
  const good = collectFailures(live);
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — live sources should pass before selftest`);
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const plants = [
    {
      name: "fire-and-forget void",
      mutate: (s) => ({
        ...s,
        customersRoutes: s.customersRoutes.replace(/await enqueueFmcsaCustomerVerifyRequested/g, "void verifyCustomerWithSafer"),
      }),
      expect: (f) => f.some((x) => /void verifyCustomerWithSafer|enqueue/i.test(x)),
    },
    {
      name: "bad conflict target (missing WHERE predicate)",
      mutate: (s) => ({
        ...s,
        chain: s.chain.replace(
          /ON CONFLICT\s*\(\s*dedupe_key\s*\)\s*WHERE\s+dedupe_key\s+IS\s+NOT\s+NULL\s+DO\s+NOTHING/gi,
          "ON CONFLICT (dedupe_key) DO NOTHING"
        ),
      }),
      expect: (f) => f.some((x) => /WHERE dedupe_key IS NOT NULL|partial unique/i.test(x)),
    },
    {
      name: "comment decoy: wrong ON CONFLICT hidden behind comment tokens",
      mutate: (s) => ({
        ...s,
        // Wrong predicate in the SQL template; correct tokens only in a JS comment (outside SQL).
        chain:
          `/* ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING */\n` +
          s.chain.replace(
            /ON CONFLICT\s*\(\s*dedupe_key\s*\)\s*WHERE\s+dedupe_key\s+IS\s+NOT\s+NULL\s+DO\s+NOTHING/gi,
            "ON CONFLICT (dedupe_key) DO NOTHING"
          ),
      }),
      expect: (f) => f.some((x) => /WHERE dedupe_key IS NOT NULL|partial unique/i.test(x)),
    },
    {
      name: "lifetime reenqueue blocked (no dedupe release)",
      mutate: (s) => ({
        ...s,
        processor: s.processor.replace(/dedupe_key = NULL/g, "/* removed */"),
      }),
      expect: (f) => f.some((x) => /release dedupe_key|lifetime re-enqueue/i.test(x)),
    },
    {
      name: "comment decoy: commented dedupe release",
      mutate: (s) => ({
        ...s,
        // Tokens only in a JS comment; executable string no longer releases the key.
        processor:
          `/* dedupe_key = NULL */\n` +
          s.processor.replace(/dedupe_key = NULL/g, "/* cleared */"),
      }),
      expect: (f) => f.some((x) => /release dedupe_key|lifetime re-enqueue/i.test(x)),
    },
    {
      name: "429 swallowed as null",
      mutate: (s) => ({
        ...s,
        fmcsaClient: s.fmcsaClient.replace(/if \(status === 429\) return "retryable";/, 'if (status === 429) return null;'),
      }),
      expect: (f) => f.some((x) => /429/i.test(x)),
    },
    {
      name: "mobileRetryable discarded on SAFER null",
      mutate: (s) => ({
        ...s,
        fmcsaClient: s.fmcsaClient.replace(/if\s*\(\s*mobileRetryable\s*\)\s*throw\s+mobileRetryable;/g, "/* gone */"),
      }),
      expect: (f) => f.some((x) => /mobileRetryable|429→null/i.test(x)),
    },
    {
      name: "comment decoy: commented-out mobile retry throw",
      mutate: (s) => ({
        ...s,
        fmcsaClient: s.fmcsaClient.replace(
          /if\s*\(\s*mobileRetryable\s*\)\s*throw\s+mobileRetryable;/g,
          "// if (mobileRetryable) throw mobileRetryable;"
        ),
      }),
      expect: (f) => f.some((x) => /mobileRetryable|429→null/i.test(x)),
    },
    {
      name: "mobilePermanent discarded on SAFER miss",
      mutate: (s) => ({
        ...s,
        fmcsaClient: s.fmcsaClient.replace(/if\s*\(\s*mobilePermanent\s*\)\s*throw\s+mobilePermanent;/g, "/* gone */"),
      }),
      expect: (f) => f.some((x) => /mobilePermanent|permanent→not-found/i.test(x)),
    },
    {
      name: "missing Retry-After parse",
      mutate: (s) => ({
        ...s,
        httpErrors: s.httpErrors.replace(/parseRetryAfterMs/g, "parseRetryAfterMissing"),
        fmcsaClient: s.fmcsaClient.replace(/parseRetryAfterMs/g, "parseRetryAfterMissing"),
      }),
      expect: (f) => f.some((x) => /Retry-After|parseRetryAfter/i.test(x)),
    },
    {
      name: "manual swallow retryable",
      mutate: (s) => ({
        ...s,
        customersRoutes: s.customersRoutes
          .replace(/fmcsa_verify_retryable/g, "fmcsa_ok")
          .replace(/reply\.code\(503\)/g, "reply.code(200)"),
      }),
      expect: (f) => f.some((x) => /503|fmcsa_verify_retryable|fake completion/i.test(x)),
    },
    {
      name: "comment decoy: fake manual 200 with 503 tokens only in comments",
      mutate: (s) => ({
        ...s,
        customersRoutes: s.customersRoutes.replace(
          /return reply\.code\(503\)\.send\(\{[\s\S]*?fmcsa_verify_retryable[\s\S]*?\}\);/,
          `/* return reply.code(503).send({ error: "fmcsa_verify_retryable", retryable: true }); */
        return reply.code(200).send({ ok: true });`
        ),
      }),
      expect: (f) => f.some((x) => /503|fmcsa_verify_retryable|fake completion/i.test(x)),
    },
    {
      name: "cache-poison path (safer drops retryable rethrow)",
      mutate: (s) => ({
        ...s,
        safer: s.safer.replace(/isFmcsaRetryableError/g, "isNeverRetryable").replace(/RetryableFmcsaError/g, "NeverRetryable"),
      }),
      expect: (f) => f.some((x) => /rethrow retryable|last_checked/i.test(x)),
    },
    {
      name: "comment decoy: commented safer identifiers",
      mutate: (s) => ({
        ...s,
        safer: s.safer
          .replace(/isFmcsaRetryableError/g, "/* isFmcsaRetryableError */ false")
          .replace(/RetryableFmcsaError/g, "/* RetryableFmcsaError */ Error")
          .replace(/isFmcsaPermanentError/g, "/* isFmcsaPermanentError */ false")
          .replace(/FmcsaPermanentError/g, "/* FmcsaPermanentError */ Error"),
      }),
      expect: (f) => f.some((x) => /rethrow retryable|last_checked|rethrow permanent/i.test(x)),
    },
    {
      name: "missing verify-fmcsa rateLimit",
      mutate: (s) => ({
        ...s,
        customersRoutes: s.customersRoutes.replace(
          /app\.post\(\s*"\/api\/v1\/mdata\/customers\/:id\/verify-fmcsa"\s*,\s*RL_FMCSA_VERIFY\s*,/,
          'app.post("/api/v1/mdata/customers/:id/verify-fmcsa",'
        ),
      }),
      expect: (f) => f.some((x) => /rateLimit|js\/missing-rate-limiting/i.test(x)),
    },
    {
      name: "comment decoy: rateLimit only in comments on verify-fmcsa",
      mutate: (s) => ({
        ...s,
        customersRoutes: s.customersRoutes
          .replace(
            /app\.post\(\s*"\/api\/v1\/mdata\/customers\/:id\/verify-fmcsa"\s*,\s*RL_FMCSA_VERIFY\s*,/,
            'app.post("/api/v1/mdata/customers/:id/verify-fmcsa", /* RL_FMCSA_VERIFY rateLimit: { max: 20 } */'
          )
          .replace(
            /const RL_FMCSA_VERIFY = \{ config: \{ rateLimit: \{ max: 20, timeWindow: "1 minute" \} \} \} as const;/,
            "/* const RL_FMCSA_VERIFY = { config: { rateLimit: { max: 20, timeWindow: \"1 minute\" } } } as const; */"
          ),
      }),
      expect: (f) => f.some((x) => /rateLimit|js\/missing-rate-limiting/i.test(x)),
    },
    {
      name: "string decoy: mobileRetryable throw only inside a string",
      mutate: (s) => ({
        ...s,
        fmcsaClient: s.fmcsaClient.replace(
          /if\s*\(\s*mobileRetryable\s*\)\s*throw\s+mobileRetryable;/g,
          'const _decoy = "if (mobileRetryable) throw mobileRetryable";'
        ),
      }),
      expect: (f) => f.some((x) => /mobileRetryable|429→null/i.test(x)),
    },
  ];

  for (const plant of plants) {
    const planted = collectFailures(plant.mutate(live));
    if (!plant.expect(planted)) {
      console.error(`${LABEL} SELFTEST FAIL — plant "${plant.name}" not detected`);
      console.error(planted);
      process.exit(1);
    }
  }

  console.log(`${LABEL} SELFTEST PASS (${plants.length} plants + lexer)`);
}

function main() {
  const failures = collectFailures(loadLive());

  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`${LABEL} OK — FMCSA SAFER durable outbox retry (executable semantics + rateLimit + lifetime reenqueue)`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
