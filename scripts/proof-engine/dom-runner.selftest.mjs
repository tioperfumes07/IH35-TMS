#!/usr/bin/env node
/**
 * DOM RUNNER SELFTEST — six mutation arms. Arms 4 and 6 are the R1-b / auth holes.
 */
import { runDomProof, assertDomProofShape } from "./dom-runner.mjs";
import { deriveStatus } from "./proof-engine.mjs";

let pass = 0;
let fail = 0;
const t = (name, ok, detail) => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "  -> " + detail : ""}`);
  }
};

const ANCHOR = '[data-testid="planner-time-axis"]';
const TRACK = '[data-testid="planner-grid-track"]';

const goodHtml = `
<html><body>
  <div data-testid="planner-time-axis">axis</div>
  <div data-testid="planner-grid-track" style="background-image: repeating-linear-gradient(to right, #000 0 1px, transparent 1px 52px); width:104px">
    <button data-load-id="L-1">NB-1</button>
    <button data-load-id="L-2">NB-2</button>
    <div data-testid="planner-day-col" style="width:52px"></div>
    <div data-testid="planner-day-col" style="width:52px"></div>
    <div data-testid="planner-grid-dwell"><i>2d idle</i></div>
  </div>
</body></html>`;

const GOOD = {
  kind: "dom",
  name: "planner A",
  auth: "none",
  html: goodHtml,
  anchor: ANCHOR,
  expect: [
    { op: "unique_per_id", attr: "data-load-id" },
    { op: "all_equal", selector: '[data-testid="planner-day-col"]', value: 52 },
    { op: "style_contains", selector: TRACK, prop: "background-image", substring: "repeating-linear-gradient" },
    { op: "count_zero", selector: '[data-testid="planner-available-cell"]' },
    { op: "text_nonempty", selector: '[data-testid="planner-grid-dwell"]' },
  ],
};

console.log("DOM RUNNER SELFTEST — each arm plants a defect and demands rejection\n");

try {
  assertDomProofShape({ ...GOOD, anchor: ".pg-track" });
  t("D2 class-name anchor is rejected", false, "accepted");
} catch {
  t("D2 class-name anchor is rejected", true);
}

{
  const r = await runDomProof(GOOD);
  t("happy fixture PASSES", r.ok === true, r.err);
}

{
  const html = goodHtml.replace('data-load-id="L-2"', 'data-load-id="L-1"');
  const r = await runDomProof({ ...GOOD, html });
  t("arm1 chopped bar unique_per_id FAILS", r.ok === false && /unique_per_id/.test(r.err || ""), r.err);
}

{
  const html = goodHtml.replace('style="width:52px"></div>\n    <div data-testid="planner-day-col" style="width:52px"', 'style="width:53px"></div>\n    <div data-testid="planner-day-col" style="width:52px"');
  const r = await runDomProof({ ...GOOD, html });
  t("arm2 53px column all_equal FAILS", r.ok === false && /all_equal/.test(r.err || ""), r.err);
}

{
  const html = goodHtml.replace("repeating-linear-gradient", "linear-gradient");
  const r = await runDomProof({ ...GOOD, html });
  t("arm3 gradient removed style_contains FAILS", r.ok === false && /style_contains/.test(r.err || ""), r.err);
}

{
  const r = await runDomProof({
    kind: "dom",
    auth: "none",
    name: "404",
    url: "https://app.ih35dispatch.com/this-route-does-not-exist-dom-r1b",
    html: undefined,
    anchor: ANCHOR,
    expect: [{ op: "count_zero", selector: '[data-testid="planner-available-cell"]' }],
  }, {
    fetch: async () => ({ status: 404, text: async () => "" }),
  });
  t("arm4 404: anchor FAILS and count_zero does NOT pass", r.ok === false && /did not render/.test(r.err || ""), r.err);
}

{
  const html = goodHtml.replace("<i>2d idle</i>", "<i></i>");
  const r = await runDomProof({ ...GOOD, html });
  t("arm5 stripped dwell text_nonempty FAILS", r.ok === false && /text_nonempty/.test(r.err || ""), r.err);
}

{
  const r = await runDomProof({ ...GOOD, auth: "session", html: goodHtml }, {});
  t("arm6 session proof with no cookie is unverified, not ok", r.unverified === true && r.ok === false, JSON.stringify(r));
  const d = deriveStatus(
    { id: "PLANNER-A", proofs: [{ kind: "dom" }], proven_at_sha: "abc1234" },
    [r],
    "abc1234",
  );
  t("arm6 deriveStatus is UNVERIFIED never PASS", d.status === "UNVERIFIED" && d.prod_verified === false, d.status);
}

console.log(`\nSELFTEST ${fail === 0 ? "PASS" : "FAIL"} ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
