export default {
  name: "verify:tile-bucket-limit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tile-bucket-limit.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-tile-bucket-limit.mjs"]);
  },
};
