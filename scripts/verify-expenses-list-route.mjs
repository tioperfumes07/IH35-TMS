#!/usr/bin/env node
/**
 * @matrix-built {"modules":["accounting"],"cols":["connectivity","picker_law"],"leafRe":"^(expenses\\.(list|create)|expenses)$","task":"ACCT-F5054-EXPENSE-CREATE-URL","pr":"#6456"}
 * verify-expenses-list-route — lock the owner-approved browse/create route split.
 *
 * Canonical contract (browse-first):
 *   - /accounting/expenses renders ExpensesListPage (canonical list; create via + Create drawer).
 *   - /accounting/expenses/list remains an additive list alias.
 *   - /accounting/expenses/new remains an additive ExpenseCreatePage alias.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expenses-list-route";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function routeR(route, component) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `path=["']${escaped}["'](?:(?!path=["'])[\\s\\S]){0,400}?<${component}\\s*\\/>`,
  );
}

function manifestRouteErrors(
  manifest,
  { checkList = true, checkBare = true, checkAlias = true } = {},
) {
  if (!manifest) return ["manifest.tsx missing"];
  const errors = [];
  if (checkList) {
    if (!routeR("/accounting/expenses/list", "ExpensesListPage").test(manifest)) {
      errors.push("manifest: /accounting/expenses/list must render ExpensesListPage");
    }
    if (routeR("/accounting/expenses/list", "ExpenseCreatePage").test(manifest)) {
      errors.push("manifest: reversed regression — /accounting/expenses/list renders create");
    }
  }
  if (checkBare) {
    if (!routeR("/accounting/expenses", "ExpensesListPage").test(manifest)) {
      errors.push("manifest: /accounting/expenses must render ExpensesListPage");
    }
    if (routeR("/accounting/expenses", "ExpenseCreatePage").test(manifest)) {
      errors.push("manifest: reversed regression — bare /accounting/expenses renders create wizard");
    }
  }
  if (
    checkAlias
    && !routeR("/accounting/expenses/new", "ExpenseCreatePage").test(manifest)
  ) {
    errors.push("manifest: /accounting/expenses/new must remain an ExpenseCreatePage alias");
  }
  return errors;
}

function stripComments(src) {
  let out = "";
  let quote = null;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      out += "  ";
      i += 2;
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i += 1;
      }
      if (i < src.length) out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function balancedObjects(src) {
  const objects = [];
  const stack = [];
  let quote = null;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
    } else if (ch === "{") {
      stack.push(i);
    } else if (ch === "}") {
      const start = stack.pop();
      if (start !== undefined) objects.push(src.slice(start, i + 1));
    }
  }
  return objects;
}

function topLevelSegments(objectSource) {
  const body = objectSource.slice(1, -1);
  const segments = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
    } else if (ch === "{" || ch === "[" || ch === "(") {
      depth += 1;
    } else if (ch === "}" || ch === "]" || ch === ")") {
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      segments.push(body.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(body.slice(start));
  return segments;
}

function objectLabelDestinationPairs(src) {
  const pairs = [];
  for (const objectSource of balancedObjects(src)) {
    const properties = {};
    for (const segment of topLevelSegments(objectSource)) {
      const match = segment.match(
        /^\s*(label|to|path)\s*:\s*(["'])([\s\S]*?)\2\s*$/,
      );
      if (match) properties[match[1]] = match[3];
    }
    const route = properties.to ?? properties.path;
    if (
      properties.label
      && /^\/accounting\/expenses(?:\/list|\/new)?$/.test(route ?? "")
    ) {
      pairs.push({ label: properties.label, route });
    }
  }
  return pairs;
}

function textOutsideMarkup(raw) {
  let text = "";
  let inTag = false;
  let quote = null;
  for (const char of raw) {
    if (inTag) {
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === "\"" || char === "'") {
        quote = char;
      } else if (char === ">") {
        inTag = false;
      }
    } else if (char === "<") {
      inTag = true;
    } else {
      text += char;
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

function wrongDestinationErrors(sources) {
  const errors = [];
  for (const [name, raw] of Object.entries(sources)) {
    if (!raw) continue;
    const src = stripComments(raw);
    const pairs = objectLabelDestinationPairs(src);
    for (const match of src.matchAll(/<Link\b([^>]*)>([\s\S]*?)<\/Link>/g)) {
      const route = match[1].match(/\bto=["'](\/accounting\/expenses(?:\/list|\/new)?)["']/)?.[1];
      if (route) pairs.push({ label: textOutsideMarkup(match[2]), route });
    }
    for (const { label, route } of pairs) {
      const isBrowse = /\b(?:view|browse|list)\b/i.test(label);
      const isCreate = /\b(?:create|record)\b/i.test(label) || label === "Expense";
      if (isBrowse && route === "/accounting/expenses/new") {
        errors.push(`${name}: browse/view/list label "${label}" must not target create alias /new`);
      }
      if (isCreate && route !== "/accounting/expenses") {
        errors.push(`${name}: create/record label "${label}" must target canonical list /accounting/expenses`);
      }
    }
  }
  return errors;
}

export function assertExpensesListRoute({
  manifest,
  topbar,
  home,
  subnavWrapper,
  subnavManifest,
  accountingHub,
  accountRegister,
  expenseCreate,
  expensesList,
  entityLink,
  recordExpenseModal,
}) {
  const errors = manifestRouteErrors(manifest);

  const createTargets = [
    ["Topbar", topbar, /create_expense[^]*?["']\/accounting\/expenses\?create=1["']/],
    ["QboStyleHomePage CREATE_ACTIONS", home, /label:\s*["']\+ Create Expense["'],\s*to:\s*["']\/accounting\/expenses["']/],
    ["AccountingSubNavWrapper CREATE_MENU", subnavWrapper, /label:\s*["']Expense["'],\s*to:\s*["']\/accounting\/expenses["']/],
  ];
  for (const [name, src, okRe] of createTargets) {
    if (!src) {
      errors.push(`${name}: file missing`);
      continue;
    }
    if (!okRe.test(src)) {
      errors.push(
        name === "Topbar"
          ? `${name}: create entry must target /accounting/expenses?create=1 (drawer deep-link)`
          : `${name}: create entry must target canonical list /accounting/expenses`
      );
    }
    if (/create_expense[^]*?["']\/accounting\/expenses\/new["']/.test(src)
      || /label:\s*["'](?:\+ Create Expense|Expense)["'],\s*to:\s*["']\/accounting\/expenses\/new["']/.test(src)) {
      errors.push(`${name}: create entry must not use the /new wizard deep-link`);
    }
  }

  if (expensesList) {
    if (!/searchParams\.get\(["']create["']\)\s*===\s*["']1["']/.test(expensesList)) {
      errors.push("ExpensesListPage: must honor ?create=1 deep link for RecordExpenseModal");
    }
    if (!/params\.delete\(["']create["']\)/.test(expensesList) && !/params\.set\(["']create["'],\s*["']1["']\)/.test(expensesList)) {
      errors.push("ExpensesListPage: must URL-sync create open/close via create search param");
    }
  } else {
    errors.push("ExpensesListPage: file missing");
  }

  if (subnavManifest) {
    const itemBlock =
      subnavManifest.match(/export const SUBNAV_ITEMS[\s\S]*?\]\s*as const;/)?.[0] ?? "";
    const flatBlock =
      subnavManifest.match(/export const ACCOUNTING_CLEAN_TABS[\s\S]*?\]\s*as const;/)?.[0] ?? "";
    const orderedChildren =
      /label:\s*["']Expenses List["'],\s*path:\s*["']\/accounting\/expenses\/list["'],\s*section:\s*["']expenses["'][\s\S]{0,180}?label:\s*["']Expenses["'],\s*path:\s*["']\/accounting\/expenses["'],\s*section:\s*["']expenses["']/;
    if (!orderedChildren.test(itemBlock)) {
      errors.push("subnav-manifest: expense children must expose list first and Expenses second");
    }
    if (!/label:\s*GROUP_LABELS\.expenses,\s*href:\s*["']\/accounting\/expenses\/list["']/.test(subnavManifest)) {
      errors.push("subnav-manifest: Expenses group href must be /accounting/expenses/list");
    }
    for (const expected of [
      /label:\s*["']Expenses List["'],\s*to:\s*["']\/accounting\/expenses\/list["']/,
      /label:\s*["']Expenses["'],\s*to:\s*["']\/accounting\/expenses["']/,
    ]) {
      if (!expected.test(flatBlock)) {
        errors.push("subnav-manifest: retained flat metadata must preserve list then Expenses");
        break;
      }
    }
    if (/\/accounting\/expenses\/new/.test(itemBlock) || /\/accounting\/expenses\/new/.test(flatBlock)) {
      errors.push("subnav-manifest: /new must remain route-only and absent from UI metadata");
    }
  } else {
    errors.push("subnav-manifest.ts missing");
  }

  const browseTargets = [
    ["AccountingHub Expenses tab", accountingHub, /id:\s*["']expenses["'][^}]*to:\s*["']\/accounting\/expenses\/list["']/],
    ["QboStyleHomePage View link", home, /<Link\s+to=["']\/accounting\/expenses\/list["'][^>]*>View →<\/Link>/],
    ["AccountRegister expense fallback", accountRegister, /t === ["']expense["']\)\s*return ["']\/accounting\/expenses\/list["']/],
    ["AccountRegister expense with id", accountRegister, /t === ["']expense["'] && reference\)\s*return [`'"]\/accounting\/expenses\/\$\{reference\}[`'"]/],
    ["RecordExpenseModal View all link", recordExpenseModal, /<Link[^>]*to=["']\/accounting\/expenses\/list["'][^>]*>[\s\S]*?View all expenses[\s\S]*?<\/Link>/],
  ];
  for (const [name, src, okRe] of browseTargets) {
    if (!src) errors.push(`${name}: file missing`);
    else if (!okRe.test(src)) errors.push(`${name}: ID-less browse must target /accounting/expenses/list`);
  }

  if (!expenseCreate) {
    errors.push("ExpenseCreatePage: file missing");
  } else if ((expenseCreate.match(/navigate\(["']\/accounting\/expenses\/list["']\)/g) ?? []).length < 2) {
    errors.push("ExpenseCreatePage: Open list and close must both target /accounting/expenses/list");
  }

  if (!entityLink) {
    errors.push("EntityLink: file missing");
  } else if (!/`\/accounting\/expenses\/\$\{id\}`/.test(entityLink)) {
    errors.push("EntityLink: per-ID expense drill-through must be /accounting/expenses/${id}");
  }

  errors.push(...wrongDestinationErrors({
    Topbar: topbar,
    QboStyleHomePage: home,
    AccountingSubNavWrapper: subnavWrapper,
    "subnav-manifest": subnavManifest,
    AccountingHubPage: accountingHub,
    AccountRegisterPage: accountRegister,
    ExpenseCreatePage: expenseCreate,
    ExpensesListPage: expensesList,
    RecordExpenseModal: recordExpenseModal,
    EntityLink: entityLink,
  }));

  return errors;
}

function selftest() {
  const goodManifest = `
    path="/accounting/expenses/new" element={<ProtectedRoute><ExpenseCreatePage /></ProtectedRoute>}
    path="/accounting/expenses/list" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}
    path="/accounting/expenses" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}
  `;
  const childrenBlock = `
    export const SUBNAV_ITEMS = [
      { label: "Expenses List", path: "/accounting/expenses/list", section: "expenses" },
      { label: "Expenses", path: "/accounting/expenses", section: "expenses" },
    ] as const;
  `;
  const flatBlock = `
    export const ACCOUNTING_CLEAN_TABS = [
      { label: "Expenses List", to: "/accounting/expenses/list" },
      { label: "Expenses", to: "/accounting/expenses" },
    ] as const;
  `;
  const groupEntry = `{ label: GROUP_LABELS.expenses, href: "/accounting/expenses/list" }`;
  const good = {
    manifest: goodManifest,
    topbar: `[t("topbar.create_expense", "Expense"), "/accounting/expenses?create=1"]`,
    home: `{ label: "+ Create Expense", to: "/accounting/expenses" } <Link to="/accounting/expenses/list">View →</Link>`,
    subnavWrapper: `{ label: "Expense", to: "/accounting/expenses" }`,
    subnavManifest: `${childrenBlock}${flatBlock}${groupEntry}`,
    accountingHub: `{ id: "expenses", label: "Expenses", to: "/accounting/expenses/list" }`,
    accountRegister: `if (t === "expense" && reference) return \`/accounting/expenses/\${reference}\`; if (t === "expense") return "/accounting/expenses/list";`,
    expenseCreate: `navigate("/accounting/expenses/list"); navigate("/accounting/expenses/list");`,
    expensesList: `searchParams.get("create") === "1"; params.set("create", "1"); params.delete("create"); navigate("/accounting/expenses/list?expense_id=1");`,
    entityLink: "return `/accounting/expenses/${id}`;",
    recordExpenseModal: `<Link to="/accounting/expenses/list">View all expenses</Link>`,
  };
  const goodErrors = assertExpensesListRoute(good);
  const listOnlyManifest = goodManifest.replace(
    'path="/accounting/expenses/list" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}',
    'path="/accounting/expenses/list" element={<ProtectedRoute><ExpenseCreatePage /></ProtectedRoute>}',
  );
  const bareOnlyManifest = goodManifest.replace(
    'path="/accounting/expenses" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}',
    'path="/accounting/expenses" element={<ProtectedRoute><ExpenseCreatePage /></ProtectedRoute>}',
  );
  const isolated = [
    [
      "list manifest component only",
      { ...good, manifest: listOnlyManifest },
      "/accounting/expenses/list must render ExpensesListPage",
    ],
    [
      "bare manifest component only",
      { ...good, manifest: bareOnlyManifest },
      "/accounting/expenses must render ExpensesListPage",
    ],
    ["Topbar create alias", { ...good, topbar: good.topbar.replace("/accounting/expenses?create=1", "/accounting/expenses/new") }, "Topbar"],
    ["home create alias", { ...good, home: good.home.replace('to: "/accounting/expenses"', 'to: "/accounting/expenses/new"') }, "CREATE_ACTIONS"],
    ["wrapper create list", { ...good, subnavWrapper: good.subnavWrapper.replace('expenses"', 'expenses/list"') }, "CREATE_MENU"],
    ["group reversed", { ...good, subnavManifest: `${childrenBlock}${flatBlock}{ label: GROUP_LABELS.expenses, href: "/accounting/expenses" }` }, "group href"],
    ["missing children", { ...good, subnavManifest: `export const SUBNAV_ITEMS = [] as const;${flatBlock}${groupEntry}` }, "expense children"],
    ["missing flat metadata", { ...good, subnavManifest: `${childrenBlock}export const ACCOUNTING_CLEAN_TABS = [] as const;${groupEntry}` }, "flat metadata"],
    ["exposed legacy alias", { ...good, subnavManifest: `${childrenBlock.replace("] as const;", '{ label: "Legacy", path: "/accounting/expenses/new", section: "expenses" },\\n] as const;')}${flatBlock}${groupEntry}` }, "route-only"],
    ["home view reversed", { ...good, home: good.home.replace('to="/accounting/expenses/list"', 'to="/accounting/expenses"') }, "View link"],
    ["hub browse reversed", { ...good, accountingHub: good.accountingHub.replace("expenses/list", "expenses") }, "AccountingHub"],
    ["register browse reversed", { ...good, accountRegister: good.accountRegister.replace("expenses/list", "expenses") }, "AccountRegister"],
    ["creator close reversed", { ...good, expenseCreate: good.expenseCreate.replace('navigate("/accounting/expenses/list");', 'navigate("/accounting/expenses");') }, "ExpenseCreatePage"],
    ["entity drill reversed", { ...good, entityLink: "return `/accounting/expenses?expense_id=${id}`;" }, "EntityLink"],
    ["modal browse reversed", { ...good, recordExpenseModal: good.recordExpenseModal.replace("expenses/list", "expenses") }, "RecordExpenseModal"],
  ];

  const missed = [];
  for (const [name, fixture, expected] of isolated) {
    const fixtureErrors = assertExpensesListRoute(fixture);
    if (!fixtureErrors.some((error) => error.includes(expected))) {
      missed.push(`${name} (expected "${expected}", got: ${fixtureErrors.join("; ") || "none"})`);
    }
  }
  const globalBrowse = wrongDestinationErrors({
    sample: `{ label: "Browse expenses", to: "/accounting/expenses/new" }`,
  });
  const globalCreate = wrongDestinationErrors({
    sample: `{ label: "Record expense", to: "/accounting/expenses/new" }`,
  });
  const multilineViewBare = wrongDestinationErrors({
    sample: `{
      label:
        "View expenses",
      icon: { name: "receipt" },
      to:
        "/accounting/expenses/new"
    }`,
  });
  const multilineCreateList = wrongDestinationErrors({
    sample: `{
      label:
        "Create expense",
      metadata: { source: "quick-action" },
      to:
        "/accounting/expenses/list"
    }`,
  });
  const multilineCreateAlias = wrongDestinationErrors({
    sample: `{
      label:
        "Record expense",
      path:
        "/accounting/expenses/new"
    }`,
  });
  const validMultiline = wrongDestinationErrors({
    sample: `
      // { label: "View expenses", to: "/accounting/expenses" }
      const routeDeclaration = { path: "/accounting/expenses", element: <ExpensesListPage /> };
      const browse = {
        label:
          "View expenses",
        nested: { note: "to: /accounting/expenses" },
        to:
          "/accounting/expenses/list"
      };
      const create = {
        label:
          "Record expense",
        to:
          "/accounting/expenses"
      };
      /* { label: "Create expense", to: "/accounting/expenses/new" } */
    `,
  });
  const listAssertionIsolation =
    manifestRouteErrors(listOnlyManifest).length > 0
    && manifestRouteErrors(listOnlyManifest, { checkList: false }).length === 0;
  const bareAssertionIsolation =
    manifestRouteErrors(bareOnlyManifest).length > 0
    && manifestRouteErrors(bareOnlyManifest, { checkBare: false }).length === 0;
  if (
    goodErrors.length !== 0
    || missed.length
    || !globalBrowse.length
    || !globalCreate.length
    || !multilineViewBare.length
    || !multilineCreateList.length
    || !multilineCreateAlias.length
    || validMultiline.length
    || !listAssertionIsolation
    || !bareAssertionIsolation
  ) {
    console.error(`${LABEL} SELFTEST FAILED`);
    if (goodErrors.length) console.error(`  good fixture rejected: ${goodErrors.join("; ")}`);
    for (const miss of missed) console.error(`  isolated regression not caught: ${miss}`);
    if (!globalBrowse.length) console.error("  global browse wrong-destination fixture was not rejected");
    if (!globalCreate.length) console.error("  global create wrong-destination fixture was not rejected");
    if (!multilineViewBare.length) console.error("  multiline view→bare fixture was not rejected");
    if (!multilineCreateList.length) console.error("  multiline create→list fixture was not rejected");
    if (!multilineCreateAlias.length) console.error("  multiline create→new fixture was not rejected");
    if (validMultiline.length) console.error(`  valid multiline controls rejected: ${validMultiline.join("; ")}`);
    if (!listAssertionIsolation) console.error("  list-route assertion isolation meta-check failed");
    if (!bareAssertionIsolation) console.error("  bare-route assertion isolation meta-check failed");
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — ${isolated.length + 5} isolated regressions caught; manifest assertions isolated`,
  );
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertExpensesListRoute({
  manifest: read("apps/frontend/src/routes/manifest.tsx"),
  topbar: read("apps/frontend/src/components/Topbar.tsx"),
  home: read("apps/frontend/src/pages/home/QboStyleHomePage.tsx"),
  subnavWrapper: read("apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx"),
  subnavManifest: read("apps/frontend/src/pages/accounting/subnav-manifest.ts"),
  accountingHub: read("apps/frontend/src/pages/accounting/AccountingHubPage.tsx"),
  accountRegister: read("apps/frontend/src/pages/accounting/AccountRegisterPage.tsx"),
  expenseCreate: read("apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx"),
  expensesList: read("apps/frontend/src/pages/accounting/ExpensesListPage.tsx"),
  entityLink: read("apps/frontend/src/components/shared/EntityLink.tsx"),
  recordExpenseModal: read("apps/frontend/src/components/expenses/RecordExpenseModal.tsx"),
});

if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — bare /accounting/expenses lists; /list alias; /new create alias`);
process.exit(0);
