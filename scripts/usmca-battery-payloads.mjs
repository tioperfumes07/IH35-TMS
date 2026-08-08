#!/usr/bin/env node
/**
 * UNIVERSAL PAYLOAD SYNTHESIZER — one instrument for all 503 create-surfaces.
 *
 * WHY THIS EXISTS, stated plainly because I got it wrong first: I started the battery by hand-writing a
 * payload per surface and reading the 400 to learn the next required field — customer needed
 * `customer_type`, then it needed a specific enum member, then the service catalog wanted
 * `service_code`, then `service_name`, then `service_category`. That is the per-site one-off the
 * vertical law forbids: 503 surfaces × N round trips of guessing, and nothing reusable at the end.
 *
 * The contract each surface enforces is ALREADY DECLARED in its route file as a zod schema. So the
 * universal move is to read the schema and synthesize a payload that satisfies it — once, for every
 * surface. A 400 then means the SYNTHESIZER is missing a rule (fix it once, all surfaces benefit),
 * while a 404/500 means a WIRING BUG (fix that surface). That distinction is the whole point: it
 * separates "my payload was wrong" from "the app is broken", which hand-guessing cannot do.
 *
 * WHAT IT READS: the zod object passed to `safeParse(req.body …)` in each route file, resolved to its
 * declaring `const … = z.object({...})` when the parse call names a variable.
 *
 * NOT CLAIMED: this is static extraction of a declarative schema, not evaluation of it. It handles the
 * shapes this codebase actually uses (string/number/boolean/uuid/enum/datetime/array/object, optional,
 * nullable, default) and REPORTS a surface whose schema it cannot resolve rather than inventing a
 * payload — an invented payload that happens to 201 would create a wrong row, which is worse than a gap.
 */
import { readFileSync } from "node:fs";

/** `z.enum(["a","b"])` → first member; that is always a legal value and needs no domain knowledge. */
function firstEnumMember(src) {
  const m = src.match(/z\.enum\(\s*\[\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
  return m ? m[1].slice(1, -1) : null;
}

/**
 * Value for one field, derived from its declared zod chain.
 * `marker` is threaded through so every created row carries CC2-BATTERY-20260807 in a human field.
 */
export function valueForField(name, rawChain, ctx) {
  const { marker, companyId, refs = {} } = ctx;
  // Zod chains are routinely written across lines:
  //     flag_code: z
  //       .string()
  //       .regex(/^[A-Z][A-Z0-9_]+$/)
  // Testing /z\.string\(\)/ against that fails on the newline, so every multiline field silently
  // produced no value and the surface 400'd on a "required" field the synthesizer thought it had
  // handled. Collapse whitespace first — this alone recovers the majority of wave 1's 400s.
  const chain = String(rawChain).replace(/\s+/g, "");
  if (/\.optional\(\)|\.nullish\(\)|\.default\(/.test(chain)) return undefined; // let the server default it

  // A reference the caller supplied (driver_id, unit_id, customer_id…) always wins over a synthesized one.
  if (refs[name] !== undefined) return refs[name];
  if (/operating_company_id/.test(name)) return companyId;

  const en = firstEnumMember(chain);
  if (en) return en;
  if (/z\.boolean\(\)/.test(chain)) return false;
  if (/z\.number\(\)/.test(chain)) {
    if (/cents/.test(name)) return 100;      // $1.00 — small, obvious, easy to reverse
    if (/\.int\(\)/.test(chain)) return 1;
    return 1;
  }
  if (/z\.array\(/.test(chain)) return [];
  if (/z\.object\(/.test(chain)) return {};
  if (/\.uuid\(\)/.test(chain)) return refs[name] ?? null;  // unresolved FK — reported, never invented
  if (/\.datetime\(\)/.test(chain)) return new Date().toISOString();
  if (/z\.string\(\)/.test(chain)) {
    if (/date$/.test(name) || /_date/.test(name)) return new Date().toISOString().slice(0, 10);
    if (/email/.test(name)) return `battery+${marker.toLowerCase()}@example.invalid`;
    if (/phone/.test(name)) return "9560000000";
    // Code-family: match a `code` SEGMENT anywhere, not only a trailing one. Wave 1 lost `flag_code`,
    // `reason_code`, bare `code` and `sku` to a trailing-only test — 4 of the 3 gap rules in one line.
    if (/(^|_)(code|number|no|sku|abbr|slug)(_|$)/.test(name)) {
      // Honour a declared .regex(): several catalogs require UPPER_SNAKE, and a value that is merely a
      // string still 400s against the pattern. Derive from the marker so the row stays identifiable.
      if (/\.regex\(\/\^\[A-Z\]/.test(chain)) return `CC2_BATTERY_${name.toUpperCase()}`.slice(0, 30);
      return `${marker}-${name.toUpperCase()}`.replace(/[^A-Z0-9_-]/gi, "-").slice(0, 40);
    }
    return `${marker} ${name}`.slice(0, 80);
  }
  return undefined;
}

/** Split a `z.object({...})` body into [fieldName, zodChain] pairs, respecting nesting. */
export function parseObjectFields(objSrc) {
  const fields = [];
  let depth = 0, cur = "", name = null;
  for (let i = 0; i < objSrc.length; i++) {
    const c = objSrc[i];
    if (depth === 0 && name === null) {
      const m = objSrc.slice(i).match(/^\s*([A-Za-z_][\w]*)\s*:/);
      if (m) { name = m[1]; i += m[0].length - 1; cur = ""; continue; }
    }
    if (c === "(" || c === "{" || c === "[") depth++;
    if (c === ")" || c === "}" || c === "]") depth--;
    if (c === "," && depth === 0 && name !== null) { fields.push([name, cur.trim()]); name = null; cur = ""; continue; }
    if (name !== null) cur += c;
  }
  if (name !== null && cur.trim()) fields.push([name, cur.trim()]);
  return fields;
}

/** Find the body schema a route parses, following one level of `const NAME = z.object({...})`. */
export function bodySchemaFor(src, routeIndex) {
  const after = src.slice(routeIndex, routeIndex + 4000);
  const direct = after.match(/(\w+)\s*\.safeParse\(\s*req\.body/);
  if (!direct) return null;
  const varName = direct[1];
  const decl = src.match(new RegExp(`const\\s+${varName}\\s*=\\s*z\\s*\\.object\\(\\s*\\{`));
  if (!decl) return null;
  const start = src.indexOf("{", decl.index + decl[0].length - 1);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return null;
}

export function synthesizeForRoute(file, routePath, ctx) {
  const src = readFileSync(file, "utf8");
  // Anchor on the POST registration, not the first occurrence of the path: a file that serves both GET
  // and POST on one path (the catalog routes all do) would otherwise be read from the GET, whose
  // safeParse targets req.query, and the body schema would look unresolvable.
  const postAt = src.search(new RegExp(`app\\.post\\(\\s*["'\`]${routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`));
  const idx = postAt !== -1 ? postAt : src.indexOf(routePath);
  if (idx === -1) return { ok: false, why: "route path not found in file" };
  const objSrc = bodySchemaFor(src, idx);
  if (!objSrc) return { ok: false, why: "no z.object body schema resolvable — reported, not invented" };
  const body = {};
  const unresolved = [];
  for (const [name, chain] of parseObjectFields(objSrc)) {
    const v = valueForField(name, chain, ctx);
    if (v === null) { unresolved.push(name); continue; }
    if (v !== undefined) body[name] = v;
  }
  return { ok: true, body, unresolved };
}

if (process.argv[1] && process.argv[1].endsWith("usmca-battery-payloads.mjs")) {
  const ctx = { marker: "CC2-BATTERY-20260807", companyId: "5c854333-6ea5-4faa-af31-67cb272fef80", refs: {} };
  const r = synthesizeForRoute(process.argv[2], process.argv[3], ctx);
  console.log(JSON.stringify(r, null, 2));
}
