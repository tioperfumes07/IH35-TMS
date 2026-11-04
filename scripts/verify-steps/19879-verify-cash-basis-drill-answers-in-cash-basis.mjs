// ENG-34 / batch70 — wire orphan verify-cash-basis-drill-answers-in-cash-basis (static; no DB).
// Also listed under verify:arch-design in package.json; this verify-step is the FULLY WIRED CI path.
export default {
  name: "verify:verify-cash-basis-drill-answers-in-cash-basis",
  run(ctx) {
    ctx.run("node", [
      "scripts/verify-cash-basis-drill-answers-in-cash-basis.mjs",
      "--selftest",
    ]);
    ctx.run("node", ["scripts/verify-cash-basis-drill-answers-in-cash-basis.mjs"]);
  },
};
