import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {selftest,scanTree} from '../verify-every-graphic-number-clicks-through.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function run() {
  selftest();
  const result=scanTree(root);
  console.log(JSON.stringify(result,null,2));
  if(result.problems.length) throw Error(`Graphic click-through: ${result.problems.length} unresolved contracts; no coverage is not a pass`);
}
export default {name:'verify:every-graphic-number-clicks-through',run};
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) run();
