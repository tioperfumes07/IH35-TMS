export default {
  name: "verify:customer-contract-upload",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-contract-upload.mjs"]);
  },
};
