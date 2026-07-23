export default {
  name: "verify:definition-of-done-evidence",
  run(ctx) {
    ctx.run("node", ["scripts/verify-definition-of-done-evidence.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-definition-of-done-evidence.mjs"]);
  },
};
