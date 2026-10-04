export default {
  name: "verify:equipment-deactivate-rls",
  run(ctx) {
    ctx.run("node", ["scripts/verify-equipment-deactivate-rls.mjs"]);
  },
};
