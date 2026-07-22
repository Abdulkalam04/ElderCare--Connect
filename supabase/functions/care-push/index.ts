// @ts-nocheck
declare const Deno: {
  serve: (handler: (request: Request) => Promise<Response> | Response) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";

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
  med_reminders_enabled: boolean | null;
  wellbeing_reminders_enabled: boolean | null;
  emergency_detection_enabled: boolean | null;
  detect_missed_medicine: boolean | null;
  detect_missed_checkin: boolean | null;
  detect_no_app_activity: boolean | null;
};

const jsonHeaders = {
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function isStaleSubscriptionError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const statusCode = "statusCode" in error ? Number(error.statusCode) : 0;
  return statusCode === 404 || statusCode === 410;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getDisabledReason(event: QueueEvent, settings: ElderSettings | null) {
  if (settings?.notify_push === false) {
    return "Push notifications are disabled in elder settings.";
  }

  if (settings?.emergency_detection_enabled === false) {
    return "Emergency detection is disabled in elder settings.";
  }

  switch (event.notification_type) {
    case "missed_medicine":
      if (settings?.med_reminders_enabled === false) {
        return "Medicine reminders are disabled in elder settings.";
      }
      if (settings?.detect_missed_medicine === false) {
        return "Missed-medicine detection is disabled in elder settings.";
      }
      return null;

    case "missed_checkin":
      if (settings?.wellbeing_reminders_enabled === false) {
        return "Wellbeing reminders are disabled in elder settings.";
      }
      if (settings?.detect_missed_checkin === false) {
        return "Missed-check-in detection is disabled in elder settings.";
      }
      return null;

    case "no_app_activity":
      if (settings?.detect_no_app_activity === false) {
        return "No-app-activity detection is disabled in elder settings.";
      }
      return null;

    default:
      return null;
  }
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
      ? new Date(Date.now() + retryAfterMinutes * 60_000).toISOString()
      : null;

  const { error } = await supabase.rpc("finish_care_push_event", {
    _event_id: eventId,
    _status: status,
    _last_error: lastError,
    _available_at: availableAt,
  });

  if (error) {
    console.error("Unable to update care push queue event", eventId, error);
  }
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
    {
      onConflict: "event_id,subscription_id",
    },
  );

  if (error) {
    console.error("Unable to record care push delivery", error);
  }
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

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const expectedSecret = getRequiredEnv("CARE_PUSH_CRON_SECRET");
    const suppliedSecret = request.headers.get("x-care-push-secret")?.trim();

    if (!suppliedSecret || suppliedSecret !== expectedSecret) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = getRequiredEnv("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = getRequiredEnv("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT")?.trim() || "mailto:admin@eldercare.local";

    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let batchSize = 25;

    try {
      const body = await request.json();
      const requestedSize = Number(body?.batchSize);

      if (Number.isFinite(requestedSize)) {
        batchSize = Math.max(1, Math.min(50, Math.floor(requestedSize)));
      }
    } catch {
      // The scheduled request may intentionally contain no JSON body.
    }

    const { data: claimedEvents, error: claimError } = await supabase.rpc(
      "claim_care_push_events",
      { _limit: batchSize },
    );

    if (claimError) {
      throw new Error(`Unable to claim push events: ${claimError.message}`);
    }

    const events = (claimedEvents ?? []) as QueueEvent[];

    if (events.length === 0) {
      return jsonResponse({ processed: 0, sent: 0, failed: 0, skipped: 0 });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const event of events) {
      try {
        const { data: settingsData, error: settingsError } = await supabase
          .from("elder_settings")
          .select(
            "notify_push,med_reminders_enabled,wellbeing_reminders_enabled,emergency_detection_enabled,detect_missed_medicine,detect_missed_checkin,detect_no_app_activity",
          )
          .eq("parent_id", event.care_parent_id)
          .maybeSingle();

        if (settingsError) {
          throw new Error(`Unable to load elder settings: ${settingsError.message}`);
        }

        const settings = (settingsData ?? null) as ElderSettings | null;
        const disabledReason = getDisabledReason(event, settings);

        if (disabledReason) {
          skipped += 1;
          await markEvent(supabase, event.id, "skipped", disabledReason);
          continue;
        }

        const { data: subscriptionsData, error: subscriptionError } = await supabase
          .from("push_subscriptions")
          .select("id,user_id,endpoint,p256dh,auth")
          .eq("user_id", event.recipient_id);

        if (subscriptionError) {
          throw new Error(`Unable to load push subscriptions: ${subscriptionError.message}`);
        }

        const subscriptions = (subscriptionsData ?? []) as PushSubscriptionRow[];

        if (subscriptions.length === 0) {
          skipped += 1;
          await markEvent(
            supabase,
            event.id,
            "skipped",
            "The recipient has no active web-push subscription.",
          );
          continue;
        }

        const subscriptionIds = subscriptions.map((subscription) => subscription.id);
        const { data: previousDeliveriesData } = await supabase
          .from("care_push_deliveries")
          .select("subscription_id,status")
          .eq("event_id", event.id)
          .in("subscription_id", subscriptionIds);

        const previousDeliveries = (previousDeliveriesData ?? []) as ExistingDelivery[];
        const alreadyFinished = new Set(
          previousDeliveries
            .filter((delivery) => delivery.status === "sent" || delivery.status === "stale")
            .map((delivery) => delivery.subscription_id),
        );

        let eventFailures = 0;

        for (const subscription of subscriptions) {
          if (alreadyFinished.has(subscription.id)) continue;

          try {
            await webPush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth,
                },
              },
              JSON.stringify({
                title: event.title,
                body: event.body,
                tag: event.tag,
                url: event.url,
                notificationType: event.notification_type,
                notificationId: event.notification_id,
                metadata: event.metadata ?? {},
                requireInteraction: true,
              }),
              {
                TTL: 60 * 60,
                urgency: "high",
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
              `${eventFailures} subscription delivery attempt(s) failed.`,
              Math.min(15, event.attempts * 5),
            );
          } else {
            await markEvent(
              supabase,
              event.id,
              "failed",
              `${eventFailures} subscription delivery attempt(s) failed after ${event.attempts} queue attempts.`,
            );
          }
        } else {
          await markEvent(supabase, event.id, "delivered", null);
        }
      } catch (error) {
        const message = getErrorMessage(error).slice(0, 500);
        failed += 1;

        if (event.attempts < 3) {
          await markEvent(supabase, event.id, "pending", message, Math.min(15, event.attempts * 5));
        } else {
          await markEvent(supabase, event.id, "failed", message);
        }
      }
    }

    return jsonResponse({
      processed: events.length,
      sent,
      failed,
      skipped,
    });
  } catch (error) {
    console.error("care-push failed", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});
