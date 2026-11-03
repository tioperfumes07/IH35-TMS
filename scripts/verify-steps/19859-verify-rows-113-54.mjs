export default {
  name: "verify:verify-rows-113-54",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rows-113-54.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-rows-113-54.mjs"]);
  },
};
