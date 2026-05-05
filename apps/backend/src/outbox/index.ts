import { OutboxProcessor } from "./processor.js";

let processor: OutboxProcessor | null = null;

export function startOutboxProcessor() {
  if (processor) return;
  processor = new OutboxProcessor();
  processor.start();
}

export async function stopOutboxProcessor() {
  if (!processor) return;
  const current = processor;
  processor = null;
  await current.stop();
}
