// ENG-34 / batch70 — wire orphan verify-row-actions-column-is-clickable (static; no DB).
// Also listed under verify:arch-design in package.json; this verify-step is the FULLY WIRED CI path.
export default {
  name: "verify:verify-row-actions-column-is-clickable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-row-actions-column-is-clickable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-row-actions-column-is-clickable.mjs"]);
  },
};
