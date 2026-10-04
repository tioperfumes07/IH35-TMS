export default {
  name: "verify:banking-recon-workspace-refetch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-recon-workspace-refetch.mjs"]);
  },
};
