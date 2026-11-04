export default {
  name: "verify:verify-rows-53-28",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rows-53-28.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-rows-53-28.mjs"]);
  },
};
