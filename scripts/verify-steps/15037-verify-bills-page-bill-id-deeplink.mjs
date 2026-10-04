export default {
  name: "verify:bills-page-bill-id-deeplink",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bills-page-bill-id-deeplink.mjs"]);
  },
};
