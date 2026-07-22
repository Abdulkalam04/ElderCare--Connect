import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";
declare const Deno: {
  serve: (handler: (request: Request) => Promise<Response> | Response) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};
type PushUrgency = "very-low" | "low" | "normal" | "high";
type QueueEvent = {
  id: string;
  notification_id: string;
  recipient_id: string;
  care_parent_id: string;
  notification_type: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  metadata: Record<string, unknown> | null;
  attempts: number;
  urgency: PushUrgency;
  ttl_seconds: number;
  require_interaction: boolean;
};
type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};
type ExistingDelivery = {
  subscription_id: string;
  status: string;
};
type ElderSettings = {
  notify_push: boolean | null;
  push_sos_enabled: boolean | null;
  push_medicine_enabled: boolean | null;
  push_wellbeing_enabled: boolean | null;
  push_appointments_enabled: boolean | null;
  push_caregiver_enabled: boolean | null;
  push_transport_enabled: boolean | null;
  push_video_enabled: boolean | null;
  push_emergency_detection_enabled: boolean | null;
  push_health_risk_enabled: boolean | null;
  push_companion_safety_enabled: boolean | null;
  med_reminders_enabled: boolean | null;
  wellbeing_reminders_enabled: boolean | null;
  appointment_reminders_enabled: boolean | null;
  emergency_detection_enabled: boolean | null;
  health_risk_alerts_enabled: boolean | null;
  companion_emergency_escalation_enabled: boolean | null;
  detect_missed_medicine: boolean | null;
  detect_missed_checkin: boolean | null;
  detect_no_app_activity: boolean | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};
const jsonHeaders = { "Content-Type": "application/json" };
const safetyCriticalTypes = new Set([
  "missed_medicine",
  "missed_checkin",
  "no_app_activity",
  "companion_emergency",
  "health_risk_high",
  "sos_sent",
  "sos_acknowledged",
  "sos_resolved",
  "push_test",
]);
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function isStaleSubscriptionError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const statusCode = "statusCode" in error ? Number(error.statusCode) : 0;
  return statusCode === 404 || statusCode === 410;
}
function isDisabled(value: boolean | null | undefined) {
  return value === false;
}
function getDisabledReason(event: QueueEvent, settings: ElderSettings | null) {
  if (isDisabled(settings?.notify_push)) return "Push notifications are disabled.";
  switch (event.notification_type) {
    case "sos_sent":
    case "sos_acknowledged":
    case "sos_resolved":
      return isDisabled(settings?.push_sos_enabled) ? "SOS push alerts are disabled." : null;
    case "missed_medicine":
      if (isDisabled(settings?.push_medicine_enabled)) return "Medicine push alerts are disabled.";
      if (isDisabled(settings?.med_reminders_enabled)) return "Medicine reminders are disabled.";
      if (isDisabled(settings?.detect_missed_medicine))
        return "Missed-medicine detection is disabled.";
      return null;
    case "missed_checkin":
      if (isDisabled(settings?.push_wellbeing_enabled))
        return "Wellbeing push alerts are disabled.";
      if (isDisabled(settings?.wellbeing_reminders_enabled))
        return "Wellbeing reminders are disabled.";
      if (isDisabled(settings?.detect_missed_checkin))
        return "Missing-check-in detection is disabled.";
      return null;
    case "no_app_activity":
      if (isDisabled(settings?.push_emergency_detection_enabled))
        return "AI detection push alerts are disabled.";
      if (isDisabled(settings?.emergency_detection_enabled))
        return "Emergency detection is disabled.";
      if (isDisabled(settings?.detect_no_app_activity))
        return "No-app-activity detection is disabled.";
      return null;
    case "appointment_reminder":
      if (isDisabled(settings?.push_appointments_enabled))
        return "Appointment push reminders are disabled.";
      if (isDisabled(settings?.appointment_reminders_enabled))
        return "Appointment reminders are disabled.";
      return null;
    case "caregiver_booking":
      return isDisabled(settings?.push_caregiver_enabled)
        ? "Caregiver push updates are disabled."
        : null;
    case "transport_alert":
      return isDisabled(settings?.push_transport_enabled)
        ? "Transport push updates are disabled."
        : null;
    case "video_consult":
      return isDisabled(settings?.push_video_enabled)
        ? "Video-consultation push updates are disabled."
        : null;
    case "health_risk_high":
      if (isDisabled(settings?.push_health_risk_enabled))
        return "Health-risk push alerts are disabled.";
      if (isDisabled(settings?.health_risk_alerts_enabled))
        return "Health-risk family alerts are disabled.";
      return null;
    case "companion_emergency":
      if (isDisabled(settings?.push_companion_safety_enabled))
        return "Companion safety push alerts are disabled.";
      if (isDisabled(settings?.companion_emergency_escalation_enabled))
        return "Companion family escalation is disabled.";
      return null;
    case "push_test":
      return null;
    default:
      return "Unsupported push notification category.";
  }
}
function parseTime(value: string | null | undefined) {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
function currentIndiaMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}
function quietHoursDelayMinutes(settings: ElderSettings | null) {
  const start = parseTime(settings?.quiet_hours_start);
  const end = parseTime(settings?.quiet_hours_end);
  if (start == null || end == null || start === end) return 0;
  const now = currentIndiaMinutes();
  const inQuietHours = start < end ? now >= start && now < end : now >= start || now < end;
  if (!inQuietHours) return 0;
  const minutesUntilEnd = end > now ? end - now : 24 * 60 - now + end;
  return Math.max(1, minutesUntilEnd);
}
async function markEvent(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  status: "delivered" | "pending" | "failed" | "skipped",
  lastError: string | null,
  retryAfterMinutes?: number,
) {
  const availableAt =
    status === "pending" && retryAfterMinutes
      ? new Date(Date.now() + retryAfterMinutes * 60000).toISOString()
      : null;
  const { error } = await supabase.rpc("finish_care_push_event", {
    _event_id: eventId,
    _status: status,
    _last_error: lastError,
    _available_at: availableAt,
  });
  if (error) console.error("Unable to update push queue event", eventId, error);
}
async function deferForQuietHours(
  supabase: ReturnType<typeof createClient>,
  event: QueueEvent,
  delayMinutes: number,
) {
  const { error } = await supabase
    .from("care_push_queue")
    .update({
      status: "pending",
      available_at: new Date(Date.now() + delayMinutes * 60000).toISOString(),
      locked_at: null,
      processed_at: null,
      attempts: Math.max(0, event.attempts - 1),
      last_error: "Deferred until quiet hours end.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", event.id);
  if (error) throw new Error(`Unable to defer push event: ${error.message}`);
}
async function recordDelivery(
  supabase: ReturnType<typeof createClient>,
  options: {
    eventId: string;
    subscriptionId: string;
    recipientId: string;
    status: "sent" | "failed" | "stale";
    error?: string | null;
  },
) {
  const { error } = await supabase.from("care_push_deliveries").upsert(
    {
      event_id: options.eventId,
      subscription_id: options.subscriptionId,
      recipient_id: options.recipientId,
      status: options.status,
      attempts: 1,
      last_error: options.error ?? null,
      sent_at: options.status === "sent" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,subscription_id" },
  );
  if (error) console.error("Unable to record push delivery", error);
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type,x-care-push-secret",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
    });
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  try {
    const expectedSecret = getRequiredEnv("CARE_PUSH_CRON_SECRET");
    const suppliedSecret = request.headers.get("x-care-push-secret")?.trim();
    if (!suppliedSecret || suppliedSecret !== expectedSecret) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }
    const supabase = createClient(
      getRequiredEnv("SUPABASE_URL"),
      getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    webPush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT")?.trim() || "mailto:admin@eldercare.local",
      getRequiredEnv("VAPID_PUBLIC_KEY"),
      getRequiredEnv("VAPID_PRIVATE_KEY"),
    );
    let batchSize = 25;
    try {
      const body = await request.json();
      const requested = Number(body?.batchSize);
      if (Number.isFinite(requested)) batchSize = Math.max(1, Math.min(50, Math.floor(requested)));
    } catch {}
    const { data: claimedEvents, error: claimError } = await supabase.rpc(
      "claim_care_push_events",
      {
        _limit: batchSize,
      },
    );
    if (claimError) throw new Error(`Unable to claim push events: ${claimError.message}`);
    const events = (claimedEvents ?? []) as QueueEvent[];
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let deferred = 0;
    for (const event of events) {
      try {
        const { data: settingsData, error: settingsError } = await supabase
          .from("elder_settings")
          .select(
            "notify_push,push_sos_enabled,push_medicine_enabled,push_wellbeing_enabled,push_appointments_enabled,push_caregiver_enabled,push_transport_enabled,push_video_enabled,push_emergency_detection_enabled,push_health_risk_enabled,push_companion_safety_enabled,med_reminders_enabled,wellbeing_reminders_enabled,appointment_reminders_enabled,emergency_detection_enabled,health_risk_alerts_enabled,companion_emergency_escalation_enabled,detect_missed_medicine,detect_missed_checkin,detect_no_app_activity,quiet_hours_start,quiet_hours_end",
          )
          .eq("parent_id", event.care_parent_id)
          .maybeSingle();
        if (settingsError)
          throw new Error(`Unable to load elder settings: ${settingsError.message}`);
        const settings = (settingsData ?? null) as ElderSettings | null;
        const disabledReason = getDisabledReason(event, settings);
        if (disabledReason) {
          skipped += 1;
          await markEvent(supabase, event.id, "skipped", disabledReason);
          continue;
        }
        if (!safetyCriticalTypes.has(event.notification_type)) {
          const delay = quietHoursDelayMinutes(settings);
          if (delay > 0) {
            deferred += 1;
            await deferForQuietHours(supabase, event, delay);
            continue;
          }
        }
        const { data: subscriptionsData, error: subscriptionError } = await supabase
          .from("push_subscriptions")
          .select("id,user_id,endpoint,p256dh,auth")
          .eq("user_id", event.recipient_id);
        if (subscriptionError)
          throw new Error(`Unable to load subscriptions: ${subscriptionError.message}`);
        const subscriptions = (subscriptionsData ?? []) as PushSubscriptionRow[];
        if (subscriptions.length === 0) {
          skipped += 1;
          await markEvent(
            supabase,
            event.id,
            "skipped",
            "No active push subscription for recipient.",
          );
          continue;
        }
        const ids = subscriptions.map((subscription) => subscription.id);
        const { data: priorData } = await supabase
          .from("care_push_deliveries")
          .select("subscription_id,status")
          .eq("event_id", event.id)
          .in("subscription_id", ids);
        const finished = new Set(
          ((priorData ?? []) as ExistingDelivery[])
            .filter((delivery) => delivery.status === "sent" || delivery.status === "stale")
            .map((delivery) => delivery.subscription_id),
        );
        let eventFailures = 0;
        for (const subscription of subscriptions) {
          if (finished.has(subscription.id)) continue;
          try {
            await webPush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify({
                title: event.title,
                body: event.body,
                tag: event.tag,
                url: event.url,
                notificationType: event.notification_type,
                notificationId: event.notification_id,
                metadata: event.metadata ?? {},
                requireInteraction: event.require_interaction,
              }),
              {
                TTL: Math.max(60, Math.min(604800, event.ttl_seconds || 86400)),
                urgency: event.urgency || "normal",
              },
            );
            sent += 1;
            await recordDelivery(supabase, {
              eventId: event.id,
              subscriptionId: subscription.id,
              recipientId: event.recipient_id,
              status: "sent",
            });
          } catch (error) {
            const message = getErrorMessage(error).slice(0, 500);
            if (isStaleSubscriptionError(error)) {
              await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
              await recordDelivery(supabase, {
                eventId: event.id,
                subscriptionId: subscription.id,
                recipientId: event.recipient_id,
                status: "stale",
                error: message,
              });
              continue;
            }
            eventFailures += 1;
            failed += 1;
            await recordDelivery(supabase, {
              eventId: event.id,
              subscriptionId: subscription.id,
              recipientId: event.recipient_id,
              status: "failed",
              error: message,
            });
          }
        }
        if (eventFailures > 0) {
          if (event.attempts < 3) {
            await markEvent(
              supabase,
              event.id,
              "pending",
              `${eventFailures} delivery attempt(s) failed.`,
              Math.min(15, Math.max(5, event.attempts * 5)),
            );
          } else {
            await markEvent(
              supabase,
              event.id,
              "failed",
              `${eventFailures} delivery attempt(s) failed.`,
            );
          }
        } else {
          await markEvent(supabase, event.id, "delivered", null);
        }
      } catch (error) {
        failed += 1;
        const message = getErrorMessage(error).slice(0, 500);
        if (event.attempts < 3) {
          await markEvent(
            supabase,
            event.id,
            "pending",
            message,
            Math.min(15, Math.max(5, event.attempts * 5)),
          );
        } else {
          await markEvent(supabase, event.id, "failed", message);
        }
      }
    }
    return jsonResponse({ processed: events.length, sent, failed, skipped, deferred });
  } catch (error) {
    console.error("care-push failed", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});
