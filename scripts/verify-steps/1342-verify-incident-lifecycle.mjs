export default {
  name: "verify:incident-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-incident-lifecycle.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-incident-lifecycle.mjs"]);
  },
};
