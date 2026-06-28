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
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  ssr: false,
  component: NotificationsPage,
});

type NotifType =
  | "missed_medicine"
  | "sos"
  | "sos_sent"
  | "sos_resolved"
  | "sos_escalation"
  | "appointment_reminder"
  | "missed_appointment"
  | "caregiver_alert"
  | "video_consult"
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
}

const TYPE_TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "missed_medicine", label: "Medication" },
  { key: "sos", label: "Emergency" },
  { key: "appointment_reminder", label: "Appointments" },
  { key: "caregiver_alert", label: "Caregiver" },
  { key: "video_consult", label: "Video Consult" },
  { key: "reminder", label: "Reminders" },
] as const;

type TabKey = (typeof TYPE_TABS)[number]["key"];

/** Map each notification type to the route it should deep-link to */
function getNotifRoute(type: NotifType): string {
  switch (type) {
    case "missed_medicine":
    case "reminder":
      return "/medicines";
    case "sos":
    case "sos_sent":
    case "sos_resolved":
    case "sos_escalation":
      return "/sos";
    case "appointment_reminder":
    case "missed_appointment":
      return "/appointments";
    case "caregiver_alert":
      return "/caregivers";
    case "video_consult":
      return "/video";
    default:
      return "/notifications";
  }
}

function getNotifIcon(type: NotifType) {
  switch (type) {
    case "missed_medicine":
      return <Pill className="size-5" />;
    case "sos":
      return <Siren className="size-5" />;
    case "sos_sent":
      return <SendHorizonal className="size-5" />;
    case "sos_resolved":
      return <ShieldCheck className="size-5" />;
    case "sos_escalation":
      return <Siren className="size-5" />;
    case "appointment_reminder":
      return <CalendarDays className="size-5" />;
    case "missed_appointment":
      return <CalendarX className="size-5" />;
    case "caregiver_alert":
      return <UserCheck className="size-5" />;
    case "video_consult":
      return <Video className="size-5" />;
    case "reminder":
      return <Bell className="size-5" />;
    case "call":
      return <Phone className="size-5" />;
    default:
      return <MessageCircle className="size-5" />;
  }
}

function getNotifColors(type: NotifType, isRead: boolean) {
  if (isRead) return "bg-stone-100 text-stone-400";
  switch (type) {
    case "missed_medicine":
      return "bg-amber-100 text-amber-600";
    case "sos":
    case "sos_escalation":
      return "bg-red-100 text-red-600";
    case "sos_sent":
      return "bg-orange-100 text-orange-600";
    case "sos_resolved":
      return "bg-emerald-100 text-emerald-600";
    case "appointment_reminder":
      return "bg-blue-100 text-blue-600";
    case "missed_appointment":
      return "bg-rose-100 text-rose-600";
    case "caregiver_alert":
      return "bg-teal-100 text-teal-600";
    case "video_consult":
      return "bg-indigo-100 text-indigo-600";
    case "reminder":
      return "bg-purple-100 text-purple-600";
    case "call":
      return "bg-cyan-100 text-cyan-600";
    default:
      return "bg-primary/10 text-primary";
  }
}

function getNotifTitle(type: NotifType) {
  switch (type) {
    case "missed_medicine":
      return "Missed Medicine";
    case "sos":
      return "Emergency SOS";
    case "sos_sent":
      return "SOS Sent";
    case "sos_resolved":
      return "SOS Resolved";
    case "sos_escalation":
      return "SOS Escalation";
    case "appointment_reminder":
      return "Appointment Reminder";
    case "missed_appointment":
      return "Missed Appointment";
    case "caregiver_alert":
      return "Caregiver Alert";
    case "video_consult":
      return "Video Consult Reminder";
    case "reminder":
      return "Medication Reminder";
    case "call":
      return "Call Alert";
    default:
      return "Notification";
  }
}

/** Render structured metadata badge below the message */
function MetaBadges({ type, metadata }: { type: NotifType; metadata: Record<string, unknown> | null }) {
  if (!metadata) return null;

  const badges: { label: string; value: string }[] = [];

  if (type === "missed_medicine" || type === "reminder") {
    if (metadata.medicine_name) badges.push({ label: "Medicine", value: String(metadata.medicine_name) });
    if (metadata.scheduled_time) {
      try {
        const t = new Date(`1970-01-01T${metadata.scheduled_time}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        badges.push({ label: "Scheduled", value: t });
      } catch { /* ignore */ }
    }
    if (metadata.date) badges.push({ label: "Date", value: String(metadata.date) });
    if (metadata.status) badges.push({ label: "Status", value: String(metadata.status) });
  }

  if (type === "appointment_reminder" || type === "missed_appointment") {
    if (metadata.appointment_title) badges.push({ label: "Appointment", value: String(metadata.appointment_title) });
    if (metadata.scheduled_at) {
      try {
        const d = new Date(String(metadata.scheduled_at));
        badges.push({ label: "Date", value: d.toLocaleDateString([], { month: "short", day: "numeric" }) });
        badges.push({ label: "Time", value: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
      } catch { /* ignore */ }
    }
    if (metadata.status) badges.push({ label: "Status", value: String(metadata.status) });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {badges.map((b) => (
        <span
          key={b.label}
          className="text-[11px] font-medium bg-stone-100 text-stone-600 rounded-full px-2 py-0.5 border border-stone-200"
        >
          <span className="text-stone-400">{b.label}: </span>
          {b.value}
        </span>
      ))}
    </div>
  );
}

/** Returns the tab key that a notification's type maps to for filtering */
function getEffectiveTabKey(type: string): string {
  if (["sos", "sos_sent", "sos_resolved", "sos_escalation"].includes(type)) return "sos";
  if (["appointment_reminder", "missed_appointment"].includes(type)) return "appointment_reminder";
  return type;
}

function NotificationsPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // The recipient is always the current user (parent_id = current user's id)
  const recipientId = user?.id;

  // ── Fetch notifications ─────────────────────────────────────────────────────
  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ["notifications", recipientId],
    enabled: !!recipientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parent_notifications")
        .select("*")
        .eq("parent_id", recipientId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  // ── Real-time subscription ──────────────────────────────────────────────────
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
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [recipientId, qc]);

  // ── Mark single as read ────────────────────────────────────────────────────
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

  // ── Mark all as read ───────────────────────────────────────────────────────
  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("parent_notifications")
        .update({ is_read: true })
        .eq("parent_id", recipientId!)
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

  // ── Clear read notifications ───────────────────────────────────────────────
  const clearRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("parent_notifications")
        .delete()
        .eq("parent_id", recipientId!)
        .eq("is_read", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Read notifications cleared.");
      qc.invalidateQueries({ queryKey: ["notifications", recipientId] });
    },
    onError: () => toast.error("Failed to clear notifications."),
  });

  // ── Filter by tab ──────────────────────────────────────────────────────────
  const filtered = notifications.filter((n) => {
    const effectiveType = n.notification_type ?? n.type;
    if (activeTab === "all") return true;
    if (activeTab === "unread") return !n.is_read;
    return getEffectiveTabKey(effectiveType) === activeTab;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Handle card click: mark read + navigate ──────────────────────────────
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
      {/* Header */}
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold italic flex items-center gap-3">
            <Bell className="size-9 text-primary" />
            Notifications
          </h1>
          <p className="text-muted-foreground mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
              : "All caught up!"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => refetch()}
          >
            <RefreshCw className="size-4 mr-2" />
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="size-4 mr-2" />
              Mark all read
            </Button>
          )}
          {notifications.some((n) => n.is_read) && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => {
                if (confirm("Clear all read notifications?")) clearRead.mutate();
              }}
              disabled={clearRead.isPending}
            >
              <Trash2 className="size-4 mr-2" />
              Clear read
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
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
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground shadow"
                  : "bg-stone-100 text-muted-foreground hover:bg-stone-200"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`text-xs rounded-full px-1.5 py-0.5 font-mono ${
                    activeTab === tab.key
                      ? "bg-white/20 text-white"
                      : "bg-stone-200 text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Notification List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse">
              <div className="flex gap-4">
                <div className="size-11 rounded-xl bg-stone-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-stone-100 rounded w-1/4" />
                  <div className="h-3 bg-stone-100 rounded w-3/4" />
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
                className={`group relative bg-card border rounded-2xl p-5 flex items-start gap-4 transition-all cursor-pointer hover:shadow-md active:scale-[0.99] ${
                  notif.is_read
                    ? "border-border opacity-70"
                    : "border-primary/20 shadow-sm ring-1 ring-primary/5"
                }`}
              >
                {/* Unread dot */}
                {!notif.is_read && (
                  <div className="absolute top-4 right-4 size-2.5 rounded-full bg-primary animate-pulse" />
                )}

                {/* Icon */}
                <div
                  className={`size-11 rounded-xl grid place-items-center shrink-0 ${getNotifColors(
                    effectiveType,
                    notif.is_read
                  )}`}
                >
                  {getNotifIcon(effectiveType)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`text-sm font-semibold ${notif.is_read ? "text-muted-foreground" : "text-foreground"}`}>
                      {getNotifTitle(effectiveType)}
                    </p>
                    {!notif.is_read && (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 uppercase tracking-wide">
                        New
                      </span>
                    )}
                  </div>
                  <p className={`text-sm leading-snug ${notif.is_read ? "text-muted-foreground" : "text-foreground/80"}`}>
                    {notif.message}
                  </p>

                  {/* Structured metadata badges */}
                  <MetaBadges type={effectiveType} metadata={notif.metadata} />

                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                    {" · "}
                    {format(new Date(notif.created_at), "MMM d, h:mm a")}
                  </p>
                </div>

                {/* Navigate arrow */}
                {isNavigable && (
                  <ChevronRight
                    className={`size-4 shrink-0 self-center transition-colors ${
                      notif.is_read ? "text-stone-300" : "text-muted-foreground group-hover:text-primary"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const messages: Record<TabKey, { title: string; sub: string }> = {
    all: { title: "No notifications yet", sub: "You'll see notifications for medications, appointments, and emergencies here." },
    unread: { title: "You're all caught up!", sub: "No unread notifications at the moment." },
    missed_medicine: { title: "No missed medications", sub: "Great job keeping up with the medication schedule!" },
    sos: { title: "No emergency alerts", sub: "No SOS alerts have been received." },
    appointment_reminder: { title: "No appointment reminders", sub: "Upcoming appointments within 24 hours will appear here." },
    caregiver_alert: { title: "No caregiver alerts", sub: "Upcoming caregiver booking reminders will appear here." },
    video_consult: { title: "No video consult reminders", sub: "Upcoming telehealth video consultations will appear here." },
    reminder: { title: "No reminders", sub: "Reminders sent by family members will appear here." },
  };

  const { title, sub } = messages[tab] ?? messages["all"];

  return (
    <div className="bg-card border border-border rounded-3xl p-16 text-center">
      <div className="size-16 rounded-2xl bg-stone-100 mx-auto grid place-items-center mb-5">
        <BellOff className="size-7 text-muted-foreground" />
      </div>
      <h3 className="font-display text-xl font-bold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto">{sub}</p>
    </div>
  );
}
