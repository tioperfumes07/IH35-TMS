export default {
  name: "verify:bookload-stop-address-oneline",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bookload-stop-address-oneline.mjs"]);
  },
};
