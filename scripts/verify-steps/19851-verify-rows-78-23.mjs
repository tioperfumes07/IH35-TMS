export default {
  name: "verify:verify-rows-78-23",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rows-78-23.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-rows-78-23.mjs"]);
  },
};
