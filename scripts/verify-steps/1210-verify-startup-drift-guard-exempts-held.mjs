export default {
  name: "verify:startup-drift-guard-exempts-held",
  run(ctx) {
    ctx.run("node", ["scripts/verify-startup-drift-guard-exempts-held.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-startup-drift-guard-exempts-held.mjs"]);
  },
};
