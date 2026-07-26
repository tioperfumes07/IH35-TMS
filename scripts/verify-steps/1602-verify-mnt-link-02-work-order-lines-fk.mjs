export default {
  name: "verify:mnt-link-02-work-order-lines-fk",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-mnt-link-02-work-order-lines-fk.mjs"]);
  },
};
