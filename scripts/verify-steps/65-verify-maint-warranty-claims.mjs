export default {
  name: "verify-maint-warranty-claims",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:maint-warranty-claims"]) !== 0) {
      throw new Error("verify-maint-warranty-claims failed");
    }
  },
};
