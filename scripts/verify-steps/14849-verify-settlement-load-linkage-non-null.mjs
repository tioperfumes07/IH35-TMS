export default {
  name: "verify:settlement-load-linkage-non-null",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-load-linkage-non-null.mjs"]);
  },
};
