import path from "node:path";
import { fileURLToPath } from "node:url";
import { run as inspectBoards, selftest } from "../verify-board-page-no-legacy-sections.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function run() {
  selftest();
  inspectBoards(root);
}
export default { name: "verify:board-page-no-legacy-sections", run };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
