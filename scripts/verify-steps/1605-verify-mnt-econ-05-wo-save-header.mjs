export default {
  name: "verify:mnt-econ-05-wo-save-header",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-mnt-econ-05-wo-save-header.mjs"]);
  },
};
