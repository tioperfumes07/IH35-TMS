export default {
  name: "verify:verify-rows-250-255",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rows-250-255.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-rows-250-255.mjs"]);
  },
};
