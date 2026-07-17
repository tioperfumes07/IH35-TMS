// VEND-3: verify-vendor-test-fixture-guard ensures mdata vendor create/patch reject TEST-VENDOR in prod.
export default {
  name: "verify-vendor-test-fixture-guard",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:vendor-test-fixture-guard"]) !== 0) {
      process.exit(1);
    }
  },
};
