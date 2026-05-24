export async function runStep({ index, total, name, run }) {
  console.log(`verify:pre-commit step ${index}/${total}: ${name}`);
  await run();
}
