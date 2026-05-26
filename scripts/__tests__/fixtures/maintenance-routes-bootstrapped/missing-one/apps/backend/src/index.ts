import { registerA } from "./maintenance/a.routes.js";
import { registerB } from "./maintenance/b.routes.js";

async function main(app: unknown) {
  await registerA(app);
  await registerB(app);
}

void main({});
