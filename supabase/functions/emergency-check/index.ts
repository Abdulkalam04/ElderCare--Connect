import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 1. Maintain system_check daily ping in emergency_alerts
    const { data: allProfiles } = await supabase.from("profiles").select("id, full_name, role");
    if (!allProfiles) return new Response("No profiles found");

    for (const user of allProfiles) {
      const { data: existing } = await supabase
        .from("emergency_alerts")
        .select("id")
        .eq("user_id", user.id)
        .eq("alert_type", "system_check")
        .gte("created_at", `${todayStr}T00:00:00`)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("emergency_alerts").insert({
          user_id: user.id,
          alert_type: "system_check",
          severity: "Low",
          message: "Automated cron executed"
        });
      }
    }

    // 2. Fetch all parent_child_links to map parents to their linked children
    const { data: links } = await supabase.from("parent_child_links").select("parent_id, child_id");
    const parentToChildrenMap: Record<string, string[]> = {};
    if (links) {
      for (const link of links) {
        if (!parentToChildrenMap[link.parent_id]) {
          parentToChildrenMap[link.parent_id] = [];
        }
        parentToChildrenMap[link.parent_id].push(link.child_id);
      }
    }

    const parents = allProfiles.filter((p: any) => p.role === "parent" || parentToChildrenMap[p.id]);

    for (const parent of parents) {
      const parentId = parent.id;
      const parentName = parent.full_name || "Your parent";
      const childIds = parentToChildrenMap[parentId] || [];

      // ---------------------------------------------------------
      // A. MISSED MEDICINE CHECK
      //    Parent → "You missed your medicine …"
      //    Child  → "Your parent missed their medicine …"
      // ---------------------------------------------------------
      const { data: medicines } = await supabase
        .from("medicines")
        .select("id, name, dosage, schedule_time, period")
        .eq("parent_id", parentId)
        .eq("active", true);

      if (medicines && medicines.length > 0) {
        const { data: logs } = await supabase
          .from("medicine_logs")
          .select("medicine_id")
          .eq("parent_id", parentId)
          .eq("log_date", todayStr);

        const takenSet = new Set((logs ?? []).map((l: any) => l.medicine_id));

        const missed = medicines.filter((m: any) => {
          if (takenSet.has(m.id)) return false;
          if (!m.schedule_time) return false;
          const [h, min] = m.schedule_time.split(":").map(Number);
          const scheduledToday = new Date();
          scheduledToday.setHours(h, min, 0, 0);
          // Must be 5+ minutes past scheduled time
          return now.getTime() > scheduledToday.getTime() + 5 * 60 * 1000;
        });

        for (const med of missed) {
          const timeLabel = med.schedule_time
            ? new Date(`1970-01-01T${med.schedule_time}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "scheduled time";
          const dosageStr = med.dosage ? ` (${med.dosage})` : "";

          // Parent: personal reminder
          await insertNotificationIfNotExist({
            supabase,
            recipientId: parentId,
            senderId: parentId,
            type: "missed_medicine",
            message: `You missed your medicine "${med.name}"${dosageStr} scheduled for ${timeLabel}. Please take it as soon as possible if appropriate.`,
            metadata: { medicine_id: med.id, medicine_name: med.name, scheduled_time: med.schedule_time, date: todayStr, status: "missed" },
            todayStr
          });

          // Child: caregiver awareness
          for (const childId of childIds) {
            await insertNotificationIfNotExist({
              supabase,
              recipientId: childId,
              senderId: parentId,
              type: "missed_medicine",
              message: `Your parent missed the medicine "${med.name}"${dosageStr} scheduled for ${timeLabel} on ${new Date(todayStr).toLocaleDateString([], { month: "short", day: "numeric" })}.`,
              metadata: { medicine_id: med.id, medicine_name: med.name, scheduled_time: med.schedule_time, date: todayStr, parent_id: parentId, status: "missed" },
              todayStr
            });
          }
        }
      }

      // ---------------------------------------------------------
      // B. MISSED APPOINTMENT CHECK (past appointments, 30-min grace)
      //    Parent → "You missed your appointment …"
      //    Child  → "Your parent missed their appointment …"
      // ---------------------------------------------------------
      const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
      const { data: missedAppts } = await supabase
        .from("appointments")
        .select("id, title, doctor_name, scheduled_at")
        .eq("parent_id", parentId)
        .in("status", ["pending", "confirmed", "scheduled"])
        .lte("scheduled_at", thirtyMinsAgo.toISOString());

      if (missedAppts) {
        for (const appt of missedAppts) {
          const apptDate = new Date(appt.scheduled_at);
          const dateLabel = apptDate.toLocaleDateString([], { month: "short", day: "numeric" });
          const timeLabel = apptDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const titleStr = appt.title || "Medical Appointment";

          // Parent
          await insertNotificationIfNotExist({
            supabase,
            recipientId: parentId,
            senderId: parentId,
            type: "missed_appointment",
            message: `You missed your appointment "${titleStr}"${appt.doctor_name ? ` with Dr. ${appt.doctor_name}` : ""} scheduled on ${dateLabel} at ${timeLabel}.`,
            metadata: { appointment_id: appt.id, appointment_title: titleStr, scheduled_at: appt.scheduled_at, date: dateLabel, status: "missed" },
            todayStr
          });

          // Child
          for (const childId of childIds) {
            await insertNotificationIfNotExist({
              supabase,
              recipientId: childId,
              senderId: parentId,
              type: "missed_appointment",
              message: `Your parent missed the appointment "${titleStr}"${appt.doctor_name ? ` with Dr. ${appt.doctor_name}` : ""} scheduled on ${dateLabel} at ${timeLabel}.`,
              metadata: { appointment_id: appt.id, appointment_title: titleStr, scheduled_at: appt.scheduled_at, date: dateLabel, parent_id: parentId, status: "missed" },
              todayStr
            });
          }
        }
      }

      // ---------------------------------------------------------
      // C. UPCOMING APPOINTMENT REMINDER (within next 24 hours)
      // ---------------------------------------------------------
      const { data: appointments } = await supabase
        .from("appointments")
        .select("id, title, doctor_name, scheduled_at")
        .eq("parent_id", parentId)
        .in("status", ["pending", "confirmed", "scheduled"])
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", in24h.toISOString());

      if (appointments) {
        for (const appt of appointments) {
          const apptTime = new Date(appt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          // Notify Parent
          await insertNotificationIfNotExist({
            supabase,
            recipientId: parentId,
            senderId: parentId,
            type: "appointment_reminder",
            message: `📅 Appointment Reminder: ${appt.title || "Medical Appointment"} with Dr. ${appt.doctor_name} scheduled for ${apptTime}.`,
            metadata: { appointment_id: appt.id },
            todayStr
          });

          // Notify Child
          for (const childId of childIds) {
            await insertNotificationIfNotExist({
              supabase,
              recipientId: childId,
              senderId: parentId,
              type: "appointment_reminder",
              message: `📅 Parent Appointment Alert: ${parentName} has an appointment (${appt.title || "Doctor Visit"}) with Dr. ${appt.doctor_name} at ${apptTime}.`,
              metadata: { appointment_id: appt.id, parent_id: parentId },
              todayStr
            });
          }
        }
      }

      // ---------------------------------------------------------
      // C. CAREGIVER BOOKINGS CHECK (Notify Parent & Child & Caregiver)
      // ---------------------------------------------------------
      const { data: caregiverBookings } = await supabase
        .from("caregiver_bookings")
        .select("id, caregiver_type, scheduled_at, requested_by")
        .eq("parent_id", parentId)
        .in("status", ["pending", "confirmed"])
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", in24h.toISOString());

      if (caregiverBookings) {
        for (const booking of caregiverBookings) {
          const bookingTime = new Date(booking.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          // Notify Parent
          await insertNotificationIfNotExist({
            supabase,
            recipientId: parentId,
            senderId: booking.requested_by || parentId,
            type: "caregiver_alert",
            message: `🩺 Caregiver Visit Reminder: ${booking.caregiver_type} session is scheduled for ${bookingTime}.`,
            metadata: { booking_id: booking.id },
            todayStr
          });

          // Notify Child
          for (const childId of childIds) {
            await insertNotificationIfNotExist({
              supabase,
              recipientId: childId,
              senderId: parentId,
              type: "caregiver_alert",
              message: `🩺 Caregiver Alert: ${booking.caregiver_type} session for ${parentName} is scheduled for ${bookingTime}.`,
              metadata: { booking_id: booking.id, parent_id: parentId },
              todayStr
            });
          }
        }
      }

      // ---------------------------------------------------------
      // D. VIDEO CONSULTATIONS CHECK (Notify Parent & Child)
      // ---------------------------------------------------------
      const { data: videoConsults } = await supabase
        .from("video_consultations")
        .select("id, doctor_name, scheduled_at, meeting_url")
        .eq("parent_id", parentId)
        .in("status", ["pending", "confirmed"])
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", in24h.toISOString());

      if (videoConsults) {
        for (const consult of videoConsults) {
          const consultTime = new Date(consult.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          // Notify Parent
          await insertNotificationIfNotExist({
            supabase,
            recipientId: parentId,
            senderId: parentId,
            type: "video_consult",
            message: `📹 Video Consult Reminder: Online consultation with Dr. ${consult.doctor_name} scheduled for ${consultTime}.`,
            metadata: { consultation_id: consult.id },
            todayStr
          });

          // Notify Child
          for (const childId of childIds) {
            await insertNotificationIfNotExist({
              supabase,
              recipientId: childId,
              senderId: parentId,
              type: "video_consult",
              message: `📹 Video Consult Alert: ${parentName} has a video consultation with Dr. ${consult.doctor_name} scheduled for ${consultTime}.`,
              metadata: { consultation_id: consult.id, parent_id: parentId },
              todayStr
            });
          }
        }
      }
    }

    return new Response("OK");
  } catch (err: any) {
    console.error("Emergency check error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

async function insertNotificationIfNotExist({
  supabase,
  recipientId,
  senderId,
  type,
  message,
  metadata,
  todayStr
}: {
  supabase: any;
  recipientId: string;
  senderId: string;
  type: string;
  message: string;
  metadata: Record<string, any>;
  todayStr: string;
}) {
  const { data: existing } = await supabase
    .from("parent_notifications")
    .select("metadata")
    .eq("parent_id", recipientId)
    .eq("notification_type", type)
    .gte("created_at", `${todayStr}T00:00:00.000Z`);

  const metaKey = Object.keys(metadata)[0];
  const metaVal = metadata[metaKey];

  const alreadySent = (existing ?? []).some((n: any) => n.metadata && n.metadata[metaKey] === metaVal);

  if (!alreadySent) {
    await supabase.from("parent_notifications").insert({
      parent_id: recipientId,
      sender_id: senderId,
      type,
      notification_type: type,
      message,
      is_read: false,
      metadata
    });
  }
}