export default {
  name: "verify:user-s05-admin-mutation-opco",
  run(ctx) {
    ctx.run("node", ["scripts/verify-user-s05-admin-mutation-opco.mjs"]);
  },
};
