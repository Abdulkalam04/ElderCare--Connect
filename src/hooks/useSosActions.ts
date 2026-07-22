import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/hooks/useProfile";
import { useLinkedChildren } from "@/hooks/useProfile";
import { captureLocation, reverseGeocode } from "@/lib/geolocation";
import { notifySosAlert } from "@/lib/api/sosNotify.functions";
import { sendPushForAlert } from "@/lib/api/pushNotify.functions";
type EmergencyContact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
  priority: number;
};
type SosSettings = {
  sos_share_location: boolean;
  sos_auto_call_primary: boolean;
  sos_escalation_minutes: number;
};
type DeliveryResult = {
  inAppSent: number;
  emailSent: number;
  emailFailed: number;
  pushSent: number;
  pushFailed: number;
  emailReason: string | null;
  pushReason: string | null;
};
type ServerDeliveryResult = {
  sent?: number;
  failed?: number;
  reason?: string;
  skipped?: string | number;
};
type SosAlertSummary = {
  id: string;
  parent_id: string;
  parent_name: string | null;
  message: string | null;
  status: "active" | "acknowledged" | "resolved";
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
};
const DEFAULT_SETTINGS: SosSettings = {
  sos_share_location: true,
  sos_auto_call_primary: false,
  sos_escalation_minutes: 5,
};
function cleanPhone(value: string | null | undefined) {
  return value?.replace(/[^+\d]/g, "") ?? "";
}
function getCooldownKey(parentId: string) {
  return `eldercare:sos-cooldown:${parentId}`;
}
export function useSosActions({
  parentId,
  actor,
}: {
  parentId: string | null | undefined;
  actor: Profile | null | undefined;
}) {
  const qc = useQueryClient();
  const notifyEmail = useServerFn(notifySosAlert);
  const notifyPush = useServerFn(sendPushForAlert);
  const canTrigger = Boolean(actor?.role === "parent" && actor.id === parentId);
  const { data: linkedChildren = [] } = useLinkedChildren(
    canTrigger ? (parentId ?? undefined) : undefined,
  );
  const { data: emergencyContacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["emergency_contacts", parentId],
    enabled: Boolean(parentId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("emergency_contacts")
        .select("id,name,phone,email,relationship,priority")
        .eq("parent_id", parentId!)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmergencyContact[];
    },
  });
  const { data: trustedCaregiverEmails = [] } = useQuery({
    queryKey: ["trusted-caregiver-emails", parentId],
    enabled: Boolean(parentId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("trusted_caregivers")
        .select("email")
        .eq("parent_id", parentId!)
        .eq("available", true)
        .not("email", "is", null);
      if (error) {
        console.warn("Trusted caregiver emails are unavailable", error);
        return [] as string[];
      }
      return (data ?? [])
        .map((row: { email?: string | null }) => row.email?.trim().toLowerCase())
        .filter((email: string | undefined): email is string => Boolean(email));
    },
  });
  const { data: settings = DEFAULT_SETTINGS } = useQuery({
    queryKey: ["elder-settings-sos", parentId],
    enabled: Boolean(parentId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("elder_settings")
        .select("sos_share_location,sos_auto_call_primary,sos_escalation_minutes")
        .eq("parent_id", parentId!)
        .maybeSingle();
      if (error) throw error;
      return {
        ...DEFAULT_SETTINGS,
        ...(data ?? {}),
      } as SosSettings;
    },
  });
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!parentId || typeof window === "undefined") {
      setCooldown(0);
      return;
    }
    const key = getCooldownKey(parentId);
    const update = () => {
      const deadline = Number(window.localStorage.getItem(key) ?? 0);
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCooldown(seconds);
      if (seconds === 0 && deadline > 0) {
        window.localStorage.removeItem(key);
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [parentId]);
  const startCooldown = (seconds: number) => {
    if (!parentId || typeof window === "undefined") return;
    window.localStorage.setItem(getCooldownKey(parentId), String(Date.now() + seconds * 1000));
    setCooldown(seconds);
  };
  const primaryContact = emergencyContacts.find((contact) => cleanPhone(contact.phone));
  const automatedRecipientCount = useMemo(() => {
    const emergencyEmailCount = new Set(
      emergencyContacts
        .map((contact) => contact.email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    ).size;
    return linkedChildren.length + emergencyEmailCount + new Set(trustedCaregiverEmails).size;
  }, [emergencyContacts, linkedChildren.length, trustedCaregiverEmails]);
  const delivery = useMutation({
    mutationFn: async ({
      alertId,
      isResend,
    }: {
      alertId: string;
      isResend: boolean;
    }): Promise<DeliveryResult> => {
      let inAppSent = 0;
      let inAppError: Error | null = null;
      if (linkedChildren.length > 0 && actor) {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const notifications = linkedChildren.map((child) => ({
          parent_id: child.id,
          sender_id: actor.id,
          type: "sos",
          notification_type: "sos",
          message: isResend
            ? `${actor.full_name || "Your family member"} has resent an active SOS alert at ${timeLabel}. Please respond immediately.`
            : `${actor.full_name || "Your family member"} sent an SOS alert at ${timeLabel}. Please respond immediately.`,
          is_read: false,
          metadata: {
            alert_id: alertId,
            parent_name: actor.full_name,
            triggered_at: now.toISOString(),
            resent: isResend,
          },
        }));
        const { data, error } = await (supabase as any)
          .from("parent_notifications")
          .insert(notifications)
          .select("id");
        if (error) inAppError = new Error(error.message);
        else inAppSent = data?.length ?? 0;
      }
      const [emailResult, pushResult] = await Promise.allSettled([
        notifyEmail({ data: { alertId, alertType: isResend ? "manual_resend" : "manual" } }),
        notifyPush({ data: { alertId, alertType: isResend ? "manual_resend" : "manual" } }),
      ]);
      const email =
        emailResult.status === "fulfilled" ? (emailResult.value as ServerDeliveryResult) : null;
      const push =
        pushResult.status === "fulfilled" ? (pushResult.value as ServerDeliveryResult) : null;
      if (inAppError) {
        console.error("SOS in-app notification delivery failed:", inAppError);
      }
      if (emailResult.status === "rejected") {
        console.error("SOS email delivery failed:", emailResult.reason);
      }
      if (pushResult.status === "rejected") {
        console.error("SOS push delivery failed:", pushResult.reason);
      }
      return {
        inAppSent,
        emailSent: email?.sent ?? 0,
        emailFailed: email?.failed ?? (emailResult.status === "rejected" ? 1 : 0),
        pushSent: push?.sent ?? 0,
        pushFailed: push?.failed ?? (pushResult.status === "rejected" ? 1 : 0),
        emailReason: email?.reason ?? (typeof email?.skipped === "string" ? email.skipped : null),
        pushReason: push?.reason ?? (typeof push?.skipped === "string" ? push.skipped : null),
      };
    },
    onSuccess: (result) => {
      const delivered = result.inAppSent + result.emailSent + result.pushSent;
      const failed = result.emailFailed + result.pushFailed;
      if (delivered > 0) {
        toast.success(
          `SOS notifications delivered through ${delivered} available channel${delivered === 1 ? "" : "s"}.`,
        );
      } else if (automatedRecipientCount === 0) {
        toast.warning(
          "SOS is active, but no linked family member or emergency-contact email is configured. Use the call and message buttons below.",
          { duration: 9000 },
        );
      } else if (failed > 0) {
        toast.warning(
          "SOS is active, but one or more external notification services failed. Use the contact buttons as a backup.",
          { duration: 9000 },
        );
      } else {
        toast.info(
          "SOS is active. Email or push delivery may be disabled or not configured; in-app contact actions remain available.",
          { duration: 9000 },
        );
      }
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifUnread"] });
    },
  });
  const trigger = useMutation({
    mutationFn: async (): Promise<{
      alert: SosAlertSummary;
      created: boolean;
    }> => {
      if (!actor || actor.role !== "parent" || actor.id !== parentId) {
        throw new Error("Only the care-recipient account can activate SOS.");
      }
      const { data: existing, error: existingError } = await supabase
        .from("sos_alerts")
        .select("id,parent_id,parent_name,message,status,created_at,latitude,longitude,address")
        .eq("parent_id", actor.id)
        .in("status", ["active", "acknowledged"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        return { alert: existing as SosAlertSummary, created: false };
      }
      let latitude: number | null = null;
      let longitude: number | null = null;
      let address: string | null = null;
      if (settings.sos_share_location) {
        const coords = await captureLocation(3500);
        if (coords) {
          latitude = coords.latitude;
          longitude = coords.longitude;
          address = await reverseGeocode(coords.latitude, coords.longitude, 1800);
        }
      }
      const { data: inserted, error } = await supabase
        .from("sos_alerts")
        .insert({
          parent_id: actor.id,
          parent_name: actor.full_name || "Care recipient",
          message: "Emergency assistance requested",
          latitude,
          longitude,
          address,
          location_updated_at: latitude != null ? new Date().toISOString() : null,
          live_location_enabled: settings.sos_share_location,
          status: "active",
          alert_type: "manual",
        } as any)
        .select("id,parent_id,parent_name,message,status,created_at,latitude,longitude,address")
        .single();
      if (error) throw error;
      const now = new Date();
      const { error: confirmationError } = await (supabase as any)
        .from("parent_notifications")
        .insert({
          parent_id: actor.id,
          sender_id: actor.id,
          type: "sos_sent",
          notification_type: "sos_sent",
          message: `Your SOS alert was activated at ${now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}.`,
          is_read: false,
          metadata: {
            alert_id: inserted.id,
            triggered_at: now.toISOString(),
          },
        });
      if (confirmationError) {
        console.error("SOS confirmation notification failed:", confirmationError);
      }
      return { alert: inserted as SosAlertSummary, created: true };
    },
    onSuccess: ({ alert, created }) => {
      startCooldown(created ? 30 : 15);
      if (created) {
        toast.success("SOS activated. Emergency notifications are being sent.", {
          duration: 7000,
        });
      } else {
        toast.warning(
          "An SOS alert is already active. Its notifications are being sent again instead of creating a duplicate.",
          { duration: 8000 },
        );
      }
      qc.invalidateQueries({ queryKey: ["sos"] });
      qc.invalidateQueries({ queryKey: ["activeSosAlerts"] });
      qc.invalidateQueries({ queryKey: ["activeSosDashboard"] });
      qc.invalidateQueries({ queryKey: ["parent_active_sos"] });
      delivery.mutate({ alertId: alert.id, isResend: !created });
      if (created && settings.sos_auto_call_primary && primaryContact?.phone) {
        const phone = cleanPhone(primaryContact.phone);
        if (phone) {
          toast.info(`Opening the dialler for ${primaryContact.name}.`, {
            duration: 5000,
          });
          window.setTimeout(() => {
            window.location.href = `tel:${phone}`;
          }, 600);
        }
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Unable to activate SOS.");
    },
  });
  const resend = useMutation({
    mutationFn: async (alertId: string) => {
      if (!canTrigger)
        throw new Error("Only the care-recipient account can resend SOS notifications.");
      return delivery.mutateAsync({ alertId, isResend: true });
    },
    onSuccess: () => {
      startCooldown(15);
      toast.success("SOS notifications sent again.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return {
    canTrigger,
    linkedChildren,
    emergencyContacts,
    contactsLoading,
    settings,
    primaryContact,
    automatedRecipientCount,
    cooldown,
    trigger,
    resend,
    delivery,
  };
}
