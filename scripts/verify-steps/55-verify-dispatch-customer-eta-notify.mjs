export default {
  name: "verify-dispatch-customer-eta-notify",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:dispatch-customer-eta-notify"]) !== 0) {
      throw new Error("verify-dispatch-customer-eta-notify failed");
    }
  },
};
