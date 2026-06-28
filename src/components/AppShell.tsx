import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, ChevronDown, Bell, Menu, X, Siren } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useActiveParent, useCurrentUser } from "@/hooks/useProfile";
import { useRealtimeSosAlerts } from "@/hooks/useRealtimeSosAlerts";
import { useNotificationEngine } from "@/hooks/useNotificationEngine";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState, useRef } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/medicines", label: "Medicines", icon: "💊" },
  { to: "/wellbeing", label: "Wellbeing", icon: "🌤️" },
  { to: "/vitals", label: "Vitals", icon: "❤️" },
  { to: "/appointments", label: "Appointments", icon: "📅" },
  { to: "/caregivers", label: "Caregivers", icon: "👨‍⚕️" },
  { to: "/transport", label: "Transport", icon: "🚗" },
  { to: "/video", label: "Video Consult", icon: "📹" },
  { to: "/records", label: "Health Records", icon: "📋" },
  { to: "/family", label: "Family", icon: "👨‍👩‍👧‍👦" },
  { to: "/emergency-contacts", label: "Emergency Contacts", icon: "📞" },
  { to: "/notifications", label: "Notifications", icon: "🔔" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
] as const;

const aiItems = [
  { to: "/health-risk", label: "AI Risk Check", icon: "🤖" },
  { to: "/companion", label: "AI Companion", icon: "💬" },
] as const;

// ── Shared nav link component ──────────────────────────────────────────────
function NavLink({
  to,
  label,
  icon,
  active,
  onClick,
}: {
  to: string;
  label: string;
  icon: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      preload="intent"
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
        active ? "bg-primary/5 text-primary font-medium" : "text-muted-foreground hover:bg-black/5"
      }`}
    >
      <span className="text-base leading-none shrink-0" aria-hidden="true">{icon}</span>
      {label}
    </Link>
  );
}


export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, activeParent, activeParentId, isChildView, linkedParents, setSelectedParentId } = useActiveParent();
  const { data: user } = useCurrentUser();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // Global realtime SOS listener for caregivers across all linked parents
  const caregiverParentIds =
    profile?.role === "child" ? linkedParents.map((p) => p.id) : [];
  useRealtimeSosAlerts(caregiverParentIds);

  // Global notification engine — auto-generates missed medicine + appointment reminder notifications
  useNotificationEngine({
    parentId: activeParentId ?? null,
    userId: user?.id ?? null,
    isChildView,
  });

  // ── Load Elder Settings globally ────────────────────────────
  const { data: globalElderSettings } = useQuery({
    queryKey: ["global_elder_settings", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("elder_settings")
        .select("*")
        .eq("parent_id", activeParentId!)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, any> | null;
    },
  });

  useEffect(() => {
    if (globalElderSettings) {
      document.documentElement.classList.toggle("large-text", !!globalElderSettings.large_text);
      document.documentElement.classList.toggle("high-contrast", !!globalElderSettings.high_contrast);
      document.documentElement.lang = globalElderSettings.language || "en";
    } else {
      document.documentElement.classList.remove("large-text", "high-contrast");
      document.documentElement.lang = "en";
    }
    return () => {
      document.documentElement.classList.remove("large-text", "high-contrast");
      document.documentElement.lang = "en";
    };
  }, [globalElderSettings, activeParentId]);

  // ── Local Medicine Reminders Engine ──────────────────────────────
  const { data: globalMeds } = useQuery({
    queryKey: ["global_meds", activeParentId],
    enabled: !!activeParentId && !!globalElderSettings?.med_reminders_enabled && profile?.role === "parent",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("medicines")
        .select("id, name, dosage, schedule_time")
        .eq("parent_id", activeParentId!)
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; dosage: string | null; schedule_time: string | null }>;
    },
  });

  const todayDateStr = new Date().toISOString().split("T")[0];
  const { data: globalTakenMeds } = useQuery({
    queryKey: ["global_taken_meds", activeParentId, todayDateStr],
    enabled: !!activeParentId && !!globalElderSettings?.med_reminders_enabled && profile?.role === "parent",
    queryFn: async () => {
      const { data } = await supabase
        .from("medicine_logs")
        .select("medicine_id")
        .eq("parent_id", activeParentId!)
        .eq("log_date", todayDateStr);
      return new Set((data ?? []).map((l) => l.medicine_id));
    },
    refetchInterval: 15_000,
  });

  const warnedMedsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (globalElderSettings?.med_reminders_enabled && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [globalElderSettings]);

  useEffect(() => {
    if (profile?.role !== "parent" || !activeParentId || !globalElderSettings?.med_reminders_enabled || !globalMeds) return;

    const checkInterval = setInterval(() => {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];

      globalMeds.forEach((med) => {
        if (!med.schedule_time) return;
        if (globalTakenMeds?.has(med.id)) return;

        const [schedHours, schedMins] = med.schedule_time.split(":").map(Number);
        const lead = globalElderSettings.med_reminder_lead_minutes || 0;
        
        const scheduledTime = new Date();
        scheduledTime.setHours(schedHours, schedMins, 0, 0);

        const targetTime = new Date(scheduledTime.getTime() - lead * 60 * 1000);
        const diffMs = now.getTime() - targetTime.getTime();

        const isTimeForReminder = diffMs >= 0 && diffMs < 90_000;
        const trackingKey = `${med.id}_${todayStr}`;

        if (isTimeForReminder && !warnedMedsRef.current.has(trackingKey)) {
          warnedMedsRef.current.add(trackingKey);

          if (globalElderSettings.med_voice_reminders && "speechSynthesis" in window) {
            window.speechSynthesis.cancel();
            let msg = `Reminder: It is time to take your medication: ${med.name}, dosage ${med.dosage || ""}.`;
            let speechLang = "en-US";
            if (globalElderSettings.language === "hi") {
              msg = `ध्यान दें: दवा का समय हो गया है। कृपया ${med.name} लें, खुराक ${med.dosage || ""}.`;
              speechLang = "hi-IN";
            }
            const utterance = new SpeechSynthesisUtterance(msg);
            utterance.lang = speechLang;
            window.speechSynthesis.speak(utterance);
          }

          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`💊 Medicine Reminder`, {
              body: `Time to take ${med.name} (${med.dosage || ""})`,
              tag: `med-${med.id}`,
            });
          }

          const markTakenText = globalElderSettings.language === "hi" ? "दवा ले ली" : "Mark Taken";
          const toastMsg = globalElderSettings.language === "hi"
            ? `अनुस्मारक: ${med.name} (${med.dosage || ""}) लेने का समय`
            : `Time to take ${med.name} (${med.dosage || ""})`;

          toast.warning(toastMsg, {
            duration: 15000,
            action: {
              label: markTakenText,
              onClick: async () => {
                try {
                  const { error } = await supabase.from("medicine_logs").insert({
                    medicine_id: med.id,
                    parent_id: activeParentId,
                    log_date: todayStr,
                  });
                  if (error) throw error;
                  queryClient.invalidateQueries({ queryKey: ["global_taken_meds"] });
                  toast.success(globalElderSettings.language === "hi" ? "सफलतापूर्वक दर्ज किया गया。" : "Marked as taken.");
                } catch (e) {
                  toast.error("Failed to mark taken");
                }
              },
            },
          });
        }
      });
    }, 20_000);

    return () => clearInterval(checkInterval);
  }, [activeParentId, globalElderSettings, globalMeds, globalTakenMeds, profile, queryClient]);

  // ── SOS Escalation Engine ─────────────────────────────────────
  const { data: globalContacts = [] } = useQuery({
    queryKey: ["global_emergency_contacts", profile?.id],
    enabled: profile?.role === "parent",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("emergency_contacts")
        .select("id, name, phone, relationship, priority")
        .eq("parent_id", profile!.id)
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string | null; phone: string | null; relationship: string | null; priority: number }>;
    },
  });

  const { data: parentActiveAlert } = useQuery({
    queryKey: ["parent_active_sos", profile?.id],
    enabled: profile?.role === "parent",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sos_alerts")
        .select("id, created_at, status")
        .eq("parent_id", profile!.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  const dialedContactsRef = useRef<Record<string, Set<number>>>({});
  const [escalationTimeLeft, setEscalationTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (profile?.role !== "parent" || !parentActiveAlert || globalContacts.length === 0) {
      setEscalationTimeLeft(null);
      return;
    }

    const timer = setInterval(() => {
      const alertId = parentActiveAlert.id;
      if (!dialedContactsRef.current[alertId]) {
        dialedContactsRef.current[alertId] = new Set();
      }

      const leadMins = globalElderSettings?.sos_escalation_minutes || 5;
      const escalationSeconds = leadMins * 60;
      
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(parentActiveAlert.created_at).getTime()) / 1000
      );

      const currentIdx = Math.floor(elapsedSeconds / escalationSeconds);
      const nextIdx = currentIdx + 1;

      if (nextIdx < globalContacts.length) {
        const nextThresholdSecs = nextIdx * escalationSeconds;
        const timeLeft = nextThresholdSecs - elapsedSeconds;
        setEscalationTimeLeft(timeLeft);
        
        if (timeLeft === 15) {
          const nextContact = globalContacts[nextIdx];
          toast.info(
            globalElderSettings?.language === "hi"
              ? `आपातकालीन अलर्ट 15 सेकंड में अगले संपर्क ${nextContact.name || ""} को स्थानांतरित किया जाएगा...`
              : `⚠️ Escalating alert to next contact ${nextContact.name || ""} in 15 seconds...`
          );
        }
      } else {
        setEscalationTimeLeft(null);
      }

      if (currentIdx < globalContacts.length && !dialedContactsRef.current[alertId].has(currentIdx)) {
        const contact = globalContacts[currentIdx];
        const shouldDial = currentIdx > 0 || globalElderSettings?.sos_auto_call_primary;

        if (shouldDial && contact.phone) {
          dialedContactsRef.current[alertId].add(currentIdx);

          if ("speechSynthesis" in window) {
            const speakText = currentIdx === 0
              ? `Emergency triggered. Auto dialing primary contact, ${contact.name || "Emergency Contact"}.`
              : `Escalating alert. Dialing next contact, ${contact.name || "Emergency Contact"}.`;
            const utterance = new SpeechSynthesisUtterance(speakText);
            utterance.lang = globalElderSettings?.language === "hi" ? "hi-IN" : "en-US";
            window.speechSynthesis.speak(utterance);
          }

          toast.error(`🚨 Emergency Escalation: Calling ${contact.name} (${contact.phone})`, {
            duration: 10000,
          });

          (async () => {
            try {
              await (supabase.from("parent_notifications") as any).insert({
                parent_id: profile.id,
                sender_id: profile.id,
                type: "sos_escalation",
                notification_type: "sos_escalation",
                message: `🚨 Emergency Escalation: Calling ${contact.name || "contact"} at ${contact.phone} (Priority ${contact.priority}).`,
              });
            } catch (err) {
              console.error("SOS escalation notification insert failed:", err);
            }
          })();

          setTimeout(() => {
            window.location.href = `tel:${contact.phone!.replace(/[^+\d]/g, "")}`;
          }, 1500);
        }
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      setEscalationTimeLeft(null);
    };
  }, [profile, parentActiveAlert, globalContacts, globalElderSettings]);

  const { data: activeSosAlerts = [] } = useQuery({
    queryKey: ["activeSosAlerts", caregiverParentIds],
    enabled: isChildView && caregiverParentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sos_alerts")
        .select("id, parent_id, parent_name, created_at")
        .in("parent_id", caregiverParentIds)
        .in("status", ["active", "acknowledged"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Unread notification count for bell badge
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifUnread", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("parent_notifications")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", user!.id)
        .eq("is_read", false);
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  // Realtime subscription to update unread count live
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notif-bell-${user.id}-${Math.random().toString(36).substr(2, 9)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parent_notifications",
          filter: `parent_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifUnread", user.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  const getParentName = (parentId: string) => {
    return linkedParents.find((p) => p.id === parentId)?.full_name ?? "Parent";
  };

  async function signOut() {
    toast.info("👋 Signing out…");
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success("Signed out successfully");
      navigate({ to: "/auth", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to sign out");
    }
  }

  const initials = (profile?.full_name || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Shared nav content (used in both sidebar and drawer)
  const NavContent = ({ onLinkClick }: { onLinkClick?: () => void }) => (
    <>
      <nav className="space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            active={pathname === item.to}
            onClick={onLinkClick}
          />
        ))}
        <div className="pt-4 mt-4 border-t border-border">
          <p className="px-3 pb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">AI Assist</p>
          {aiItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              preload="intent"
              onClick={onLinkClick}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                pathname === item.to ? "bg-secondary/10 text-secondary font-medium" : "text-muted-foreground hover:bg-black/5"
              }`}
            >
              <span className="text-base leading-none shrink-0" aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
        <div className="pt-4 mt-4 border-t border-border space-y-1">
          <Link
            to="/sos"
            preload="intent"
            onClick={onLinkClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              pathname === "/sos"
                ? "bg-red-100 text-red-700"
                : "text-red-600 hover:bg-red-50"
            }`}
          >
            <span className="text-base leading-none shrink-0" aria-hidden="true">🚨</span>
            SOS Alerts
          </Link>
        </div>
      </nav>
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Critical SOS Alert Bar */}
      {isChildView && activeSosAlerts.length > 0 && (
        <div className="bg-red-600 text-white px-4 py-2.5 text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 select-none z-50 animate-pulse relative shadow-md shrink-0">
          <Siren className="size-4 shrink-0 animate-bounce" />
          <span>
            Emergency Assistance requested by Parent:{" "}
            <strong>
              {activeSosAlerts
                .map((a) => a.parent_name || getParentName(a.parent_id))
                .filter(Boolean)
                .join(", ")}
            </strong>
          </span>
          <Link to="/sos" className="underline hover:text-red-100 ml-1.5 font-bold">
            View Details
          </Link>
        </div>
      )}

      {/* Parent SOS Active Alert Escalation Banner */}
      {!isChildView && parentActiveAlert && (
        <div className="bg-orange-600 text-white px-4 py-2.5 text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 select-none z-50 relative shadow-md shrink-0">
          <Siren className="size-4 shrink-0 animate-pulse" />
          <span>
            🚨 SOS Alert Active
            {escalationTimeLeft !== null && escalationTimeLeft > 0
              ? ` — Next contact escalation in ${Math.floor(escalationTimeLeft / 60)}m ${escalationTimeLeft % 60}s`
              : ""}
          </span>
          <Link to="/sos" className="underline hover:text-orange-100 ml-1.5 font-bold">
            Manage
          </Link>
        </div>
      )}

      {/* ── Desktop Sidebar ──────────────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 border-r border-border bg-white/50 backdrop-blur-xl z-20 hidden md:flex flex-col">
        <div className="px-8 pt-8 pb-4">
          <div className="text-xl font-bold tracking-tight">
            <span className="text-brand">ElderCare</span><span className="text-brand-accent">Connect</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-4">
          <NavContent />
        </div>
        <div className="mt-auto p-4 border-t border-border bg-white/50 backdrop-blur-xl">
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2.5 w-full rounded-lg transition-colors"
          >
            <LogOut className="size-4 shrink-0" /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile Drawer Overlay ────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile Slide-Out Drawer ──────────────────────────────────────── */}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-72 max-w-[85vw] border-r border-border bg-white z-50 md:hidden flex flex-col transition-transform duration-300 ease-out ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Mobile navigation"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="text-lg font-bold tracking-tight">
              <span className="text-brand">ElderCare</span><span className="text-brand-accent">Connect</span>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 rounded-lg text-muted-foreground hover:bg-stone-100 transition-colors"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Profile info in drawer */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Avatar className="size-9 ring-2 ring-white shrink-0">
              <AvatarFallback className="bg-secondary/20 text-secondary font-semibold text-sm">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{profile?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground font-mono uppercase truncate">
                {isChildView ? "Monitoring" : "Parent"}
              </p>
            </div>
          </div>
          {isChildView && linkedParents.length > 0 && (
            <div className="mt-3">
              <Select value={activeParent?.id ?? undefined} onValueChange={(v) => setSelectedParentId(v)}>
                <SelectTrigger className="h-8 rounded-lg border-border bg-stone-50 text-xs font-medium w-full">
                  <SelectValue placeholder="Select parent" />
                </SelectTrigger>
                <SelectContent>
                  {linkedParents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <NavContent onLinkClick={() => setDrawerOpen(false)} />
        </div>

        {/* Sign out */}
        <div className="p-4 border-t border-border">
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2.5 w-full rounded-lg transition-colors"
          >
            <LogOut className="size-4 shrink-0" /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="md:pl-64 flex flex-col flex-1">
        <header className="h-16 sm:h-20 border-b border-border flex items-center gap-3 px-4 sm:px-6 md:px-10 bg-background/70 sticky top-0 backdrop-blur-md z-10">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden p-2 -ml-1 rounded-lg text-muted-foreground hover:bg-stone-100 transition-colors shrink-0"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>

          {/* Avatar + name */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Avatar className="size-9 sm:size-10 ring-2 ring-white shrink-0">
              <AvatarFallback className="bg-secondary/20 text-secondary font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 hidden sm:block">
              <p className="font-display text-base sm:text-lg font-bold leading-none truncate">
                {profile?.full_name || "Welcome"}
              </p>
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                {isChildView
                  ? `Monitoring · ${activeParent?.full_name ?? "No parent linked"}`
                  : "Active now · Home"}
              </span>
            </div>
            {/* Name visible on very small screens */}
            <p className="font-display text-base font-bold leading-none truncate sm:hidden">
              {profile?.full_name?.split(" ")[0] || "Welcome"}
            </p>
          </div>

          {/* Notification Bell */}
          <Link
            to="/notifications"
            preload="intent"
            className="relative p-2 rounded-xl hover:bg-stone-100 transition-colors shrink-0"
            aria-label="Notifications"
          >
            <Bell className="size-5 text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>

          {/* Parent switcher — desktop only to avoid cramping mobile header */}
          {isChildView && linkedParents.length > 0 && (
            <Select value={activeParent?.id ?? undefined} onValueChange={(v) => setSelectedParentId(v)}>
              <SelectTrigger className="hidden sm:flex h-9 rounded-full border-border bg-stone-100 text-sm font-medium gap-2 px-4 w-auto max-w-[160px]">
                <SelectValue placeholder="Select parent" />
                <ChevronDown className="size-3.5 opacity-50" />
              </SelectTrigger>
              <SelectContent>
                {linkedParents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </header>

        <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto w-full animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
