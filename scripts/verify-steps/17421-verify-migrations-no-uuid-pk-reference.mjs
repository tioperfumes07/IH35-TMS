export default {
  name: "verify:migrations-no-uuid-pk-reference",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migrations-no-uuid-pk-reference.mjs"]);
  },
};
