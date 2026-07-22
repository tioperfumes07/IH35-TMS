// LAW-E2E #3167 — Rule 17 step (no package.json / CI workflow thrash).
export default {
  name: "verify:vendor-bill-create-persists-lines",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-bill-create-persists-lines.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-bill-create-persists-lines.mjs"]);
  },
};
