// 1502-verify-saf-b12-external-fine-lifecycle-actions-wired — SAF-B12.
//
// THE DEFECT THIS PINS (verified on origin/main @ b76057fc27):
// Four external-fine lifecycle routes on safety.civil_fines were fully built, role-gated and audited
// in apps/backend/src/safety/fines.routes.ts —
//     contest      :463   POST /api/v1/safety/fines/:id/contest
//     dismiss      :494   POST /api/v1/safety/fines/:id/dismiss
//     reduce       :525   POST /api/v1/safety/fines/:id/reduce
//     link-payment :616   POST /api/v1/safety/fines/:id/link-payment
// — and had ZERO frontend callers. apps/frontend/src/api/safety.ts exported no client function for any
// of them, and FineDetailDrawer.tsx rendered exactly one action, "Convert to Driver Liability". An
// operator handed a wrongly-issued authority citation could not contest it, could not dismiss it, could
// not record a negotiated reduction and could not point it at the bank transaction that paid it. The
// only exit the UI offered was to push the whole amount onto a driver.
//
// WHAT THIS GUARD ASSERTS (not "a file exists" — the real wire, end to end):
//   1. The four routes still exist in the backend under those exact paths. If a route is renamed the
//      guard fails loudly instead of quietly certifying a caller that now 404s.
//   2. apps/frontend/src/api/safety.ts exports, for EACH action, a function that POSTs to that exact
//      route path.
//   3. Each of those exported functions is imported AND invoked from a file reachable by following
//      relative imports out of FineDetailDrawer.tsx — i.e. a caller the operator can actually reach,
//      not a dead export.
//   4. The UI state-gating MIRRORS the server rule rather than replacing or ignoring it:
//        · fines.routes.ts refuses `reduce` on a voided fine (409 fine_voided) AND on a fine that
//          already carries converted_to_liability_id (409 fine_already_converted_to_liability, OWNER
//          RULING 2026-07-23 Option B). The Reduce control must therefore be `disabled` by an
//          expression built from BOTH `voided_at` AND `converted_to_liability_id`.
//        · contest and dismiss carry the server predicate `voided_at IS NULL`. Both controls must be
//          `disabled` by an expression built from `voided_at`.
//   5. The frontend role gate is the SAME role set as canMutate() in fines.routes.ts. If the backend
//      adds or removes a role, this fails until the UI is brought back in step.
//
// SELFTEST: run() first executes the identical assertion suite against embedded PRE-FIX fixtures and
// REQUIRES it to report problems. Two fixtures, not one:
//   (a) the real origin/main shape — no callers at all;
//   (b) a "callers wired but Reduce not gated on converted_to_liability_id" shape.
// (b) exists so the guard cannot degrade into a caller-existence grep that passes on a UI which 409s
// the operator. If either fixture stops failing, this step throws — a guard that only passes on the
// fix is worthless, and a selftest that cannot fail is worse.
//
// Wired ONLY here (scripts/verify-steps/1502-*.mjs). No sibling script, no package.json entry.
import fs from "node:fs";
import path from "node:path";

const ROUTES_REL = "apps/backend/src/safety/fines.routes.ts";
const API_REL = "apps/frontend/src/api/safety.ts";
const DRAWER_REL = "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx";

/** The four lifecycle routes, and the JSX test id of the control that must trigger each one. */
const ACTIONS = [
  { action: "contest", testId: "fine-contest-btn" },
  { action: "dismiss", testId: "fine-dismiss-btn" },
  { action: "reduce", testId: "fine-reduce-btn" },
  { action: "link-payment", testId: "fine-link-payment-btn" },
];

/**
 * Server-mirrored gating contract, keyed by action. `gateTokens` are the fine columns the SERVER
 * predicates on; the UI's disabled-expression must be derived from all of them.
 * link-payment is deliberately absent: fines.routes.ts:616 holds NO state predicate beyond
 * id + operating_company_id, so inventing a client-side gate would block a lawful action.
 */
const SERVER_GATES = {
  contest: ["voided_at"],
  dismiss: ["voided_at"],
  reduce: ["voided_at", "converted_to_liability_id"],
};

// ── generic source helpers ───────────────────────────────────────────────────────────────────────

/** Read a balanced-delimiter slice starting at `from`, stopping at the first `;` at depth 0. */
function statementFrom(src, from) {
  let depth = 0;
  for (let i = from; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    else if (ch === ";" && depth <= 0) return src.slice(from, i + 1);
  }
  return src.slice(from);
}

/** Full text of `const <name> = …;` (or `const <name>: T = …;`), or null. */
function constInitializer(src, name) {
  const re = new RegExp(`\\bconst\\s+${name}\\b[^=;\\n]*=`);
  const m = re.exec(src);
  if (!m) return null;
  return statementFrom(src, m.index);
}

/**
 * The opening JSX tag that carries `data-testid="<id>"`. Walks back to the nearest `<` that begins an
 * element, then forward to the `>` that closes the opening tag at brace depth 0 — so a `=>` inside an
 * `onClick={() => …}` attribute does not terminate it early.
 */
function openingTagWithTestId(src, testId) {
  const anchor = src.indexOf(`data-testid="${testId}"`);
  if (anchor === -1) return null;
  let start = -1;
  for (let i = anchor; i >= 0; i -= 1) {
    if (src[i] === "<" && /[A-Za-z]/.test(src[i + 1] ?? "")) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0 && i > start) return src.slice(start, i + 1);
  }
  return null;
}

/** Every identifier referenced inside the tag's `disabled={…}` attribute. */
function disabledExpressionIdentifiers(tag) {
  const at = tag.indexOf("disabled=");
  if (at === -1) return null;
  const open = tag.indexOf("{", at);
  if (open === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = open; i < tag.length; i += 1) {
    if (tag[i] === "{") depth += 1;
    else if (tag[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const expr = tag.slice(open + 1, end);
  return { expr, identifiers: [...new Set(expr.match(/[A-Za-z_$][\w$]*/g) ?? [])] };
}

/** Exported top-level function blocks of a module, as { name, body }. */
function exportedFunctionBlocks(src) {
  const re = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
  const starts = [];
  let m;
  while ((m = re.exec(src)) !== null) starts.push({ name: m[1], index: m.index });
  return starts.map((s, i) => ({
    name: s.name,
    body: src.slice(s.index, i + 1 < starts.length ? starts[i + 1].index : src.length),
  }));
}

/** The `reduce` route handler body, sliced from its app.post( to the next app.post(. */
function routeHandlerBody(routesSrc, action) {
  const needle = `app.post("/api/v1/safety/fines/:id/${action}"`;
  const at = routesSrc.indexOf(needle);
  if (at === -1) return null;
  const next = routesSrc.indexOf("app.post(", at + needle.length);
  return routesSrc.slice(at, next === -1 ? routesSrc.length : next);
}

/** The role list inside `function canMutate(role: string) { return [ … ] }`. */
function backendMutateRoles(routesSrc) {
  const m = /function\s+canMutate\s*\([^)]*\)\s*\{[\s\S]*?return\s*\[([^\]]*)\]/.exec(routesSrc);
  if (!m) return null;
  return (m[1].match(/"([^"]+)"/g) ?? []).map((s) => s.slice(1, -1));
}

// ── the assertion suite (pure: takes a source map, returns problems) ─────────────────────────────

/**
 * @param {object} input
 * @param {string} input.routesSrc            fines.routes.ts
 * @param {string} input.apiSrc               api/safety.ts
 * @param {Map<string,string>} input.tree     relPath → source, for FineDetailDrawer.tsx and every
 *                                            file transitively imported from it.
 * @returns {string[]} problems (empty === wired correctly)
 */
export function findProblems({ routesSrc, apiSrc, tree }) {
  const problems = [];

  if (!tree.has(DRAWER_REL)) {
    problems.push(`component tree does not contain ${DRAWER_REL}`);
    return problems;
  }

  const roles = backendMutateRoles(routesSrc);
  if (!roles || roles.length === 0) {
    problems.push(`could not read canMutate() role list out of ${ROUTES_REL}`);
  }

  for (const { action, testId } of ACTIONS) {
    // (1) the backend route still exists under this exact path
    const routePath = `/api/v1/safety/fines/:id/${action}`;
    if (!routesSrc.includes(`app.post("${routePath}"`)) {
      problems.push(`${ROUTES_REL} no longer registers POST ${routePath} — the frontend caller would 404`);
      continue;
    }

    // (2) api/safety.ts exports a POST caller for it
    const pathRe = new RegExp(`/api/v1/safety/fines/\\$\\{[^}]+\\}/${action}\\?`);
    const clients = exportedFunctionBlocks(apiSrc).filter(
      (fn) => pathRe.test(fn.body) && /method:\s*"POST"/.test(fn.body)
    );
    if (clients.length === 0) {
      problems.push(
        `${API_REL} exports NO function that POSTs to /api/v1/safety/fines/\${id}/${action} — the ` +
          `route is built and audited but unreachable from the UI (this is the SAF-B12 defect)`
      );
      continue;
    }

    // (3) that caller is imported AND invoked somewhere in the drawer's component tree
    const callerNames = clients.map((c) => c.name);
    let callerFile = null;
    let callerName = null;
    for (const [rel, src] of tree) {
      for (const name of callerNames) {
        const imported = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["'][^"']*api/safety["']`, "s").test(src);
        const invoked = new RegExp(`\\b${name}\\s*\\(`).test(src);
        if (imported && invoked) {
          callerFile = rel;
          callerName = name;
          break;
        }
      }
      if (callerFile) break;
    }
    if (!callerFile) {
      problems.push(
        `${callerNames.join("/")} is exported but never imported+invoked from anything reachable out of ` +
          `${DRAWER_REL} — a dead export is not a wired action`
      );
      continue;
    }
    const callerSrc = tree.get(callerFile);

    // (4) the control exists and its state-gating mirrors the server
    const tag = openingTagWithTestId(callerSrc, testId);
    if (!tag) {
      problems.push(`${callerFile} has no control carrying data-testid="${testId}" for the ${action} action`);
      continue;
    }

    const gateTokens = SERVER_GATES[action];
    if (!gateTokens) continue; // link-payment: server holds no state predicate, so neither do we

    // The server rule must still BE there — otherwise we are mirroring a rule that no longer exists.
    const handler = routeHandlerBody(routesSrc, action) ?? "";
    for (const token of gateTokens) {
      if (!handler.includes(token)) {
        problems.push(
          `${ROUTES_REL} ${action} handler no longer predicates on ${token}; the UI gate below now ` +
            `mirrors a rule that changed — re-derive it from the handler`
        );
      }
    }

    const disabled = disabledExpressionIdentifiers(tag);
    if (!disabled) {
      problems.push(
        `${callerFile} data-testid="${testId}" has no disabled={…} attribute; the server refuses this ` +
          `action on ${gateTokens.join(" / ")} and an ungated control just 409s the operator`
      );
      continue;
    }

    // Resolve the disabled expression through its const initializers — transitively, to a fixed point,
    // because a readable gate is normally written in two hops
    // (`disabled={reduceBlockedReason}` → `const reduceBlockedReason = isVoided ? … : converted ? … : null`
    //  → `const isVoided = Boolean(fine.voided_at)`). A one-hop walk would demand the tokens be crammed
    // into a single expression, which is a style rule, not a correctness rule.
    let resolved = disabled.expr;
    const seen = new Set();
    let frontier = disabled.identifiers;
    for (let hop = 0; hop < 6 && frontier.length > 0; hop += 1) {
      const next = [];
      for (const id of frontier) {
        if (seen.has(id)) continue;
        seen.add(id);
        const init = constInitializer(callerSrc, id);
        if (!init) continue;
        resolved += `\n${init}`;
        for (const child of init.match(/[A-Za-z_$][\w$]*/g) ?? []) {
          if (!seen.has(child)) next.push(child);
        }
      }
      frontier = next;
    }
    for (const token of gateTokens) {
      if (!resolved.includes(token)) {
        problems.push(
          `${callerFile} data-testid="${testId}" is not gated on ${token}. fines.routes.ts refuses ` +
            `${action} on that state, so the control must be disabled with a stated reason instead of ` +
            `firing a request the server will reject.`
        );
      }
    }

    // (5) frontend role gate === backend canMutate role set
    if (roles && roles.length > 0) {
      const missing = roles.filter((r) => !callerSrc.includes(`"${r}"`));
      if (missing.length > 0) {
        problems.push(
          `${callerFile} role gate does not mirror canMutate() in ${ROUTES_REL}; missing ${missing.join(", ")}`
        );
      }
    }
  }

  return [...new Set(problems)];
}

// ── real-repo source loading ─────────────────────────────────────────────────────────────────────

const IMPORT_RE = /from\s+["'](\.[^"']+)["']/g;
const EXTS = [".tsx", ".ts", "/index.tsx", "/index.ts"];

function loadTree(root, entryRel, maxDepth = 4) {
  const tree = new Map();
  const queue = [{ rel: entryRel, depth: 0 }];
  while (queue.length > 0) {
    const { rel, depth } = queue.shift();
    if (tree.has(rel)) continue;
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, "utf8");
    tree.set(rel, src);
    if (depth >= maxDepth) continue;
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(src)) !== null) {
      const base = path.normalize(path.join(path.dirname(rel), m[1]));
      for (const ext of EXTS) {
        const candidate = `${base}${ext}`;
        if (fs.existsSync(path.join(root, candidate))) {
          queue.push({ rel: candidate, depth: depth + 1 });
          break;
        }
      }
    }
  }
  return tree;
}

// ── PRE-FIX fixtures — the selftest's teeth ──────────────────────────────────────────────────────
// Faithful reductions of the two shapes this guard must reject.

/** (a) origin/main: api/safety.ts has only convertFineToLiability; the drawer has only Convert. */
const PREFIX_API_NO_CALLERS = `
import { apiRequest } from "./client";
function q(companyId) { return \`operating_company_id=\${companyId}\`; }
export function getSafetyFines(companyId) {
  return apiRequest(\`/api/v1/safety/fines?\${q(companyId)}\`);
}
export function convertFineToLiability(fineId, companyId) {
  return apiRequest(\`/api/v1/safety/fines/\${fineId}/convert-to-liability?\${q(companyId)}\`, { method: "POST" });
}
`;

const PREFIX_DRAWER_CONVERT_ONLY = `
export function FineDetailDrawer({ open, fine, converting, onClose, onConvertToLiability }) {
  if (!open || !fine) return null;
  return (
    <ParityDrawer open onClose={onClose} title="Fine Detail">
      <button type="button" onClick={() => setConfirmOpen(true)}>Convert to Driver Liability</button>
    </ParityDrawer>
  );
}
`;

/** (b) all four callers wired, but Reduce is gated on voided_at only — it will 409 on a converted fine. */
const HALFFIX_API_ALL_CALLERS = `
import { apiRequest } from "./client";
function q(companyId) { return \`operating_company_id=\${companyId}\`; }
export function contestSafetyFine(fineId, companyId, notes) {
  return apiRequest(\`/api/v1/safety/fines/\${fineId}/contest?\${q(companyId)}\`, { method: "POST", body: { notes } });
}
export function dismissSafetyFine(fineId, companyId, notes) {
  return apiRequest(\`/api/v1/safety/fines/\${fineId}/dismiss?\${q(companyId)}\`, { method: "POST", body: { notes } });
}
export function reduceSafetyFine(fineId, companyId, body) {
  return apiRequest(\`/api/v1/safety/fines/\${fineId}/reduce?\${q(companyId)}\`, { method: "POST", body });
}
export function linkSafetyFinePayment(fineId, companyId, body) {
  return apiRequest(\`/api/v1/safety/fines/\${fineId}/link-payment?\${q(companyId)}\`, { method: "POST", body });
}
`;

const HALFFIX_DRAWER_UNGATED_REDUCE = `
import { contestSafetyFine, dismissSafetyFine, linkSafetyFinePayment, reduceSafetyFine } from "../../../api/safety";
const ROLES = ["Owner", "Administrator", "Safety"];
export function FineDetailDrawer({ fine, operatingCompanyId }) {
  const isVoided = Boolean(fine.voided_at);
  const statusBlocked = isVoided;
  const reduceBlocked = isVoided;
  return (
    <div>
      <button type="button" disabled={statusBlocked} data-testid="fine-contest-btn"
        onClick={() => contestSafetyFine(fine.id, operatingCompanyId)}>Contest Fine</button>
      <button type="button" disabled={statusBlocked} data-testid="fine-dismiss-btn"
        onClick={() => dismissSafetyFine(fine.id, operatingCompanyId)}>Dismiss Fine</button>
      <button type="button" disabled={reduceBlocked} data-testid="fine-reduce-btn"
        onClick={() => reduceSafetyFine(fine.id, operatingCompanyId, {})}>Reduce Fine</button>
      <button type="button" data-testid="fine-link-payment-btn"
        onClick={() => linkSafetyFinePayment(fine.id, operatingCompanyId, {})}>Link Payment</button>
    </div>
  );
}
`;

function selftest(routesSrc) {
  const cases = [
    {
      label: "PRE-FIX (origin/main shape): four routes, zero frontend callers",
      apiSrc: PREFIX_API_NO_CALLERS,
      tree: new Map([[DRAWER_REL, PREFIX_DRAWER_CONVERT_ONLY]]),
      mustMention: "unreachable from the UI",
    },
    {
      label: "HALF-FIX: callers wired, Reduce NOT gated on converted_to_liability_id",
      apiSrc: HALFFIX_API_ALL_CALLERS,
      tree: new Map([[DRAWER_REL, HALFFIX_DRAWER_UNGATED_REDUCE]]),
      mustMention: "not gated on converted_to_liability_id",
    },
  ];

  for (const c of cases) {
    const problems = findProblems({ routesSrc, apiSrc: c.apiSrc, tree: c.tree });
    if (problems.length === 0) {
      throw new Error(
        `SAF-B12 guard SELFTEST FAILED — the assertion suite reported ZERO problems for "${c.label}". ` +
          `A guard that passes on the pre-fix shape proves nothing. Fix the guard, not the fixture.`
      );
    }
    if (!problems.some((p) => p.includes(c.mustMention))) {
      throw new Error(
        `SAF-B12 guard SELFTEST FAILED — "${c.label}" produced problems, but none mentioning ` +
          `"${c.mustMention}". The guard is failing for the wrong reason:\n  - ${problems.join("\n  - ")}`
      );
    }
    console.log(`  selftest OK — rejected: ${c.label} (${problems.length} problem(s))`);
  }
}

export default {
  name: "verify:saf-b12-external-fine-lifecycle-actions-wired",
  run(ctx) {
    const root = ctx.ROOT;
    const routesAbs = path.join(root, ROUTES_REL);
    const apiAbs = path.join(root, API_REL);
    for (const abs of [routesAbs, apiAbs, path.join(root, DRAWER_REL)]) {
      if (!fs.existsSync(abs)) {
        throw new Error(`SAF-B12 guard: expected file is missing — ${path.relative(root, abs)}`);
      }
    }
    const routesSrc = fs.readFileSync(routesAbs, "utf8");
    const apiSrc = fs.readFileSync(apiAbs, "utf8");

    // Teeth first: the suite must reject the pre-fix and half-fix shapes.
    selftest(routesSrc);

    const tree = loadTree(root, DRAWER_REL);
    const problems = findProblems({ routesSrc, apiSrc, tree });
    if (problems.length > 0) {
      throw new Error(
        `SAF-B12 — external-fine lifecycle actions are not wired to the UI:\n  - ${problems.join("\n  - ")}`
      );
    }
    console.log(
      `  SAF-B12 OK — contest / dismiss / reduce / link-payment each have a live caller reachable from ` +
        `${DRAWER_REL} (tree: ${tree.size} files), and the UI gates mirror fines.routes.ts.`
    );
    return 0;
  },
};
