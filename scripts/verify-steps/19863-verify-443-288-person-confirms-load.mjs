export default {
  name: "verify:verify-443-288-person-confirms-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-443-288-person-confirms-load.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-443-288-person-confirms-load.mjs"]);
  },
};
