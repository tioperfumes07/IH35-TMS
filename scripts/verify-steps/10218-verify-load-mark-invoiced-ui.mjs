// DISPATCH-MARK-INVOICED-UI — completed_docs_received→invoiced live office path. Step 10218 · Cursor EVEN.
export default {
  name: "load-mark-invoiced-ui",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-mark-invoiced-ui.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-load-mark-invoiced-ui.mjs"]);
  },
};
