import { useEffect } from "react";
import { addHours, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
interface UseNotificationEngineOptions {
  parentId: string | null;
  userId: string | null;
  isChildView: boolean;
}
type NotificationSettings = {
  appointment_reminders_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};
const DEFAULT_SETTINGS: NotificationSettings = {
  appointment_reminders_enabled: true,
  quiet_hours_start: null,
  quiet_hours_end: null,
};
export function useNotificationEngine({
  parentId,
  userId,
  isChildView,
}: UseNotificationEngineOptions) {
  useEffect(() => {
    if (!parentId || !userId || isChildView) return;
    void runEngine(parentId, userId).catch((error) => {
      console.error("Notification engine failed", error);
    });
    const interval = window.setInterval(
      () => {
        void runEngine(parentId, userId).catch((error) => {
          console.error("Notification engine failed", error);
        });
      },
      5 * 60 * 1000,
    );
    return () => window.clearInterval(interval);
  }, [isChildView, parentId, userId]);
}
async function loadSettings(parentId: string): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from("elder_settings")
    .select("appointment_reminders_enabled,quiet_hours_start,quiet_hours_end")
    .eq("parent_id", parentId)
    .maybeSingle();
  if (error) {
    console.error("Unable to load notification settings", error);
    return DEFAULT_SETTINGS;
  }
  return {
    appointment_reminders_enabled: data?.appointment_reminders_enabled !== false,
    quiet_hours_start: normalizeTime(data?.quiet_hours_start),
    quiet_hours_end: normalizeTime(data?.quiet_hours_end),
  };
}
function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 5) return null;
  return value.slice(0, 5);
}
function isWithinQuietHours(now: Date, start: string | null, end: string | null) {
  if (!start || !end || start === end) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}
async function runEngine(parentId: string, userId: string) {
  const now = new Date();
  const settings = await loadSettings(parentId);
  if (
    !settings.appointment_reminders_enabled ||
    isWithinQuietHours(now, settings.quiet_hours_start, settings.quiet_hours_end)
  ) {
    return;
  }
  await checkAppointmentReminders(parentId, userId, now);
}
async function checkAppointmentReminders(parentId: string, userId: string, now: Date) {
  const in24Hours = addHours(now, 24);
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("id, title, doctor_name, appointment_date, appointment_time, scheduled_at")
    .eq("parent_id", parentId)
    .eq("reminder_enabled", true)
    .in("status", ["pending", "confirmed", "scheduled"])
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", in24Hours.toISOString());
  if (error || !appointments?.length) return;
  const { data: existingNotifications, error: existingError } = await supabase
    .from("parent_notifications")
    .select("metadata")
    .eq("parent_id", parentId)
    .eq("notification_type", "appointment_reminder");
  if (existingError) return;
  const alreadyNotifiedIds = new Set(
    (existingNotifications ?? [])
      .map((notification) => {
        const metadata = notification.metadata as Record<string, unknown> | null;
        return typeof metadata?.appointment_id === "string" ? metadata.appointment_id : null;
      })
      .filter((value): value is string => Boolean(value)),
  );
  const notifications = appointments
    .filter((appointment) => !alreadyNotifiedIds.has(appointment.id))
    .map((appointment) => {
      const scheduledDate = new Date(appointment.scheduled_at);
      const dateLabel = Number.isFinite(scheduledDate.getTime())
        ? format(scheduledDate, "MMM d, yyyy")
        : appointment.appointment_date
          ? format(parseISO(appointment.appointment_date), "MMM d, yyyy")
          : "soon";
      const timeLabel = appointment.appointment_time
        ? appointment.appointment_time.slice(0, 5)
        : Number.isFinite(scheduledDate.getTime())
          ? format(scheduledDate, "HH:mm")
          : "the scheduled time";
      return {
        parent_id: parentId,
        sender_id: userId,
        type: "appointment_reminder",
        notification_type: "appointment_reminder",
        message: `📅 Appointment reminder: ${appointment.title || "Appointment"} with ${appointment.doctor_name || "your doctor"} is scheduled for ${dateLabel} at ${timeLabel}.`,
        is_read: false,
        metadata: {
          appointment_id: appointment.id,
          title: appointment.title,
          doctor_name: appointment.doctor_name,
          appointment_date: appointment.appointment_date,
          appointment_time: appointment.appointment_time,
          scheduled_at: appointment.scheduled_at,
        },
        dedup_key: `appointment_reminder:${appointment.id}`,
      };
    });
  if (!notifications.length) return;
  const { error: insertError } = await supabase.from("parent_notifications").insert(notifications);
  if (insertError) console.error("Failed to create appointment reminders", insertError);
}
