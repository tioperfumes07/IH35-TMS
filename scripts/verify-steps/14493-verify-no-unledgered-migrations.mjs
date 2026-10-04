export default {
  name: "verify:no-unledgered-migrations",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-unledgered-migrations.mjs"]);
  },
};
