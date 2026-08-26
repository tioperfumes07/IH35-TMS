export default {
  name: "verify-maint-warranty-claims",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:maint-warranty-claims"]) !== 0) {
      throw new Error("verify-maint-warranty-claims failed");
    }
    if (ctx.run("node", ["scripts/verify-maint-warranty-company-lifecycle.mjs"]) !== 0) {
      throw new Error("verify-maint-warranty-company-lifecycle failed");
    }
  },
};
