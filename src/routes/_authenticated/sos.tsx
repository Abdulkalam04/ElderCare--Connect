import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bell,
  BellOff,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  MapPin,
  RefreshCw,
  Send,
  ShieldAlert,
  Siren,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmergencyCallButtons } from "@/components/EmergencyCallButtons";
import { EmergencyServicesCard } from "@/components/EmergencyServicesCard";
import { NearbyTrustedCaregivers } from "@/components/NearbyTrustedCaregivers";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useActiveParent } from "@/hooks/useProfile";
import { useRealtimeSosAlerts } from "@/hooks/useRealtimeSosAlerts";
import { useSosActions } from "@/hooks/useSosActions";
import { mapsLink } from "@/lib/geolocation";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermission,
  isPushSupported,
} from "@/lib/push";
export const Route = createFileRoute("/_authenticated/sos")({
  ssr: false,
  component: SOSPage,
});
type SOSAlert = {
  id: string;
  parent_id: string;
  parent_name: string | null;
  message: string | null;
  status: "active" | "acknowledged" | "resolved";
  created_at: string;
  resolved_at: string | null;
  alert_type: string;
  dedup_key: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  alert_timestamp: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_by: string | null;
  location_updated_at: string | null;
  location_accuracy: number | null;
  live_location_enabled: boolean;
};
type ActorProfile = {
  id: string;
  full_name: string | null;
};
function SOSPage() {
  const {
    activeParentId,
    activeParent,
    isChildView,
    profile,
    isLoading: profileLoading,
  } = useActiveParent();
  const qc = useQueryClient();
  const sosActions = useSosActions({ parentId: activeParentId, actor: profile });
  useRealtimeSosAlerts(activeParentId ? [activeParentId] : [], {
    currentUserId: profile?.id,
    notifyOnInsert: isChildView,
  });
  const [pushState, setPushState] = useState("loading");
  useEffect(() => {
    setPushState(getPushPermission());
  }, []);
  async function togglePush() {
    if (pushState === "granted") {
      await disablePushNotifications();
      setPushState(getPushPermission());
      toast.success("SOS push notifications disabled on this device.");
      return;
    }
    const result = await enablePushNotifications();
    setPushState(getPushPermission());
    if (result.ok) toast.success("SOS push notifications enabled on this device.");
    else toast.error(result.reason || "Could not enable SOS push notifications.");
  }
  const {
    data: alerts = [],
    isLoading: alertsLoading,
    isError: alertsFailed,
    error: alertsError,
    refetch: refetchAlerts,
    isFetching: alertsFetching,
  } = useQuery({
    queryKey: ["sos", activeParentId],
    enabled: Boolean(activeParentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sos_alerts")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SOSAlert[];
    },
  });
  const actorIds = useMemo(
    () =>
      [...new Set(alerts.flatMap((alert) => [alert.acknowledged_by, alert.resolved_by]))]
        .filter((id): id is string => Boolean(id))
        .sort(),
    [alerts],
  );
  const { data: actorProfiles = [] } = useQuery({
    queryKey: ["sos-actor-profiles", activeParentId, actorIds.join(",")],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", actorIds);
      if (error) throw error;
      return (data ?? []) as ActorProfile[];
    },
  });
  const getActorName = (id: string | null) => {
    if (!id) return "Unknown family member";
    if (id === profile?.id) return profile.full_name || "You";
    return actorProfiles.find((actor) => actor.id === id)?.full_name || "Family member";
  };
  const acknowledge = useMutation({
    mutationFn: async (alert: SOSAlert) => {
      if (!profile || profile.role !== "child") {
        throw new Error("Only a linked family-member account can acknowledge an SOS.");
      }
      const acknowledgedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("sos_alerts")
        .update({
          status: "acknowledged",
          acknowledged_at: acknowledgedAt,
          acknowledged_by: profile.id,
        } as any)
        .eq("id", alert.id)
        .eq("parent_id", activeParentId!)
        .eq("status", "active")
        .select("id,parent_id,status,acknowledged_at,acknowledged_by")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("This SOS was already acknowledged, resolved, or changed elsewhere.");
      }
      const { error: notificationError } = await (supabase as any)
        .from("parent_notifications")
        .insert({
          parent_id: alert.parent_id,
          sender_id: profile.id,
          type: "sos_acknowledged",
          notification_type: "sos_acknowledged",
          message: `${profile.full_name || "A linked family member"} acknowledged your SOS alert.`,
          is_read: false,
          metadata: {
            alert_id: alert.id,
            acknowledged_at: acknowledgedAt,
            acknowledged_by: profile.id,
          },
        });
      if (notificationError) {
        console.error("Could not create SOS acknowledgement notification:", notificationError);
      }
      return data;
    },
    onSuccess: () => {
      toast.success("SOS acknowledged. The care recipient can now see that you responded.");
      invalidateSosQueries(qc);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resolve = useMutation({
    mutationFn: async (alert: SOSAlert) => {
      if (!profile) throw new Error("You must be signed in.");
      const resolvedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("sos_alerts")
        .update({
          status: "resolved",
          resolved_at: resolvedAt,
          resolved_by: profile.id,
          live_location_enabled: false,
        } as any)
        .eq("id", alert.id)
        .eq("parent_id", activeParentId!)
        .in("status", ["active", "acknowledged"])
        .select("id,parent_id,status,resolved_at,resolved_by")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("This SOS was already resolved or changed elsewhere.");
      }
      const { data: links, error: linksError } = await supabase
        .from("parent_child_links")
        .select("child_id")
        .eq("parent_id", alert.parent_id);
      if (linksError) console.error("Could not load SOS notification recipients:", linksError);
      const recipientIds = new Set<string>([
        alert.parent_id,
        ...(links ?? []).map((link) => link.child_id),
      ]);
      recipientIds.delete(profile.id);
      if (recipientIds.size > 0) {
        const actorName = profile.full_name || "A family member";
        const notifications = [...recipientIds].map((recipientId) => ({
          parent_id: recipientId,
          sender_id: profile.id,
          type: "sos_resolved",
          notification_type: "sos_resolved",
          message: `${actorName} marked the SOS alert as resolved.`,
          is_read: false,
          metadata: {
            alert_id: alert.id,
            resolved_at: resolvedAt,
            resolved_by: profile.id,
          },
        }));
        const { error: notificationError } = await (supabase as any)
          .from("parent_notifications")
          .insert(notifications);
        if (notificationError) {
          console.error("Could not create SOS resolved notifications:", notificationError);
        }
      }
      return data;
    },
    onSuccess: () => {
      toast.success("SOS marked as resolved.");
      invalidateSosQueries(qc);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteResolved = useMutation({
    mutationFn: async (alert: SOSAlert) => {
      if (!profile || profile.role !== "parent" || profile.id !== alert.parent_id) {
        throw new Error("Only the care-recipient account can delete its resolved SOS history.");
      }
      const { data, error } = await supabase
        .from("sos_alerts")
        .delete()
        .eq("id", alert.id)
        .eq("parent_id", profile.id)
        .eq("status", "resolved")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The SOS history item was not deleted.");
      return data.id;
    },
    onSuccess: (deletedId) => {
      qc.setQueryData<SOSAlert[]>(["sos", activeParentId], (current = []) =>
        current.filter((alert) => alert.id !== deletedId),
      );
      toast.success("SOS history item deleted.");
      invalidateSosQueries(qc);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const clearHistory = useMutation({
    mutationFn: async () => {
      if (!profile || profile.role !== "parent" || profile.id !== activeParentId) {
        throw new Error("Only the care-recipient account can clear SOS history.");
      }
      const { data, error } = await supabase
        .from("sos_alerts")
        .delete()
        .eq("parent_id", profile.id)
        .eq("status", "resolved")
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      qc.setQueryData<SOSAlert[]>(["sos", activeParentId], (current = []) =>
        current.filter((alert) => alert.status !== "resolved"),
      );
      toast.success(
        count === 1 ? "1 SOS history item deleted." : `${count} SOS history items deleted.`,
      );
      invalidateSosQueries(qc);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const activeAlerts = alerts.filter(
    (alert) => alert.status === "active" || alert.status === "acknowledged",
  );
  const resolvedAlerts = alerts.filter((alert) => alert.status === "resolved");
  const hasManualContact = sosActions.emergencyContacts.some((contact) =>
    Boolean(contact.phone || contact.email),
  );
  if (profileLoading) {
    return (
      <AppShell>
        <div className="grid min-h-[45vh] place-items-center">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }
  if (!activeParent || !activeParentId || !profile) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-border bg-card p-12 text-center">
          <ShieldAlert className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h1 className="font-display text-2xl font-bold">No care-recipient account selected</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect or select a care-recipient account before opening SOS monitoring.
          </p>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold italic sm:text-4xl">Emergency SOS</h1>
          <p className="mt-1 text-muted-foreground">
            {isChildView
              ? `Emergency monitoring for ${activeParent.full_name || "the care recipient"}`
              : "Activate an emergency alert and contact your support network"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAlerts()}
            disabled={alertsFetching}
            className="rounded-xl"
          >
            <RefreshCw className={`mr-2 size-4 ${alertsFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {isChildView && isPushSupported() && (
            <Button variant="outline" size="sm" onClick={togglePush} className="rounded-xl">
              {pushState === "granted" ? (
                <>
                  <BellOff className="mr-2 size-4" /> Disable SOS push
                </>
              ) : (
                <>
                  <Bell className="mr-2 size-4" /> Enable SOS push
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {alertsFailed && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load SOS alerts:{" "}
          {alertsError instanceof Error ? alertsError.message : "Unknown error"}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {!isChildView && (
          <section className="space-y-5 lg:col-span-12">
            {sosActions.linkedChildren.length === 0 && sosActions.automatedRecipientCount === 0 && (
              <div className="flex items-start gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
                <ShieldAlert className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">No automatic SOS recipient is configured</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    The SOS alert can still be activated and stored, but no linked family member or
                    emergency-contact email can be notified automatically. Add a family member or an
                    emergency contact, and use the manual call/message actions below as a backup.
                  </p>
                </div>
              </div>
            )}

            {sosActions.linkedChildren.length === 0 && sosActions.automatedRecipientCount > 0 && (
              <div className="flex items-start gap-4 rounded-3xl border border-blue-200 bg-blue-50 p-5 text-blue-900">
                <ShieldAlert className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">No linked family account</p>
                  <p className="mt-1 text-xs">
                    Emergency-contact emails can still receive the SOS, but in-app and push alerts
                    require a linked family-member account.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => sosActions.trigger.mutate()}
              disabled={sosActions.trigger.isPending || sosActions.cooldown > 0}
              className={`relative w-full select-none overflow-hidden rounded-3xl p-8 text-white shadow-2xl transition-all sm:p-14 ${
                sosActions.cooldown > 0
                  ? "cursor-not-allowed bg-stone-500 shadow-stone-500/10"
                  : activeAlerts.length > 0
                    ? "cursor-pointer bg-orange-600 shadow-orange-600/30 hover:scale-[1.01] active:scale-[0.99]"
                    : "cursor-pointer bg-red-600 shadow-red-600/30 hover:scale-[1.01] active:scale-[0.99]"
              }`}
              style={
                sosActions.cooldown === 0 && activeAlerts.length === 0
                  ? { animation: "siren-pulse 2s infinite ease-in-out" }
                  : undefined
              }
            >
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
                <div className="grid size-16 shrink-0 place-items-center rounded-full border-4 border-white/30 sm:size-24">
                  {sosActions.trigger.isPending ? (
                    <Loader2 className="size-8 animate-spin sm:size-12" />
                  ) : (
                    <Siren className="size-8 sm:size-12" />
                  )}
                </div>
                <div className="text-center sm:text-left">
                  <p className="font-display text-3xl font-black uppercase tracking-tight sm:text-5xl">
                    {sosActions.cooldown > 0
                      ? `Please wait ${sosActions.cooldown}s`
                      : sosActions.trigger.isPending
                        ? "Activating SOS…"
                        : activeAlerts.length > 0
                          ? "Resend SOS alert"
                          : "Send SOS"}
                  </p>
                  <p className="mt-1.5 text-sm font-medium text-white/85">
                    {activeAlerts.length > 0
                      ? "The current emergency remains active; this resends its notifications without creating a duplicate."
                      : sosActions.settings.sos_share_location
                        ? "Your available location and emergency request will be shared with configured recipients."
                        : "Location sharing is disabled in Settings; the emergency request will still be sent."}
                  </p>
                </div>
              </div>
            </button>

            {sosActions.delivery.isPending && (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Delivering in-app, email, and push notifications through the configured channels…
              </div>
            )}
          </section>
        )}

        <section className="space-y-5 lg:col-span-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-2xl font-bold">
              <Siren
                className={`size-6 ${activeAlerts.length > 0 ? "animate-pulse text-destructive" : "text-muted-foreground"}`}
              />
              Current emergency status
            </h2>
            {alertsLoading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
          </div>

          {activeAlerts.length === 0 ? (
            <div className="flex items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
              <CheckCircle2 className="size-6 shrink-0 text-emerald-600" />
              <div>
                <h3 className="font-semibold">All clear</h3>
                <p className="mt-0.5 text-sm">There is no active emergency alert.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {activeAlerts.map((alert) => (
                <article
                  key={alert.id}
                  className="relative overflow-hidden rounded-3xl border-2 border-red-200 bg-red-50/60 p-6 shadow-lg shadow-red-500/5"
                >
                  <div className="absolute right-0 top-0 grid size-24 place-items-center rounded-bl-full bg-red-100 opacity-50">
                    <Siren className="size-10 text-red-500" />
                  </div>

                  <div className="relative space-y-4">
                    <div>
                      <span className="block font-mono text-[10px] font-semibold uppercase tracking-widest text-red-600">
                        Care recipient
                      </span>
                      <h3 className="mt-1 text-xl font-bold text-stone-900">
                        {alert.parent_name || activeParent.full_name || "Care recipient"}
                      </h3>
                      <p className="mt-1 text-sm text-stone-600">
                        {alert.message || "Emergency assistance requested"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
                          Activated
                        </span>
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                          <CalendarDays className="size-4 text-stone-500" />
                          {format(new Date(alert.created_at), "MMM d, yyyy")}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                          <Clock className="size-4 text-stone-500" />
                          {format(new Date(alert.created_at), "h:mm a")}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                        </p>
                      </div>

                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
                          Status
                        </span>
                        <span
                          className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                            alert.status === "active"
                              ? "animate-pulse bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${alert.status === "active" ? "bg-red-600" : "bg-amber-500"}`}
                          />
                          {alert.status}
                        </span>
                        {alert.live_location_enabled && alert.location_updated_at && (
                          <p className="mt-2 text-[11px] font-medium text-emerald-700">
                            ● Live location updated{" "}
                            {formatDistanceToNow(new Date(alert.location_updated_at), {
                              addSuffix: true,
                            })}
                            {alert.location_accuracy != null
                              ? ` (±${Math.round(alert.location_accuracy)} m)`
                              : ""}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-stone-500">
                        Location
                      </span>
                      {alert.latitude != null && alert.longitude != null ? (
                        <div className="mt-1 space-y-2">
                          <p className="flex items-start gap-2 rounded-xl border border-red-100 bg-white/80 p-2.5 text-sm font-medium text-stone-800">
                            <MapPin className="mt-0.5 size-4 shrink-0 text-red-500" />
                            <span>
                              {alert.address ||
                                `${alert.latitude.toFixed(5)}, ${alert.longitude.toFixed(5)}`}
                            </span>
                          </p>
                          <a
                            href={mapsLink(alert.latitude, alert.longitude)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-xs font-semibold text-red-600 hover:underline"
                          >
                            Open location in Maps →
                          </a>
                        </div>
                      ) : (
                        <p className="mt-1 flex items-center gap-2 rounded-xl bg-white/60 p-2.5 text-sm font-medium italic text-stone-500">
                          <ShieldAlert className="size-4 shrink-0 text-stone-400" />
                          {sosActions.settings.sos_share_location
                            ? "Location was unavailable when the SOS was activated."
                            : "Location sharing is disabled in Settings."}
                        </p>
                      )}
                    </div>

                    {alert.status === "acknowledged" && alert.acknowledged_at && (
                      <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                        <Eye className="size-4 shrink-0 text-amber-600" />
                        <span>
                          Acknowledged by <strong>{getActorName(alert.acknowledged_by)}</strong> at{" "}
                          {format(new Date(alert.acknowledged_at), "h:mm a")}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 pt-1">
                      {isChildView && alert.status === "active" && (
                        <Button
                          onClick={() => acknowledge.mutate(alert)}
                          disabled={acknowledge.isPending}
                          className="flex-1 rounded-xl bg-amber-500 text-white hover:bg-amber-600"
                        >
                          {acknowledge.isPending ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Eye className="mr-2 size-4" />
                          )}
                          Acknowledge
                        </Button>
                      )}

                      {!isChildView && (
                        <Button
                          variant="outline"
                          onClick={() => sosActions.resend.mutate(alert.id)}
                          disabled={sosActions.resend.isPending || sosActions.cooldown > 0}
                          className="flex-1 rounded-xl border-orange-300 text-orange-700 hover:bg-orange-50"
                        >
                          {sosActions.resend.isPending ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 size-4" />
                          )}
                          Resend notifications
                        </Button>
                      )}

                      <Button
                        onClick={() => resolve.mutate(alert)}
                        disabled={resolve.isPending}
                        className="flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        {resolve.isPending ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 size-4" />
                        )}
                        Mark resolved
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-12">
          <EmergencyServicesCard
            subjectName={activeParent.full_name || "The care recipient"}
            latitude={activeAlerts[0]?.latitude}
            longitude={activeAlerts[0]?.longitude}
          />
        </section>

        <section className="lg:col-span-12">
          <NearbyTrustedCaregivers
            parentId={activeParentId}
            subjectName={activeParent.full_name || "The care recipient"}
            latitude={activeAlerts[0]?.latitude}
            longitude={activeAlerts[0]?.longitude}
          />
        </section>

        <section className="lg:col-span-12">
          <EmergencyCallButtons
            caregivers={sosActions.linkedChildren.map((child) => ({
              id: child.id,
              name: child.full_name,
              phone: child.phone,
              email: child.email,
            }))}
            emergencyContacts={sosActions.emergencyContacts.map((contact) => ({
              id: contact.id,
              name: contact.name,
              phone: contact.phone,
              email: contact.email,
              relation: contact.relationship,
            }))}
            profileEmergency={{
              name: activeParent.emergency_contact_name,
              phone: activeParent.emergency_contact_phone,
            }}
            parentProfile={
              isChildView
                ? {
                    name: activeParent.full_name,
                    phone: activeParent.phone,
                    email: activeParent.email,
                  }
                : null
            }
            emergencySubjectName={activeParent.full_name || "The care recipient"}
          />

          {!hasManualContact && sosActions.linkedChildren.length === 0 && (
            <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Add at least one callable or emailable emergency contact so a manual backup action is
              available when automatic delivery fails.
            </p>
          )}
        </section>

        <section className="lg:col-span-12">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold italic">
              {isChildView
                ? `Emergency history for ${activeParent.full_name || "care recipient"}`
                : "My emergency history"}
            </h2>

            {!isChildView && resolvedAlerts.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (
                    window.confirm(
                      "Permanently delete all resolved SOS history? Active alerts will not be deleted.",
                    )
                  ) {
                    clearHistory.mutate();
                  }
                }}
                disabled={clearHistory.isPending}
                className="rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
              >
                {clearHistory.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Clear resolved history
              </Button>
            )}
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            {resolvedAlerts.length === 0 ? (
              <div className="p-12 text-center text-sm font-medium text-muted-foreground">
                No resolved SOS alerts found.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {resolvedAlerts.map((alert) => (
                  <article
                    key={alert.id}
                    className="flex flex-col justify-between gap-4 p-6 transition-colors hover:bg-stone-50/50 md:flex-row md:items-center"
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-2xl bg-stone-100 text-stone-500">
                        <Siren className="size-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-stone-900">
                            {alert.parent_name || activeParent.full_name || "Care recipient"}
                          </p>
                          <span className="rounded bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-stone-600">
                            Resolved
                          </span>
                        </div>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarDays className="size-3.5" />
                          {format(new Date(alert.created_at), "MMM d, yyyy")}
                          <Clock className="ml-1.5 size-3.5" />
                          {format(new Date(alert.created_at), "h:mm a")}
                        </p>
                        {alert.latitude != null && alert.longitude != null && (
                          <a
                            href={mapsLink(alert.latitude, alert.longitude)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-start gap-1 text-xs text-stone-600 hover:text-primary hover:underline"
                          >
                            <MapPin className="mt-0.5 size-3.5 shrink-0 text-stone-400" />
                            <span>
                              {alert.address ||
                                `${alert.latitude.toFixed(5)}, ${alert.longitude.toFixed(5)}`}
                            </span>
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1 rounded-2xl border border-stone-100 bg-stone-50 p-3 text-left text-xs text-stone-500 md:min-w-[280px] md:text-right">
                        {alert.acknowledged_by && alert.acknowledged_at && (
                          <p className="mb-1">
                            Acknowledged by <strong>{getActorName(alert.acknowledged_by)}</strong>{" "}
                            at {format(new Date(alert.acknowledged_at), "h:mm a")}
                          </p>
                        )}
                        {alert.resolved_by && alert.resolved_at && (
                          <p>
                            Resolved by <strong>{getActorName(alert.resolved_by)}</strong> at{" "}
                            {format(new Date(alert.resolved_at), "h:mm a")}
                          </p>
                        )}
                      </div>

                      {!isChildView && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (
                              window.confirm("Permanently delete this resolved SOS history item?")
                            ) {
                              deleteResolved.mutate(alert);
                            }
                          }}
                          disabled={deleteResolved.isPending}
                          className="shrink-0 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Delete SOS history item"
                          title="Delete this history item"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
function invalidateSosQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["sos"] });
  qc.invalidateQueries({ queryKey: ["activeSosAlerts"] });
  qc.invalidateQueries({ queryKey: ["activeSosDashboard"] });
  qc.invalidateQueries({ queryKey: ["parent_active_sos"] });
}
