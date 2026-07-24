export default {
  name: "verify:safety-evidence-no-delete-grant",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-safety-evidence-no-delete-grant.mjs"]);
  },
};
