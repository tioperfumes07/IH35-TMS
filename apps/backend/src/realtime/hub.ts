import type { WebSocket } from "ws";

const topicSockets = new Map<string, Set<WebSocket>>();

function touch(topic: string) {
  let set = topicSockets.get(topic);
  if (!set) {
    set = new Set();
    topicSockets.set(topic, set);
  }
  return set;
}

export function realtimeSubscribe(topic: string, socket: WebSocket) {
  touch(topic).add(socket);
}

export function realtimeUnsubscribe(topic: string, socket: WebSocket) {
  topicSockets.get(topic)?.delete(socket);
}

export function realtimeUnsubscribeAll(socket: WebSocket) {
  for (const [, set] of topicSockets) {
    set.delete(socket);
  }
}

export function realtimePublish(topic: string, payload: unknown) {
  const set = topicSockets.get(topic);
  if (!set || set.size === 0) return;
  const raw = JSON.stringify({ topic, payload });
  for (const s of set) {
    if (s.readyState === 1) {
      try {
        s.send(raw);
      } catch {
        /* dropped */
      }
    }
  }
}
