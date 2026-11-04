export default {
  name: "verify:verify-rows-93-116-131",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rows-93-116-131.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-rows-93-116-131.mjs"]);
  },
};
