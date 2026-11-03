export default {
  name: "verify:no-sample-data-holds-a-real-number",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-sample-data-holds-a-real-number.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-sample-data-holds-a-real-number.mjs"]);
  },
};
