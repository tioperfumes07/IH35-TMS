export default {
  name: "verify:hold-migrations-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-hold-migrations-registered.mjs"]);
  },
};
