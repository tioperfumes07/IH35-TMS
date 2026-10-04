export default {
  name: "verify:inv2-no-hard-delete-accounting",
  run(ctx) {
    ctx.run("node", ["scripts/verify-inv2-no-hard-delete-accounting.mjs"]);
  },
};
