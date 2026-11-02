export default {
  name: "verify:drivers-home-complete-roster",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-home-complete-roster.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-drivers-home-complete-roster.mjs"]);
  },
};
