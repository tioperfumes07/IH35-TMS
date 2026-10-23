import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {selftest,scanTree} from '../verify-design-tokens-only.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function run() {
  selftest();
  const result=scanTree(root,process.env.GUARD_DIFF_BASE || 'origin/main');
  console.log(JSON.stringify(result,null,2));
  if(result.problems.length) throw Error(`Design tokens: ${result.problems.length} findings; no coverage is not a pass`);
}
export default {name:'verify:design-tokens-only',run};
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) run();
