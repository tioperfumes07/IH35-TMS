import { run } from "../../verify-no-mdata-drivers-active-phantom.mjs";

export default {
  name: "verify-no-mdata-drivers-active-phantom",
  async run(ctx) {
    const { ok, message } = run();
    if (!ok) {
      ctx.fail(message);
    } else {
      ctx.pass(message);
    }
  },
};
