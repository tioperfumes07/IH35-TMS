self.addEventListener("push", (event) => {
  let data = { title: "IH35 Dispatch", body: "" };
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === "object") data = { ...data, ...parsed };
  } catch {
    try {
      const t = event.data?.text();
      if (t) data.body = t;
    } catch {
      /* ignore */
    }
  }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: data.data ?? {} }));
});

self.addEventListener("sync", (event) => {
  if (event.tag === "driver-token-sync") {
    event.waitUntil(Promise.resolve());
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const url = "/driver/loads";
      for (const client of windowClients) {
        if ("focus" in client) {
          void client.focus();
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
