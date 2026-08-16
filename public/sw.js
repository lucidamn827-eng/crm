/* Service worker: recibe las notificaciones aunque la app esté cerrada. */
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = { titulo: "Central", cuerpo: "Tenés novedades", url: "/panel", tag: "central" };
  try { d = { ...d, ...event.data.json() }; } catch (_) {}

  event.waitUntil((async () => {
    return self.registration.showNotification(d.titulo, {
      body: d.cuerpo,
      icon: "/icono-192.png",
      badge: "/icono-192.png",
      tag: d.tag,               // reemplaza el aviso anterior en vez de apilar diez
      renotify: true,           // vuelve a vibrar aunque reemplace
      requireInteraction: true, // no se va sola: queda hasta que la tocan
      vibrate: [200, 100, 200, 100, 300],
      data: { url: d.url },
      actions: [{ action: "abrir", title: "Ver la ficha" }],
      silent: false, // deja sonar el tono del sistema
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/panel";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) if (c.url.includes("/panel") && "focus" in c) return c.focus();
      return self.clients.openWindow(url);
    })
  );
});
