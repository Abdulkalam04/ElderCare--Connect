import { savePushSubscription, deletePushSubscription } from "@/lib/api/pushNotify.functions";
import { bufferToBase64Url, urlBase64ToUint8Array } from "@/lib/webPushEncoding";
export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers not supported");
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) {
    await existing.update();
    return existing;
  }
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}
export async function enablePushNotifications(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isPushSupported()) return { ok: false, reason: "Push not supported in this browser" };
  const vapidPublic = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidPublic) return { ok: false, reason: "VAPID public key not configured" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Permission denied" };
  const reg = await registerServiceWorker();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublic),
    });
  }
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh || bufferToBase64Url(sub.getKey("p256dh"));
  const auth = json.keys?.auth || bufferToBase64Url(sub.getKey("auth"));
  await savePushSubscription({
    data: {
      endpoint: sub.endpoint,
      p256dh,
      auth,
      userAgent: navigator.userAgent,
    },
  });
  return { ok: true };
}
export async function disablePushNotifications() {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  try {
    await deletePushSubscription({ data: { endpoint } });
  } catch {
    void 0;
  }
}
