export default {
  name: "verify:held-registry-integrity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-held-registry-integrity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-held-registry-integrity.mjs"]);
  },
};
