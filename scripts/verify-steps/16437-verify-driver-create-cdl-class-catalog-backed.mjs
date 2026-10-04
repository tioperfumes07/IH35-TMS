export default {
  name: "verify:driver-create-cdl-class-catalog-backed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-create-cdl-class-catalog-backed.mjs"]);
  },
};
