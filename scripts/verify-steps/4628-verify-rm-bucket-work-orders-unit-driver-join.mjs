export default {
  name: "verify-rm-bucket-work-orders-unit-driver-join",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-rm-bucket-work-orders-unit-driver-join.mjs"]) !== 0) {
      throw new Error("verify-rm-bucket-work-orders-unit-driver-join failed");
    }
  },
};
