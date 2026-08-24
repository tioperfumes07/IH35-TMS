export default {
  name: "verify:resizable-table-column-widths-no-fetch-loop",
  run(ctx) {
    ctx.run("node", ["scripts/verify-resizable-table-column-widths-no-fetch-loop.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-resizable-table-column-widths-no-fetch-loop.mjs"]);
  },
};
