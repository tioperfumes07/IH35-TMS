export default {
  name: "verify-qbo-ap-pull-dbflag",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:qbo-ap-pull-dbflag"]) !== 0) {
      process.exit(1);
    }
  },
};
