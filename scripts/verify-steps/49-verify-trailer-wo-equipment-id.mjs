export default {
  name: "verify-trailer-wo-equipment-id",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:trailer-wo-equipment-id"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
