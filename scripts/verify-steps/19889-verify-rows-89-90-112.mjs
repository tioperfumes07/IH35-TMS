export default {
  name: "verify:verify-rows-89-90-112",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rows-89-90-112.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-rows-89-90-112.mjs"]);
  },
};
