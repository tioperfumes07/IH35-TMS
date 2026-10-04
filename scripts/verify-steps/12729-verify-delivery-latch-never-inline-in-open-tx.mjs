export default {
  name: "verify:delivery-latch-never-inline-in-open-tx",
  run(ctx) {
    ctx.run("node", ["scripts/verify-delivery-latch-never-inline-in-open-tx.mjs"]);
  },
};
