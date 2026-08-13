#!/usr/bin/env node
/**
 * SAF-B29 — shared EntityPicker must search server-side for capped kinds.
 *
 * DriverPickerWithCreate was fixed earlier (guard 1679). EntityPicker is the OTHER shared
 * primitive — Accidents filters, FineCreateModal EntityPicker fields, Escrow, and dozens of
 * non-Safety call sites. It still fetched `limit:200` once with no `search` and no search term in
 * the react-query key, so typing only filtered the first page client-side and the rest of the
 * roster was unselectable with no empty-state warning.
 *
 * Asserts the same three locks as the shared driver picker: term is state, reaches list({search}),
 * is part of the query key, and Combobox reports typing via onSearch — for every kind that
 * declares serverSearch: true in the registry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const PICKER = join(ROOT, "apps/frontend/src/components/parity/EntityPicker.tsx");
const REGISTRY = join(ROOT, "apps/frontend/src/components/parity/entityPickerRegistry.ts");

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const PICKER_CHECKS = [
  {
    id: "term-is-state",
    describe: "the typed term must be component state",
    test: (s) => /const \[rosterSearch, setRosterSearch\] = useState/.test(s),
  },
  {
    id: "term-reaches-list",
    describe: "serverSearch kinds must pass search into config.list",
    test: (s) => /config\.list\(operatingCompanyId,\s*\{[\s\S]{0,300}?config\.serverSearch \? \{ search: rosterSearch \|\| undefined \} : \{\}/.test(s),
  },
  {
    id: "term-in-query-key",
    describe: "the term must be part of the react-query key when serverSearch is on",
    test: (s) => /queryKey:\s*\[[\s\S]{0,220}?"entity-picker",[\s\S]{0,220}?kind,[\s\S]{0,220}?operatingCompanyId,[\s\S]{0,220}?config\.serverSearch \? rosterSearch : ""/.test(s),
  },
  {
    id: "combobox-reports-typing",
    describe: "Combobox must report typing via onSearch for serverSearch kinds",
    test: (s) => /onSearch=\{config\.serverSearch \? setRosterSearch : undefined\}/.test(s),
  },
];

const REQUIRED_SERVER_SEARCH_KINDS = ["driver", "unit", "trailer", "load", "vendor", "factoring_advance"];

export function auditServerSearch(pickerInput, registryInput) {
  const pickerSrc = stripComments(pickerInput);
  const registrySrc = stripComments(registryInput);
  const failed = [];

  for (const c of PICKER_CHECKS) {
    if (!c.test(pickerSrc)) failed.push(c);
  }

  for (const kind of REQUIRED_SERVER_SEARCH_KINDS) {
    // Each kind block must declare serverSearch: true (not false).
    const kindRe = new RegExp(`${kind}:\\s*\\{[\\s\\S]*?serverSearch:\\s*(true|false)`, "m");
    const m = registrySrc.match(kindRe);
    if (!m || m[1] !== "true") {
      failed.push({
        id: `registry-${kind}-serverSearch`,
        describe: `entityPickerRegistry.${kind} must declare serverSearch: true`,
      });
    }
    if (!new RegExp(`search:\\s*opts\\?\\.search`).test(registrySrc) && kind !== "work_order") {
      // loose — ensure at least one opts?.search path exists for server kinds
    }
  }

  // Every serverSearch:true list must pass opts?.search into its list() body.
  for (const kind of REQUIRED_SERVER_SEARCH_KINDS) {
    const start = registrySrc.search(new RegExp(`\\b${kind}:\\s*\\{`));
    if (start < 0) {
      failed.push({
        id: `registry-${kind}-passes-search`,
        describe: `entityPickerRegistry.${kind} block not found`,
      });
      continue;
    }
    const nextKind = registrySrc.slice(start + 1).search(/\n  [a-z_]+:\s*\{/);
    const body = nextKind >= 0 ? registrySrc.slice(start, start + 1 + nextKind) : registrySrc.slice(start);
    if (!/opts\?\.search/.test(body)) {
      failed.push({
        id: `registry-${kind}-passes-search`,
        describe: `entityPickerRegistry.${kind}.list must pass opts?.search to the API`,
      });
    }
  }

  const ok = failed.length === 0;
  return {
    ok,
    total: PICKER_CHECKS.length + REQUIRED_SERVER_SEARCH_KINDS.length * 2,
    failed: failed.map((f) => f.id),
    message: ok
      ? `PASS: EntityPicker server-search locked (${REQUIRED_SERVER_SEARCH_KINDS.join(", ")}).`
      : `FAIL (${failed.length}):\n  - ${failed.map((f) => `${f.describe} (${f.id})`).join("\n  - ")}`,
  };
}

export function run() {
  return auditServerSearch(readFileSync(PICKER, "utf8"), readFileSync(REGISTRY, "utf8"));
}

function selftest() {
  const original = readFileSync(PICKER, "utf8");
  const registry = readFileSync(REGISTRY, "utf8");
  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository already red.\n${baseline.message}`);
    process.exit(1);
  }
  const cases = [
    {
      name: "term dropped from query key",
      find: 'config.serverSearch ? rosterSearch : ""',
      replace: '""',
      expect: "term-in-query-key",
    },
    {
      name: "Combobox stops reporting typing",
      find: "onSearch={config.serverSearch ? setRosterSearch : undefined}",
      replace: "",
      expect: "combobox-reports-typing",
    },
    {
      name: "term dropped from list request",
      find: '...(config.serverSearch ? { search: rosterSearch || undefined } : {})',
      replace: "",
      expect: "term-reaches-list",
    },
  ];
  for (const c of cases) {
    if (!original.includes(c.find)) {
      console.error(`SELFTEST FAIL: anchor for "${c.name}" not found.`);
      process.exit(1);
    }
    const caught = auditServerSearch(original.replace(c.find, c.replace), registry);
    if (caught.ok || !caught.failed.includes(c.expect)) {
      console.error(`SELFTEST FAIL: "${c.name}" was NOT caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log(`  caught: ${c.name}`);
  }
  for (const kind of REQUIRED_SERVER_SEARCH_KINDS) {
    const kindPattern = new RegExp(`(\\b${kind}:\\s*\\{[\\s\\S]*?serverSearch:\\s*)true`);
    if (!kindPattern.test(registry)) {
      console.error(`SELFTEST FAIL: registry anchor for ${kind} not found.`);
      process.exit(1);
    }
    const mutatedRegistry = registry.replace(kindPattern, "$1false");
    const caught = auditServerSearch(original, mutatedRegistry);
    const expected = `registry-${kind}-serverSearch`;
    if (caught.ok || !caught.failed.includes(expected)) {
      console.error(`SELFTEST FAIL: ${kind} server-search disable was NOT caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log(`  caught: ${kind} server-search disabled`);
  }
  console.log(`SELFTEST PASS: ${cases.length + REQUIRED_SERVER_SEARCH_KINDS.length} planted defects caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (!result.ok) process.exit(1);
}
