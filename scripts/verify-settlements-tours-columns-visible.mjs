#!/usr/bin/env node
// verify-settlements-tours-columns-visible — LST-F11136.
// #28767 default-hid 6 shipped columns on the Settlements Tours register (per-leg Load #,
// Date started, Margin %, Checks passed, Checks required, Post). Post is the operator's
// action to post a settlement; hiding it behind the column gear is a removal under the
// ADDITIVE-ONLY LAW (docs/LAW.md L379). This guard fails if any of those columns, or the
// per-leg tourLoadColumns spread, carries defaultHidden: true again.
import fs from "node:fs";
import path from "node:path";

const FILE = "apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx";
const KEYS = ["started", "margin_pct", "ready_ok", "ready_total", "post"];

export function check(src) {
  const errors = [];
  for (const k of KEYS) {
    // Each column is one source line (render bodies contain braces, so match the line, not the object).
    const line = src.split("\n").find((l) => new RegExp(`\\bkey:\\s*"${k}"`).test(l));
    if (!line) { errors.push(`column "${k}" not found`); continue; }
    if (/defaultHidden:\s*true/.test(line)) errors.push(`column "${k}" is defaultHidden: true`);
  }
  const spread = src.split("\n").find((l) => /\.\.\.tourLoadColumns\(/.test(l));
  if (!spread) errors.push("tourLoadColumns spread not found");
  else if (/defaultHidden:\s*true/.test(spread)) errors.push("per-leg Load # columns (tourLoadColumns) are defaultHidden: true");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = `const c = [ ...tourLoadColumns("setl-tour-col", rows),
  { key: "started", label: "Date started", sortable: true },
  { key: "margin_pct", label: "Margin %" },
  { key: "ready_ok", label: "Checks passed" },
  { key: "ready_total", label: "Checks required" },
  { key: "post", label: "Post", render: (r) => r } ];`;
  const badPost = good.replace(`label: "Post",`, `label: "Post", defaultHidden: true,`);
  const badLegs = good.replace(`...tourLoadColumns("setl-tour-col", rows),`, `...tourLoadColumns("setl-tour-col", rows).map((c) => ({ ...c, defaultHidden: true })),`);
  const missing = good.replace(`{ key: "margin_pct", label: "Margin %" },`, "");
  const ok = check(good).length === 0 && check(badPost).length === 1 && check(badLegs).length === 1 && check(missing).length === 1;
  if (!ok) { console.error("verify-settlements-tours-columns-visible --selftest FAIL"); process.exit(1); }
  console.log("verify-settlements-tours-columns-visible --selftest PASS — clean source passes; Post hidden, per-leg hidden, column dropped each FAIL");
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
const errors = check(src);
if (errors.length) {
  console.error(`verify-settlements-tours-columns-visible: FAIL — ${FILE}\n  - ${errors.join("\n  - ")}\n  ADDITIVE-ONLY LAW (docs/LAW.md L379): shipped columns stay visible unless the owner writes OWNER-REMOVE.`);
  process.exit(1);
}
console.log(`verify-settlements-tours-columns-visible: PASS — ${KEYS.length} columns + per-leg Load # visible by default`);
