#!/usr/bin/env node
/**
 * MODAL-01 — URL-derived modal/drawer/wizard must retract path + sub-tab + query on close.
 * Planted selftest: three independent arms.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-modal-close-retracts-url";

const DISPATCH = "apps/frontend/src/pages/Dispatch.tsx";
const PROFILE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
const DETAIL_TYPES = "apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx";
const CREATE_HOOK = "apps/frontend/src/hooks/useCreateQueryParam.ts";

const REGRESSION_DELETE_CREATE = [
  "apps/frontend/src/pages/Vendors.tsx",
  "apps/frontend/src/pages/Drivers.tsx",
  "apps/frontend/src/pages/Customers.tsx",
  CREATE_HOOK,
];

function readRel(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertModalCloseRetracts(sources) {
  const problems = [];
  const dispatch = sources?.[DISPATCH] ?? readRel(DISPATCH);
  const profile = sources?.[PROFILE] ?? readRel(PROFILE);
  const detailTypes = sources?.[DETAIL_TYPES] ?? readRel(DETAIL_TYPES);
  const hook = sources?.[CREATE_HOOK] ?? readRel(CREATE_HOOK);

  if (/useState\(\s*initialSubTab\s*===\s*"book_load"\s*\)/.test(dispatch)) {
    problems.push(`${DISPATCH}: second opener — useState must not seed from book_load URL/sub-tab`);
  }
  if (!/useState\(false\)/.test(dispatch) || !/setNewLoadOpen\(true\)/.test(dispatch)) {
    problems.push(`${DISPATCH}: single opener must be the effect (useState(false) seed + setNewLoadOpen(true))`);
  }
  if (!/next\.delete\("book_load"\)/.test(dispatch)) {
    problems.push(`${DISPATCH}: must delete book_load query param`);
  }
  if (!/navigate\(`\/dispatch\/loads/.test(dispatch)) {
    problems.push(`${DISPATCH}: onClose must navigate off /dispatch/book-load onto /dispatch/loads`);
  }
  if (!/retractBookLoadUrl/.test(dispatch)) {
    problems.push(`${DISPATCH}: close + create success must share retractBookLoadUrl`);
  }

  if (!/next\.delete\("assign_truck"\)/.test(profile)) {
    problems.push(`${PROFILE}: closeAssignTruck must delete assign_truck`);
  }

  if (!/useCreateQueryParam/.test(detailTypes) || !/next\.delete\("create"\)/.test(hook)) {
    problems.push(`${DETAIL_TYPES}: must open via useCreateQueryParam which deletes create`);
  }

  for (const rel of REGRESSION_DELETE_CREATE) {
    const src = sources?.[rel] ?? readRel(rel);
    if (!/delete\("create"\)/.test(src)) {
      problems.push(`${rel}: regression — must still delete create query param`);
    }
  }
  return problems;
}

const FIXTURE_OK = `
const [newLoadOpen, setNewLoadOpen] = useState(false);
useEffect(() => {
  const onBookPath = location.pathname.replace(/\\/$/, "") === "/dispatch/book-load";
  const q = searchParams.get("book_load") === "1";
  if (!onBookPath && !q) return;
  setNewLoadOpen(true);
  if (!q) return;
  const next = new URLSearchParams(searchParams);
  next.delete("book_load");
  setSearchParams(next, { replace: true });
}, [location.pathname, searchParams, setSearchParams]);
const retractBookLoadUrl = () => {
  const next = new URLSearchParams(searchParams);
  next.delete("book_load");
  navigate(\`/dispatch/loads\${next.toString() ? \`?\${next}\` : ""}\`, { replace: true });
};
`;

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const live = assertModalCloseRetracts();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAIL — live unclean:\n${live.join("\n")}`);
    process.exit(1);
  }
  const arms = [
    {
      name: "remove next.delete(param)",
      mutate: (d) => d.replaceAll('next.delete("book_load")', "/* deleted */"),
      expect: /delete book_load/,
    },
    {
      name: "remove navigate off modal path",
      mutate: (d) => d.replaceAll("/dispatch/loads", "/dispatch/STAY"),
      expect: /navigate off/,
    },
    {
      name: "restore useState url-derived second opener",
      mutate: (d) => d.replace("useState(false)", 'useState(initialSubTab === "book_load")'),
      expect: /second opener/,
    },
  ];
  const escaped = [];
  for (const arm of arms) {
    const mutantDispatch = arm.mutate(readRel(DISPATCH));
    const caught = assertModalCloseRetracts({ [DISPATCH]: mutantDispatch });
    if (!caught.some((p) => arm.expect.test(p))) {
      escaped.push(`${arm.name}: planted defect escaped (${caught.join("; ") || "no problems"})`);
    }
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  void FIXTURE_OK;
  console.log(`${LABEL} SELFTEST PASS — 3/3 planted arms fail independently`);
  process.exit(0);
}

const missing = assertModalCloseRetracts();
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
