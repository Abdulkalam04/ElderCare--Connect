// ElderCare Connect — generic free Web Push service worker.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim(),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data
      ? event.data.json()
      : {};
  } catch (_) {
    payload = {
      title:
        "ElderCare notification",

      body: event.data
        ? event.data.text()
        : "",
    };
  }

  const notificationType =
    payload.notificationType ||
    payload.alertType ||
    "general";

  const isEmergency =
    notificationType === "manual" ||
    notificationType === "sos";

  const isMedicine =
    notificationType ===
    "missed_medicine";

  const title =
    payload.title ||
    (
      isEmergency
        ? "🚨 ElderCare SOS"

        : isMedicine
          ? "💊 Medicine reminder"

          : "ElderCare notification"
    );

  const options = {
    body:
      payload.body ||
      "A new ElderCare notification is available.",

    icon:
      payload.icon ||
      "/favicon.ico",

    badge:
      payload.badge ||
      "/favicon.ico",

    tag:
      payload.tag ||
      `${notificationType}-notification`,

    renotify: true,

    requireInteraction:
      payload.requireInteraction !== false,

    data: {
      url:
        payload.url ||
        (
          isEmergency
            ? "/sos"
            : "/notifications"
        ),

      alertId:
        payload.alertId ||
        null,

      notificationId:
        payload.notificationId ||
        null,

      notificationType,

      metadata:
        payload.metadata ||
        {},
    },
  };

  event.waitUntil(
    self.registration.showNotification(
      title,
      options,
    ),
  );
});

self.addEventListener(
  "notificationclick",

  (event) => {
    event.notification.close();

    const target =
      (
        event.notification.data &&
        event.notification.data.url
      ) ||
      "/notifications";

    event.waitUntil(
      self.clients
        .matchAll({
          type: "window",
          includeUncontrolled: true,
        })
        .then((clients) => {
          for (const client of clients) {
            if (!("focus" in client)) {
              continue;
            }

            if ("navigate" in client) {
              client.navigate(target);
            }

            return client.focus();
          }

          if (self.clients.openWindow) {
            return self.clients.openWindow(
              target,
            );
          }

          return undefined;
        }),
    );
  },
);
