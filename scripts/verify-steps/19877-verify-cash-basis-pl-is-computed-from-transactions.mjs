// ENG-34 / batch70 — wire orphan verify-cash-basis-pl-is-computed-from-transactions (static; no DB).
// Also listed under verify:arch-design in package.json; this verify-step is the FULLY WIRED CI path.
export default {
  name: "verify:verify-cash-basis-pl-is-computed-from-transactions",
  run(ctx) {
    ctx.run("node", [
      "scripts/verify-cash-basis-pl-is-computed-from-transactions.mjs",
      "--selftest",
    ]);
    ctx.run("node", ["scripts/verify-cash-basis-pl-is-computed-from-transactions.mjs"]);
  },
};
