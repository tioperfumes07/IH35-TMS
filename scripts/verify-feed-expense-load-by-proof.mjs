#!/usr/bin/env node
// verify-feed-expense-load-by-proof — a settlement EXPENSES row reaches the load the document PROVES, carries its printed
// receipt, and is refused (never guessed) when nothing proves a load.
//
// 2026-10-04 (CC-3): the parser dropped a document's whole EXPENSES block on whichever load its FUEL section printed
// last, and the feed builder dropped the receipt. On 5770 three DEF rows (99301244 / 99442334 / 99444239) all landed on
// 13509 and on 5794 the 30.30 DEF (2885954) on 13568; the signed documents tie them to 13503 / 13503 / 13509 / 13558.
//
// Runs the REAL scripts/feed/engines/parse_settlements.py attribute_unheaded_expenses on fixtures shaped like 5770 / 5794
// and checks every proof rule; statically checks the parser keeps unheaded rows off the last load and the builder
// carries `invoice`. --selftest plants the old behaviour and must fail.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PARSER = "scripts/feed/engines/parse_settlements.py";
const BUILDER = "scripts/feed/engines/build_feed_input.py";

const PROBE = String.raw`
import json, sys
sys.path.insert(0, sys.argv[1])
from parse_settlements import attribute_unheaded_expenses
def load(fuel=(), exp=()): return {"fuel": list(fuel), "expenses": list(exp)}
def F(d, inv): return {"date": d, "invoice": inv}
def X(d, inv, desc, amt): return {"date": d, "invoice": inv, "description": desc, "amount": amt}
out = {}
# 5770: receipts tie two DEF rows to 13503; the third has no matching receipt and is dated inside 13509 only
c = {"doc_no": "5770", "loads": {"13503": load([F("2026-08-05","99301244"), F("2026-08-06","99442334")]),
                                 "13509": load([F("2026-08-09","9944239"), F("2026-08-10","99322441")])},
     "unheaded_expenses": [X("2026-08-05","99301244","Fuel-DEF-Diesel Exhaust Fluid",30.71),
                           X("2026-08-06","99442334","Fuel-DEF-Diesel Exhaust Fluid",37.10),
                           X("2026-08-09","99444239","Fuel-DEF-Diesel Exhaust Fluid",37.24)]}
n, g = attribute_unheaded_expenses(c, {"loads": {}})
out["5770"] = {ln: [(e["invoice"], e["load_by"]) for e in v["expenses"]] for ln, v in c["loads"].items()}
# 5794: the driver settlement carries the 30.30 reimbursement on 13558
c = {"doc_no": "5794", "loads": {"13558": load([F("2026-08-29","99602755")]), "13568": load([F("2026-08-31","99294159")])},
     "unheaded_expenses": [X("2026-08-29","2885954","Fuel-DEF-Diesel Exhaust Fluid",30.30)]}
d = {"loads": {"13558": {"lines": [{"amount": 30.30}], "stops": []}}}
attribute_unheaded_expenses(c, d)
out["5794"] = {ln: [(e["invoice"], e["load_by"]) for e in v["expenses"]] for ln, v in c["loads"].items()}
# boundary day: lumper -> the load delivering; a repair on the same day is refused
c = {"doc_no": "B", "loads": {"A": load(), "B": load()},
     "unheaded_expenses": [X("2026-09-06","1","Warehouse-Lumper Fee Expense",560.0), X("2026-09-06","2","Road Service-Truck Repair",617.17)]}
d = {"loads": {"A": {"stops": [{"type":"pickup","date":"2026-09-04"},{"type":"deliver","date":"2026-09-06"}]},
               "B": {"stops": [{"type":"pickup","date":"2026-09-06"},{"type":"deliver","date":"2026-09-10"}]}}}
n, g = attribute_unheaded_expenses(c, d)
out["boundary"] = {"A": [e["load_by"] for e in c["loads"]["A"]["expenses"]], "B": [e["load_by"] for e in c["loads"]["B"]["expenses"]], "gaps": len(g)}
print(json.dumps(out))
`;

const WANT = {
  "5770": { "13503": [["99301244", "receipt"], ["99442334", "receipt"]], "13509": [["99444239", "date"]] },
  "5794": { "13558": [["2885954", "driver"]], "13568": [] },
  boundary: { A: ["stop:deliver"], B: [], gaps: 1 },
};

function run(parserSrc, builderSrc) {
  const bad = [];
  if (/doc\["loads"\]\[cur\]\["expenses"\]\.append/.test(parserSrc))
    bad.push(`${PARSER}: an EXPENSES row is still appended to the last load parsed (cur)`);
  if (!/def attribute_unheaded_expenses\(/.test(parserSrc)) bad.push(`${PARSER}: attribute_unheaded_expenses missing (fails closed)`);
  if (!/attribute_unheaded_expenses\(cdoc, ddoc\)/.test(builderSrc)) bad.push(`${BUILDER}: does not attribute unheaded expenses before building lines`);
  if ((builderSrc.match(/\["invoice"\]\s*=/g) || []).length < 2) bad.push(`${BUILDER}: fuel and expense lines must both carry the printed invoice`);
  if (bad.length) return bad;
  const dir = mkdtempSync(join(tmpdir(), "feed-proof-"));
  try {
    writeFileSync(join(dir, "parse_settlements.py"), parserSrc);
    writeFileSync(join(dir, "probe.py"), PROBE);
    const got = JSON.parse(execFileSync("python3", [join(dir, "probe.py"), dir], { encoding: "utf8" }));
    for (const k of Object.keys(WANT)) {
      if (JSON.stringify(got[k]) !== JSON.stringify(WANT[k])) bad.push(`${k}: got ${JSON.stringify(got[k])}, want ${JSON.stringify(WANT[k])}`);
    }
  } catch (e) {
    bad.push(`probe failed: ${String(e.message || e).split("\n")[0]}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return bad;
}

const parser = readFileSync(join(ROOT, PARSER), "utf8");
const builder = readFileSync(join(ROOT, BUILDER), "utf8");

if (process.argv.includes("--selftest")) {
  const plants = [
    ["append to last load", parser.replace('doc.setdefault("unheaded_expenses", []).append(row)', 'doc["loads"][cur]["expenses"].append(row)'), builder],
    ["receipt rule removed", parser.replace('if len(hit) == 1:\n            target, how = next(iter(hit)), "receipt"', "pass"), builder],
    ["builder drops invoice", parser, builder.replaceAll('["invoice"] =', '["inv_dropped"] =')],
    ["boundary guessed", parser.replace('if len(on) == 1: target, how = next(iter(on)), f"stop:{stop}"', 'if on: target, how = sorted(on)[-1], f"stop:{stop}"').replace('stop = "deliver" if', 'stop = "deliver" if True or'), builder],
  ];
  const live = run(parser, builder);
  const missed = plants.filter(([, p, b]) => run(p, b).length === 0).map(([n]) => n);
  if (live.length || missed.length) {
    console.error(`verify-feed-expense-load-by-proof --selftest FAIL — live: ${live.join("; ") || "clean"}; plants not caught: ${missed.join(", ") || "none"}`);
    process.exit(1);
  }
  console.log(`verify-feed-expense-load-by-proof --selftest PASS — ${plants.length}/${plants.length} planted defects caught, live clean`);
  process.exit(0);
}

const bad = run(parser, builder);
if (bad.length) {
  console.error(`verify-feed-expense-load-by-proof FAIL —\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log("verify-feed-expense-load-by-proof OK — EXPENSES rows reach the load the document proves (receipt / driver line / date / stop event), carry the printed receipt, and an unproven row is refused");
