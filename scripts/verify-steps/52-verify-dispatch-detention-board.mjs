export default {
  name: "verify-dispatch-detention-board",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:dispatch-detention-board"]) !== 0) {
      throw new Error("verify:dispatch-detention-board failed");
    }
    ctx.run("node", ["scripts/verify-dispatch-detention-subnav-and-hook-order.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-detention-subnav-and-hook-order.mjs"]);
  },
};
