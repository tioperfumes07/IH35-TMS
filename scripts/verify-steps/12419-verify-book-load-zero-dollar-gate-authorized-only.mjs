export default {
  name: "verify:book-load-zero-dollar-gate-authorized-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-zero-dollar-gate-authorized-only.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-book-load-zero-dollar-gate-authorized-only.mjs"]);
  },
};
