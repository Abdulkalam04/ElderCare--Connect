import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useCurrentUser } from "@/hooks/useProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bell,
  BellOff,
  Pill,
  Siren,
  CalendarDays,
  CalendarX,
  Car,
  MessageCircle,
  Phone,
  CheckCheck,
  Trash2,
  RefreshCw,
  Video,
  UserCheck,
  ShieldCheck,
  SendHorizonal,
  ChevronRight,
  HeartPulse,
  Activity,
} from "lucide-react";
export const Route = createFileRoute("/_authenticated/notifications")({
  ssr: false,
  component: NotificationsPage,
});
type NotifType =
  | "missed_medicine"
  | "missed_checkin"
  | "no_app_activity"
  | "sos"
  | "sos_sent"
  | "sos_acknowledged"
  | "sos_resolved"
  | "sos_escalation"
  | "appointment_reminder"
  | "missed_appointment"
  | "caregiver_alert"
  | "caregiver_booking"
  | "video_consult"
  | "transport_alert"
  | "health_risk_high"
  | "companion_emergency"
  | "push_test"
  | "reminder"
  | "call"
  | string;
interface Notification {
  id: string;
  parent_id: string;
  sender_id: string;
  type: string;
  notification_type: string | null;
  message: string;
  is_read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  deleted_at: string | null;
}
const TYPE_TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "missed_medicine", label: "Medication" },
  { key: "missed_checkin", label: "Wellbeing" },
  { key: "no_app_activity", label: "App Activity" },
  { key: "sos", label: "Emergency" },
  { key: "appointment_reminder", label: "Appointments" },
  { key: "caregiver_alert", label: "Caregiver" },
  { key: "health_risk_high", label: "Health Risk" },
  { key: "companion_emergency", label: "Companion Safety" },
  { key: "video_consult", label: "Video Consult" },
  { key: "transport_alert", label: "Transport" },
  { key: "reminder", label: "Reminders" },
] as const;
type TabKey = (typeof TYPE_TABS)[number]["key"];
function getNotifRoute(type: NotifType): string {
  switch (type) {
    case "missed_medicine":
    case "reminder":
      return "/medicines";
    case "missed_checkin":
      return "/wellbeing";
    case "no_app_activity":
    case "companion_emergency":
      return "/emergency-detection";
    case "sos":
    case "sos_sent":
    case "sos_acknowledged":
    case "sos_resolved":
    case "sos_escalation":
      return "/sos";
    case "appointment_reminder":
    case "missed_appointment":
      return "/appointments";
    case "caregiver_alert":
    case "caregiver_booking":
      return "/caregivers";
    case "video_consult":
      return "/video";
    case "transport_alert":
      return "/transport";
    case "health_risk_high":
      return "/health-risk";
    case "push_test":
      return "/settings";
    default:
      return "/notifications";
  }
}
function getNotifIcon(type: NotifType) {
  switch (type) {
    case "missed_medicine":
      return <Pill className="size-5" />;
    case "missed_checkin":
      return <HeartPulse className="size-5" />;
    case "no_app_activity":
      return <Activity className="size-5" />;
    case "sos":
      return <Siren className="size-5" />;
    case "sos_sent":
      return <SendHorizonal className="size-5" />;
    case "sos_acknowledged":
      return <UserCheck className="size-5" />;
    case "sos_resolved":
      return <ShieldCheck className="size-5" />;
    case "sos_escalation":
      return <Siren className="size-5" />;
    case "appointment_reminder":
      return <CalendarDays className="size-5" />;
    case "missed_appointment":
      return <CalendarX className="size-5" />;
    case "caregiver_alert":
    case "caregiver_booking":
      return <UserCheck className="size-5" />;
    case "video_consult":
      return <Video className="size-5" />;
    case "transport_alert":
      return <Car className="size-5" />;
    case "health_risk_high":
      return <HeartPulse className="size-5" />;
    case "companion_emergency":
      return <ShieldCheck className="size-5" />;
    case "push_test":
      return <Bell className="size-5" />;
    case "reminder":
      return <Bell className="size-5" />;
    case "call":
      return <Phone className="size-5" />;
    default:
      return <MessageCircle className="size-5" />;
  }
}
function getNotifColors(type: NotifType, isRead: boolean) {
  if (isRead) return "bg-[#eef2f1] text-[#899a9d]";
  switch (type) {
    case "missed_medicine":
      return "bg-[#f5eadf] text-[#9c6637]";
    case "missed_checkin":
      return "bg-[#f4e9ec] text-[#8d5b6c]";
    case "no_app_activity":
      return "bg-[#e9eff2] text-[#536f79]";
    case "sos":
    case "sos_escalation":
      return "bg-[#f7e7e5] text-[#a74d48]";
    case "sos_sent":
      return "bg-[#f5eadf] text-[#9c6637]";
    case "sos_acknowledged":
      return "bg-[#e7eef5] text-[#4f6f8d]";
    case "sos_resolved":
      return "bg-[#e4f1ec] text-[#19705f]";
    case "appointment_reminder":
      return "bg-[#e7eef5] text-[#4f6f8d]";
    case "missed_appointment":
      return "bg-[#f7e7e5] text-[#a74d48]";
    case "caregiver_alert":
    case "caregiver_booking":
      return "bg-[#e4f1ed] text-[#176f69]";
    case "video_consult":
      return "bg-[#e9edf4] text-[#596c88]";
    case "transport_alert":
      return "bg-[#e5eff3] text-[#4f7280]";
    case "health_risk_high":
      return "bg-[#f7e7e5] text-[#a74d48]";
    case "companion_emergency":
      return "bg-[#f7e7e5] text-[#a74d48]";
    case "push_test":
      return "bg-[#eeeaf2] text-[#6c5d7b]";
    case "reminder":
      return "bg-[#eeeaf2] text-[#6c5d7b]";
    case "call":
      return "bg-[#e4f1ed] text-[#176f69]";
    default:
      return "bg-[#e8f2ef] text-[#176f69]";
  }
}
function getNotifTitle(type: NotifType) {
  switch (type) {
    case "missed_medicine":
      return "Missed Medicine";
    case "missed_checkin":
      return "Missed Wellbeing Check-in";
    case "no_app_activity":
      return "No ElderCare App Activity";
    case "sos":
      return "Emergency SOS";
    case "sos_sent":
      return "SOS Sent";
    case "sos_acknowledged":
      return "SOS Acknowledged";
    case "sos_resolved":
      return "SOS Resolved";
    case "sos_escalation":
      return "SOS Escalation";
    case "appointment_reminder":
      return "Appointment Reminder";
    case "missed_appointment":
      return "Missed Appointment";
    case "caregiver_alert":
    case "caregiver_booking":
      return "Caregiver Update";
    case "video_consult":
      return "Video Consult Reminder";
    case "transport_alert":
      return "Transport Update";
    case "health_risk_high":
      return "High Health-Risk Screening";
    case "companion_emergency":
      return "Companion Safety Warning";
    case "push_test":
      return "Push Test";
    case "reminder":
      return "Medication Reminder";
    case "call":
      return "Call Alert";
    default:
      return "Notification";
  }
}
function MetaBadges({
  type,
  metadata,
}: {
  type: NotifType;
  metadata: Record<string, unknown> | null;
}) {
  if (!metadata) return null;
  const badges: {
    label: string;
    value: string;
  }[] = [];
  if (type === "missed_medicine" || type === "reminder") {
    if (metadata.medicine_name)
      badges.push({ label: "Medicine", value: String(metadata.medicine_name) });
    if (metadata.scheduled_time) {
      try {
        const t = new Date(`1970-01-01T${metadata.scheduled_time}`).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        badges.push({ label: "Scheduled", value: t });
      } catch {
        void 0;
      }
    }
    if (metadata.date) badges.push({ label: "Date", value: String(metadata.date) });
    if (metadata.status) badges.push({ label: "Status", value: String(metadata.status) });
  }
  if (type === "missed_checkin") {
    if (metadata.check_date)
      badges.push({ label: "Check-in date", value: String(metadata.check_date) });
    if (metadata.severity) badges.push({ label: "Priority", value: String(metadata.severity) });
  }
  if (type === "no_app_activity") {
    if (metadata.last_app_activity_at) {
      try {
        const d = new Date(String(metadata.last_app_activity_at));
        badges.push({
          label: "Last app activity",
          value: d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
        });
      } catch {
        void 0;
      }
    }
    if (metadata.severity) badges.push({ label: "Priority", value: String(metadata.severity) });
  }
  if (type === "appointment_reminder" || type === "missed_appointment") {
    if (metadata.appointment_title)
      badges.push({ label: "Appointment", value: String(metadata.appointment_title) });
    if (metadata.scheduled_at) {
      try {
        const d = new Date(String(metadata.scheduled_at));
        badges.push({
          label: "Date",
          value: d.toLocaleDateString([], { month: "short", day: "numeric" }),
        });
        badges.push({
          label: "Time",
          value: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
      } catch {
        void 0;
      }
    }
    if (metadata.status) badges.push({ label: "Status", value: String(metadata.status) });
  }
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {badges.map((b) => (
        <span
          key={b.label}
          className="rounded-full border border-[#dfe8e5] bg-[#f6f9f8] px-2.5 py-1 text-[11px] font-semibold text-[#5f777b]"
        >
          <span className="text-[#87999c]">{b.label}: </span>
          {b.value}
        </span>
      ))}
    </div>
  );
}
function getEffectiveTabKey(type: string): string {
  if (["sos", "sos_sent", "sos_acknowledged", "sos_resolved", "sos_escalation"].includes(type))
    return "sos";
  if (["appointment_reminder", "missed_appointment"].includes(type)) return "appointment_reminder";
  if (["caregiver_alert", "caregiver_booking"].includes(type)) return "caregiver_alert";
  return type;
}
function NotificationsPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const recipientId = user?.id;
  const {
    data: notifications = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["notifications", recipientId],
    enabled: !!recipientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parent_notifications")
        .select("*")
        .eq("parent_id", recipientId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });
  useEffect(() => {
    if (!recipientId) return;
    const channel = supabase
      .channel(`notifications-page-${recipientId}-${Math.random().toString(36).substr(2, 9)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parent_notifications",
          filter: `parent_id=eq.${recipientId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications", recipientId] });
          qc.invalidateQueries({ queryKey: ["notifUnread", recipientId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [recipientId, qc]);
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("parent_notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("parent_id", recipientId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", recipientId] });
      qc.invalidateQueries({ queryKey: ["notifUnread", recipientId] });
    },
  });
  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("parent_notifications")
        .update({ is_read: true })
        .eq("parent_id", recipientId!)
        .is("deleted_at", null)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All notifications marked as read.");
      qc.invalidateQueries({ queryKey: ["notifications", recipientId] });
      qc.invalidateQueries({ queryKey: ["notifUnread", recipientId] });
    },
    onError: () => toast.error("Failed to mark notifications as read."),
  });
  const clearRead = useMutation({
    mutationFn: async () => {
      const deletedAt = new Date().toISOString();
      const { error } = await supabase
        .from("parent_notifications")
        .update({ deleted_at: deletedAt, is_read: true })
        .eq("parent_id", recipientId!)
        .eq("is_read", true)
        .is("deleted_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Read notifications cleared.");
      qc.invalidateQueries({ queryKey: ["notifications", recipientId] });
      qc.invalidateQueries({ queryKey: ["notifUnread", recipientId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to clear notifications.");
    },
  });
  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      const deletedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("parent_notifications")
        .update({ deleted_at: deletedAt, is_read: true })
        .eq("id", id)
        .eq("parent_id", recipientId!)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Notification could not be deleted.");
    },
    onSuccess: () => {
      toast.success("Notification deleted.");
      qc.invalidateQueries({ queryKey: ["notifications", recipientId] });
      qc.invalidateQueries({ queryKey: ["notifUnread", recipientId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete notification.");
    },
  });
  const clearAll = useMutation({
    mutationFn: async () => {
      const deletedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("parent_notifications")
        .update({ deleted_at: deletedAt, is_read: true })
        .eq("parent_id", recipientId!)
        .is("deleted_at", null)
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (deletedCount) => {
      toast.success(
        deletedCount === 1 ? "1 notification deleted." : `${deletedCount} notifications deleted.`,
      );
      qc.invalidateQueries({ queryKey: ["notifications", recipientId] });
      qc.invalidateQueries({ queryKey: ["notifUnread", recipientId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to clear notifications.");
    },
  });
  const filtered = notifications.filter((n) => {
    const effectiveType = n.notification_type ?? n.type;
    if (activeTab === "all") return true;
    if (activeTab === "unread") return !n.is_read;
    return getEffectiveTabKey(effectiveType) === activeTab;
  });
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  function handleNotifClick(notif: Notification) {
    const effectiveType = notif.notification_type ?? notif.type;
    if (!notif.is_read) {
      markRead.mutate(notif.id);
    }
    const route = getNotifRoute(effectiveType);
    if (route !== "/notifications") {
      navigate({ to: route });
    }
  }
  return (
    <AppShell>
      <div className="mb-6 overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)]">
        <div className="flex flex-col gap-5 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#e8f3ef] px-3 py-1.5 text-xs font-bold text-[#176f69]">
              <Bell className="size-3.5" />
              Care activity centre
            </div>
            <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#122f35] sm:text-4xl">
              Notifications
            </h1>
            <p className="mt-2 text-sm text-[#667d82] sm:text-base">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                : "All caught up!"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-11 rounded-xl border-[#d7e3df] bg-white px-4 text-[#49666b] hover:bg-[#f3f8f6]" onClick={() => refetch()}>
              <RefreshCw className="size-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 rounded-xl border-[#d7e3df] bg-white px-4 text-[#49666b] hover:bg-[#f3f8f6]"
              onClick={() => markAllRead.mutate()}
              disabled={unreadCount === 0 || markAllRead.isPending}
            >
              <CheckCheck className="size-4 mr-2" />
              Mark all read
            </Button>
            {notifications && notifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-11 rounded-xl border-[#e2c7c3] bg-white px-4 text-[#a44f49] hover:bg-[#fff4f2] hover:text-[#913f3a]"
                onClick={() => {
                  if (
                    confirm(
                      "Are you sure you want to delete ALL notifications? This action cannot be undone.",
                    )
                  ) {
                    clearAll.mutate();
                  }
                }}
                disabled={clearAll.isPending}
              >
                <Trash2 className="size-4 mr-2" />
                Delete All
              </Button>
            )}
          </div>
        </div>
        <div className="grid border-t border-[#e2ece9] bg-[#f7faf9] sm:grid-cols-3">
          <div className="border-b border-[#e2ebe8] px-5 py-4 sm:border-b-0 sm:border-r">
            <p className="text-xs font-bold uppercase tracking-[0.11em] text-[#7b8f93]">Total</p>
            <p className="mt-1 text-xl font-bold text-[#17343a]">{notifications.length}</p>
          </div>
          <div className="border-b border-[#e2ebe8] px-5 py-4 sm:border-b-0 sm:border-r">
            <p className="text-xs font-bold uppercase tracking-[0.11em] text-[#7b8f93]">Unread</p>
            <p className="mt-1 text-xl font-bold text-[#17343a]">{unreadCount}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.11em] text-[#7b8f93]">Status</p>
            <p className="mt-1 text-sm font-semibold text-[#176f69]">{unreadCount === 0 ? "Up to date" : "Review required"}</p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-[#dfe8e5] bg-white p-2 shadow-[0_12px_30px_-28px_rgba(18,49,54,0.35)]">
        {TYPE_TABS.map((tab) => {
          const count =
            tab.key === "all"
              ? notifications.length
              : tab.key === "unread"
                ? unreadCount
                : notifications.filter((n) => {
                  const et = n.notification_type ?? n.type;
                  return getEffectiveTabKey(et) === tab.key;
                }).length;
          if (count === 0 && tab.key !== "all" && tab.key !== "unread") return null;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-all ${activeTab === tab.key
                  ? "bg-[#0d6665] text-white shadow-[0_10px_22px_-14px_rgba(13,102,101,0.8)]"
                  : "text-[#60787c] hover:bg-[#eef5f2] hover:text-[#155f5c]"
                }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`text-xs rounded-full px-1.5 py-0.5 font-mono ${activeTab === tab.key
                      ? "bg-white/15 text-white"
                      : "bg-[#e5ece9] text-[#60787c]"
                    }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-[#e0e9e6] bg-white p-5">
              <div className="flex gap-4">
                <div className="size-11 rounded-xl bg-[#e9efed]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/4 rounded bg-[#e7eeeb]" />
                  <div className="h-3 w-3/4 rounded bg-[#f0f4f3]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <div className="space-y-2">
          {filtered.map((notif) => {
            const effectiveType = notif.notification_type ?? notif.type;
            const destRoute = getNotifRoute(effectiveType);
            const isNavigable = destRoute !== "/notifications";
            return (
              <div
                key={notif.id}
                role="button"
                tabIndex={0}
                onClick={() => handleNotifClick(notif)}
                onKeyDown={(e) => e.key === "Enter" && handleNotifClick(notif)}
                className={`group relative flex cursor-pointer items-start gap-4 rounded-2xl border bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_22px_42px_-34px_rgba(18,49,54,0.38)] active:scale-[0.995] ${notif.is_read
                    ? "border-[#e3ebe8] opacity-75"
                    : "border-[#b9d4cc] shadow-[0_14px_34px_-30px_rgba(13,102,101,0.55)]"
                  }`}
              >
                {!notif.is_read && (
                  <div className="absolute right-4 top-4 size-2.5 rounded-full bg-[#0d7774]" />
                )}

                <div
                  className={`size-11 rounded-xl grid place-items-center shrink-0 ${getNotifColors(effectiveType, notif.is_read)}`}
                >
                  {getNotifIcon(effectiveType)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p
                      className={`text-sm font-semibold ${notif.is_read ? "text-[#72868a]" : "text-[#234349]"}`}
                    >
                      {getNotifTitle(effectiveType)}
                    </p>
                    {!notif.is_read && (
                      <span className="rounded-full bg-[#e3f1ec] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#176f69]">
                        New
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-sm leading-snug ${notif.is_read ? "text-[#788b8f]" : "text-[#50696e]"}`}
                  >
                    {notif.message}
                  </p>

                  <MetaBadges type={effectiveType} metadata={notif.metadata} />

                  <p className="mt-2 text-xs text-[#819397]">
                    {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                    {" · "}
                    {format(new Date(notif.created_at), "MMM d, h:mm a")}
                  </p>
                </div>
                {isNavigable && (
                  <div className="flex items-center gap-2 shrink-0 self-center z-10">
                    <ChevronRight
                      className={`size-4 transition-colors ${notif.is_read
                          ? "text-[#c2cdca]"
                          : "text-[#819397] group-hover:text-[#0d7774]"
                        }`}
                    />
                  </div>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNotification.mutate(notif.id);
                  }}
                  disabled={deleteNotification.isPending}
                  className="z-10 shrink-0 self-center rounded-xl p-2 text-[#b9c5c2] opacity-100 transition-colors hover:bg-[#fff1ef] hover:text-[#9b4843] sm:opacity-0 sm:group-hover:opacity-100"
                  title="Delete notification"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
function EmptyState({ tab }: { tab: TabKey }) {
  const messages: Record<
    TabKey,
    {
      title: string;
      sub: string;
    }
  > = {
    all: {
      title: "No notifications yet",
      sub: "You'll see notifications for medications, appointments, and emergencies here.",
    },
    unread: { title: "You're all caught up!", sub: "No unread notifications at the moment." },
    missed_medicine: {
      title: "No missed medications",
      sub: "Great job keeping up with the medication schedule!",
    },
    missed_checkin: {
      title: "No missed wellbeing check-ins",
      sub: "Daily wellbeing updates will appear here when one is missed.",
    },
    no_app_activity: {
      title: "No app-activity alerts",
      sub: "An alert appears only when the ElderCare Connect app has not been used for more than 24 hours.",
    },
    sos: { title: "No emergency alerts", sub: "No SOS alerts have been received." },
    appointment_reminder: {
      title: "No appointment reminders",
      sub: "Upcoming appointments within 24 hours will appear here.",
    },
    caregiver_alert: {
      title: "No caregiver updates",
      sub: "Caregiver booking and assignment updates will appear here.",
    },
    health_risk_high: {
      title: "No high-risk alerts",
      sub: "High or urgent health-risk screening results will appear here.",
    },
    companion_emergency: {
      title: "No Companion safety alerts",
      sub: "Private generic safety warnings will appear here when enabled.",
    },
    video_consult: {
      title: "No video consult reminders",
      sub: "Upcoming telehealth video consultations will appear here.",
    },
    transport_alert: {
      title: "No transport updates",
      sub: "Transport requests and status changes will appear here.",
    },
    reminder: { title: "No reminders", sub: "Reminders sent by family members will appear here." },
  };
  const { title, sub } = messages[tab] ?? messages["all"];
  return (
    <div className="rounded-[1.75rem] border border-[#dce8e4] bg-white px-6 py-16 text-center shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
      <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-[#e8f2ef]">
        <BellOff className="size-7 text-[#176f69]" />
      </div>
      <h3 className="mb-2 text-xl font-bold tracking-[-0.025em] text-[#1c3b41]">{title}</h3>
      <p className="mx-auto max-w-sm text-sm leading-6 text-[#71868a]">{sub}</p>
    </div>
  );
}