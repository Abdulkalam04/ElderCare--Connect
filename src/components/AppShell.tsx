import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LogOut,
  Bell,
  Menu,
  X,
  Siren,
  AlarmClock,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  Pill,
  Smile,
  HeartPulse,
  CalendarDays,
  Stethoscope,
  Car,
  Video,
  FileHeart,
  Users,
  Phone,
  Settings,
  BrainCircuit,
  HeartHandshake,
  ShieldAlert,
  MapPin,
  Search,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useActiveParent, useCurrentUser } from "@/hooks/useProfile";
import { useRealtimeSosAlerts } from "@/hooks/useRealtimeSosAlerts";
import { useNotificationEngine } from "@/hooks/useNotificationEngine";
import { useAppActivityHeartbeat } from "@/hooks/useAppActivityHeartbeat";
import { useSosLiveLocation } from "@/hooks/useSosLiveLocation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditableAvatar } from "@/components/EditableAvatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
};
type AppointmentAlarmRow = {
  id: string;
  title: string;
  doctor_name: string;
  specialty: string | null;
  location: string | null;
  appointment_date: string;
  appointment_time: string | null;
  scheduled_at: string;
  notes: string | null;
  reminder_enabled: boolean;
  status: string;
};
const navItems: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="size-4" strokeWidth={1.75} />,
  },
  { to: "/medicines", label: "Medicines", icon: <Pill className="size-4" strokeWidth={1.75} /> },
  { to: "/wellbeing", label: "Wellbeing", icon: <Smile className="size-4" strokeWidth={1.75} /> },
  { to: "/vitals", label: "Vitals", icon: <HeartPulse className="size-4" strokeWidth={1.75} /> },
  {
    to: "/appointments",
    label: "Appointments",
    icon: <CalendarDays className="size-4" strokeWidth={1.75} />,
  },
  {
    to: "/caregivers",
    label: "Caregivers",
    icon: <Stethoscope className="size-4" strokeWidth={1.75} />,
  },
  { to: "/transport", label: "Transport", icon: <Car className="size-4" strokeWidth={1.75} /> },
  { to: "/video", label: "Video Consult", icon: <Video className="size-4" strokeWidth={1.75} /> },
  {
    to: "/records",
    label: "Health Records",
    icon: <FileHeart className="size-4" strokeWidth={1.75} />,
  },
  { to: "/family", label: "Family", icon: <Users className="size-4" strokeWidth={1.75} /> },
  {
    to: "/emergency-contacts",
    label: "Emergency Contacts",
    icon: <Phone className="size-4" strokeWidth={1.75} />,
  },
  {
    to: "/notifications",
    label: "Notifications",
    icon: <Bell className="size-4" strokeWidth={1.75} />,
  },
  { to: "/settings", label: "Settings", icon: <Settings className="size-4" strokeWidth={1.75} /> },
];
const aiItems: NavItem[] = [
  {
    to: "/emergency-detection",
    label: "AI Emergency Detection",
    icon: <ShieldAlert className="size-4" strokeWidth={1.75} />,
  },
  {
    to: "/health-risk",
    label: "AI Risk Check",
    icon: <BrainCircuit className="size-4" strokeWidth={1.75} />,
  },
  {
    to: "/companion",
    label: "AI Companion",
    icon: <HeartHandshake className="size-4" strokeWidth={1.75} />,
  },
];
function NavLink({
  to,
  label,
  icon,
  active,
  onClick,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      preload="intent"
      onClick={onClick}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${active
          ? "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
          : "text-emerald-50/[0.72] hover:bg-white/[0.075] hover:text-white"
        }`}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg transition-all duration-200 ${active
            ? "bg-[#9ed6c7] text-[#073f49] shadow-sm"
            : "bg-white/[0.055] text-emerald-100/[0.8] group-hover:bg-white/10 group-hover:text-white"
          }`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="relative z-10 truncate">{label}</span>
    </Link>
  );
}
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, activeParent, activeParentId, isChildView, linkedParents, setSelectedParentId } =
    useActiveParent();
  const { data: user } = useCurrentUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useAppActivityHeartbeat({ userId: user?.id, role: profile?.role });
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);
  const caregiverParentIds = profile?.role === "child" ? linkedParents.map((p) => p.id) : [];
  useRealtimeSosAlerts(caregiverParentIds);
  useNotificationEngine({
    parentId: activeParentId ?? null,
    userId: user?.id ?? null,
    isChildView,
  });
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
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!activeParentId) return;
    const settingsChannel = supabase
      .channel(`global-elder-settings-${activeParentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "elder_settings",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["global_elder_settings", activeParentId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["elder_settings", activeParentId],
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(settingsChannel);
    };
  }, [activeParentId, queryClient]);
  useEffect(() => {
    if (globalElderSettings) {
      document.documentElement.classList.toggle("large-text", !!globalElderSettings.large_text);
      document.documentElement.classList.toggle(
        "high-contrast",
        !!globalElderSettings.high_contrast,
      );
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
  const todayDateStr = format(new Date(), "yyyy-MM-dd");
  const { data: globalMeds } = useQuery({
    queryKey: ["global_meds", activeParentId],
    enabled:
      !!activeParentId &&
      profile?.role === "parent" &&
      globalElderSettings?.med_reminders_enabled !== false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicines")
        .select("id, name, dosage, period, schedule_time, notes")
        .eq("parent_id", activeParentId!)
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        dosage: string | null;
        period: string | null;
        schedule_time: string | null;
        notes: string | null;
      }>;
    },
  });
  const { data: globalTakenMeds, refetch: refetchTaken } = useQuery({
    queryKey: ["global_taken_meds", activeParentId, todayDateStr],
    enabled:
      !!activeParentId &&
      profile?.role === "parent" &&
      globalElderSettings?.med_reminders_enabled !== false,
    queryFn: async () => {
      const { data } = await supabase
        .from("medicine_logs")
        .select("medicine_id")
        .eq("parent_id", activeParentId!)
        .eq("log_date", todayDateStr);
      return new Set((data ?? []).map((l) => l.medicine_id));
    },
    refetchInterval: 15000,
  });
  const [alarmMed, setAlarmMed] = useState<any | null>(null);
  const firedAlarms = useRef<Set<string>>(new Set());
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmStorageKey = activeParentId
    ? `eldercare:medicine-snoozes:${activeParentId}:${todayDateStr}`
    : null;
  type SnoozedMedicine = {
    until: number;
    alarmKey: string;
  };
  const readSnoozedMeds = useCallback((): Record<string, SnoozedMedicine> => {
    if (!alarmStorageKey || typeof window === "undefined") return {};
    try {
      const stored = window.localStorage.getItem(alarmStorageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }, [alarmStorageKey]);
  const writeSnoozedMeds = useCallback(
    (snoozes: Record<string, SnoozedMedicine>) => {
      if (!alarmStorageKey || typeof window === "undefined") return;
      if (Object.keys(snoozes).length === 0) {
        window.localStorage.removeItem(alarmStorageKey);
      } else {
        window.localStorage.setItem(alarmStorageKey, JSON.stringify(snoozes));
      }
    },
    [alarmStorageKey],
  );
  const globalMarkTaken = useMutation({
    mutationFn: async (medId: string) => {
      const { error } = await supabase.from("medicine_logs").insert({
        medicine_id: medId,
        parent_id: activeParentId!,
        log_date: todayDateStr,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Medicine marked as taken!");
      queryClient.invalidateQueries({ queryKey: ["global_taken_meds"] });
      queryClient.invalidateQueries({ queryKey: ["medLogs"] });
      refetchTaken();
    },
    onError: () => toast.error("Failed to mark taken"),
  });
  function playAlarmBeep() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const beep = (startTime: number, freq: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.6, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
        osc.start(startTime);
        osc.stop(startTime + dur);
      };
      const now = ctx.currentTime;
      beep(now, 880, 0.18);
      beep(now + 0.22, 880, 0.18);
      beep(now + 0.44, 1100, 0.28);
    } catch {
      void 0;
    }
  }
  function speakMedicineReminder(medicine: { name: string; dosage?: string | null }) {
    if (
      globalElderSettings?.med_voice_reminders !== true ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }
    window.speechSynthesis.cancel();
    const message =
      globalElderSettings?.language === "hi"
        ? `${medicine.name}${medicine.dosage ? ` ${medicine.dosage}` : ""} लेने का समय हो गया है।`
        : `It is time to take ${medicine.name}${medicine.dosage ? `, ${medicine.dosage}` : ""}.`;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = globalElderSettings?.language === "hi" ? "hi-IN" : "en-US";
    window.speechSynthesis.speak(utterance);
  }
  const checkAlarms = useCallback(() => {
    if (
      profile?.role !== "parent" ||
      globalElderSettings?.med_reminders_enabled === false ||
      !globalMeds ||
      !globalTakenMeds
    )
      return;
    const now = new Date();
    const nowMs = now.getTime();
    const hhmm = format(now, "HH:mm");
    const snoozes = readSnoozedMeds();
    for (const med of globalMeds) {
      const snooze = snoozes[med.id];
      if (!snooze || nowMs < snooze.until) continue;
      delete snoozes[med.id];
      writeSnoozedMeds(snoozes);
      if (globalTakenMeds.has(med.id)) continue;
      const snoozeAlarmKey = `${snooze.alarmKey}__snoozed__${snooze.until}`;
      if (firedAlarms.current.has(snoozeAlarmKey)) continue;
      firedAlarms.current.add(snoozeAlarmKey);
      setAlarmMed(med);
      playAlarmBeep();
      speakMedicineReminder(med);
      return;
    }
    for (const med of globalMeds) {
      if (!med.schedule_time || globalTakenMeds.has(med.id)) continue;
      const medHHMM = med.schedule_time.slice(0, 5);
      if (medHHMM !== hhmm) continue;
      const alarmKey = `${med.id}__${todayDateStr}__${hhmm}`;
      if (firedAlarms.current.has(alarmKey)) continue;
      const snooze = snoozes[med.id];
      if (snooze && nowMs < snooze.until) continue;
      firedAlarms.current.add(alarmKey);
      setAlarmMed(med);
      playAlarmBeep();
      speakMedicineReminder(med);
      return;
    }
  }, [
    globalMeds,
    globalTakenMeds,
    globalElderSettings?.med_reminders_enabled,
    globalElderSettings?.med_voice_reminders,
    globalElderSettings?.language,
    profile?.role,
    readSnoozedMeds,
    todayDateStr,
    writeSnoozedMeds,
  ]);
  useEffect(() => {
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    checkAlarms();
    alarmIntervalRef.current = setInterval(checkAlarms, 30000);
    return () => {
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    };
  }, [checkAlarms]);
  useEffect(() => {
    if (globalElderSettings?.med_reminders_enabled !== false) return;
    setAlarmMed(null);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [globalElderSettings?.med_reminders_enabled]);
  function handleAlarmSnooze() {
    if (!alarmMed) return;
    const snoozeUntil = new Date(Date.now() + 5 * 60 * 1000);
    const snoozes = readSnoozedMeds();
    snoozes[alarmMed.id] = {
      until: snoozeUntil.getTime(),
      alarmKey: `${alarmMed.id}__${todayDateStr}__${alarmMed.schedule_time?.slice(0, 5) ?? "manual"}`,
    };
    writeSnoozedMeds(snoozes);
    toast.info(
      `Snoozed — ${alarmMed.name} alarm will ring again at ${format(snoozeUntil, "HH:mm")}.`,
    );
    setAlarmMed(null);
  }
  function handleAlarmTaken() {
    if (!alarmMed) return;
    const snoozes = readSnoozedMeds();
    if (snoozes[alarmMed.id]) {
      delete snoozes[alarmMed.id];
      writeSnoozedMeds(snoozes);
    }
    globalMarkTaken.mutate(alarmMed.id);
    setAlarmMed(null);
  }
  const { data: globalAppointments = [] } = useQuery({
    queryKey: ["global_appointment_alarms", activeParentId],
    enabled:
      !!activeParentId &&
      profile?.role === "parent" &&
      globalElderSettings?.appointment_reminders_enabled !== false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, title, doctor_name, specialty, location, appointment_date, appointment_time, scheduled_at, notes, reminder_enabled, status",
        )
        .eq("parent_id", activeParentId!)
        .eq("reminder_enabled", true)
        .in("status", ["pending", "confirmed", "scheduled"]);
      if (error) throw error;
      return (data ?? []) as AppointmentAlarmRow[];
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const [alarmAppointment, setAlarmAppointment] = useState<AppointmentAlarmRow | null>(null);
  const appointmentAlarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  type AppointmentAlarmState = {
    scheduledAt: string;
    lastRungAt?: number;
    snoozedUntil?: number;
    dismissedAt?: number;
  };
  const appointmentAlarmStorageKey = activeParentId
    ? `eldercare:appointment-alarm-state:${activeParentId}`
    : null;
  const readAppointmentAlarmState = useCallback((): Record<string, AppointmentAlarmState> => {
    if (!appointmentAlarmStorageKey || typeof window === "undefined") return {};
    try {
      const stored = window.localStorage.getItem(appointmentAlarmStorageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }, [appointmentAlarmStorageKey]);
  const writeAppointmentAlarmState = useCallback(
    (state: Record<string, AppointmentAlarmState>) => {
      if (!appointmentAlarmStorageKey || typeof window === "undefined") return;
      if (Object.keys(state).length === 0) {
        window.localStorage.removeItem(appointmentAlarmStorageKey);
      } else {
        window.localStorage.setItem(appointmentAlarmStorageKey, JSON.stringify(state));
      }
    },
    [appointmentAlarmStorageKey],
  );
  const publishAppointmentNotification = useCallback(
    async (appointment: AppointmentAlarmRow, alarmKey: string) => {
      if (!activeParentId || !user?.id) return;
      try {
        const { data: existing } = await (supabase.from("parent_notifications") as any)
          .select("id, metadata")
          .eq("parent_id", activeParentId)
          .eq("notification_type", "appointment_reminder")
          .limit(200);
        const alreadyCreated = (existing ?? []).some(
          (notification: { metadata?: Record<string, unknown> | null }) =>
            notification.metadata?.appointment_alarm_key === alarmKey,
        );
        if (!alreadyCreated) {
          const scheduledDate = new Date(appointment.scheduled_at);
          const timeLabel = format(scheduledDate, "hh:mm a");
          const dateLabel = format(scheduledDate, "MMM d, yyyy");
          await (supabase.from("parent_notifications") as any).insert({
            parent_id: activeParentId,
            sender_id: user.id,
            type: "appointment_reminder",
            notification_type: "appointment_reminder",
            message: `Appointment now: ${appointment.title} with ${appointment.doctor_name} at ${timeLabel} on ${dateLabel}.`,
            is_read: false,
            metadata: {
              appointment_id: appointment.id,
              appointment_alarm_key: alarmKey,
              scheduled_at: appointment.scheduled_at,
              doctor_name: appointment.doctor_name,
              title: appointment.title,
            },
          });
          queryClient.invalidateQueries({ queryKey: ["notifUnread"] });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      } catch (error) {
        console.error("Unable to create appointment notification", error);
      }
    },
    [activeParentId, globalElderSettings?.notify_push, queryClient, user?.id],
  );
  const checkAppointmentAlarms = useCallback(() => {
    if (
      profile?.role !== "parent" ||
      globalElderSettings?.appointment_reminders_enabled === false ||
      !activeParentId ||
      globalAppointments.length === 0 ||
      alarmAppointment ||
      alarmMed
    ) {
      return;
    }
    const nowMs = Date.now();
    const alarmState = readAppointmentAlarmState();
    let stateChanged = false;
    for (const [key, value] of Object.entries(alarmState)) {
      const scheduledMs = new Date(value.scheduledAt).getTime();
      if (!Number.isFinite(scheduledMs) || scheduledMs < nowMs - 7 * 24 * 60 * 60 * 1000) {
        delete alarmState[key];
        stateChanged = true;
      }
    }
    const sortedAppointments = [...globalAppointments].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
    for (const appointment of sortedAppointments) {
      if (!appointment.reminder_enabled) continue;
      const scheduledMs = new Date(appointment.scheduled_at).getTime();
      if (!Number.isFinite(scheduledMs)) continue;
      const alarmKey = `${appointment.id}__${appointment.scheduled_at}`;
      const stored = alarmState[alarmKey];
      if (stored?.dismissedAt) continue;
      if (stored?.snoozedUntil) {
        if (nowMs < stored.snoozedUntil) continue;
        alarmState[alarmKey] = {
          scheduledAt: appointment.scheduled_at,
          lastRungAt: nowMs,
        };
        writeAppointmentAlarmState(alarmState);
        setAlarmAppointment(appointment);
        playAlarmBeep();
        void publishAppointmentNotification(appointment, alarmKey);
        return;
      }
      const isDue = scheduledMs <= nowMs && nowMs - scheduledMs <= 30 * 60 * 1000;
      if (!isDue || stored?.lastRungAt) continue;
      alarmState[alarmKey] = {
        scheduledAt: appointment.scheduled_at,
        lastRungAt: nowMs,
      };
      writeAppointmentAlarmState(alarmState);
      setAlarmAppointment(appointment);
      playAlarmBeep();
      void publishAppointmentNotification(appointment, alarmKey);
      return;
    }
    if (stateChanged) writeAppointmentAlarmState(alarmState);
  }, [
    activeParentId,
    alarmAppointment,
    alarmMed,
    globalAppointments,
    globalElderSettings?.appointment_reminders_enabled,
    profile?.role,
    publishAppointmentNotification,
    readAppointmentAlarmState,
    writeAppointmentAlarmState,
  ]);
  useEffect(() => {
    if (appointmentAlarmIntervalRef.current) {
      clearInterval(appointmentAlarmIntervalRef.current);
    }
    checkAppointmentAlarms();
    appointmentAlarmIntervalRef.current = setInterval(checkAppointmentAlarms, 15000);
    return () => {
      if (appointmentAlarmIntervalRef.current) {
        clearInterval(appointmentAlarmIntervalRef.current);
      }
    };
  }, [checkAppointmentAlarms]);
  useEffect(() => {
    if (globalElderSettings?.appointment_reminders_enabled !== false) return;
    setAlarmAppointment(null);
  }, [globalElderSettings?.appointment_reminders_enabled]);
  useEffect(() => {
    if (!alarmAppointment) return;
    const repeatingAlarm = setInterval(playAlarmBeep, 8000);
    return () => clearInterval(repeatingAlarm);
  }, [alarmAppointment?.id]);
  function handleAppointmentSnooze() {
    if (!alarmAppointment) return;
    const alarmKey = `${alarmAppointment.id}__${alarmAppointment.scheduled_at}`;
    const alarmState = readAppointmentAlarmState();
    const snoozeUntil = Date.now() + 5 * 60 * 1000;
    alarmState[alarmKey] = {
      scheduledAt: alarmAppointment.scheduled_at,
      snoozedUntil: snoozeUntil,
    };
    writeAppointmentAlarmState(alarmState);
    toast.info(`Appointment alarm snoozed until ${format(new Date(snoozeUntil), "hh:mm a")}.`);
    setAlarmAppointment(null);
  }
  function handleAppointmentDismiss() {
    if (!alarmAppointment) return;
    const alarmKey = `${alarmAppointment.id}__${alarmAppointment.scheduled_at}`;
    const alarmState = readAppointmentAlarmState();
    alarmState[alarmKey] = {
      scheduledAt: alarmAppointment.scheduled_at,
      dismissedAt: Date.now(),
    };
    writeAppointmentAlarmState(alarmState);
    setAlarmAppointment(null);
  }
  const periodColors: Record<string, string> = {
    morning: "bg-amber-50 text-amber-700",
    noon: "bg-blue-50 text-blue-700",
    evening: "bg-purple-50 text-purple-700",
    night: "bg-slate-100 text-slate-700",
  };
  const periodEmoji: Record<string, string> = {
    morning: "🌅",
    noon: "☀️",
    evening: "🌆",
    night: "🌙",
  };
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
      return (data || []) as Array<{
        id: string;
        name: string | null;
        phone: string | null;
        relationship: string | null;
        priority: number;
      }>;
    },
  });
  const { data: parentActiveAlert } = useQuery({
    queryKey: ["parent_active_sos", profile?.id],
    enabled: profile?.role === "parent",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sos_alerts")
        .select("id, created_at, status, parent_id")
        .eq("parent_id", profile!.id)
        .in("status", ["active", "acknowledged"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });
  const liveSosLocationState = useSosLiveLocation({
    alertId: parentActiveAlert?.id,
    parentId: profile?.role === "parent" ? profile.id : null,
    actorId: user?.id,
    enabled:
      profile?.role === "parent" &&
      Boolean(parentActiveAlert) &&
      globalElderSettings?.sos_share_location !== false,
  });
  const [escalationTimeLeft, setEscalationTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (
      profile?.role !== "parent" ||
      !parentActiveAlert ||
      parentActiveAlert.status !== "active" ||
      globalContacts.length < 2
    ) {
      setEscalationTimeLeft(null);
      return;
    }
    const updateReminder = () => {
      const intervalMinutes = globalElderSettings?.sos_escalation_minutes || 5;
      const intervalSeconds = Math.max(60, intervalMinutes * 60);
      const elapsedSeconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(parentActiveAlert.created_at).getTime()) / 1000),
      );
      const nextStep = Math.floor(elapsedSeconds / intervalSeconds) + 1;
      if (nextStep >= globalContacts.length) {
        setEscalationTimeLeft(null);
        return;
      }
      const remaining = nextStep * intervalSeconds - elapsedSeconds;
      setEscalationTimeLeft(Math.max(0, remaining));
      if (remaining === 15 && typeof window !== "undefined") {
        const reminderKey = `eldercare:sos-contact-reminder:${parentActiveAlert.id}:${nextStep}`;
        if (!window.localStorage.getItem(reminderKey)) {
          window.localStorage.setItem(reminderKey, "shown");
          const nextContact = globalContacts[nextStep];
          toast.info(
            globalElderSettings?.language === "hi"
              ? `15 सेकंड में अगले आपातकालीन संपर्क ${nextContact.name || ""} से संपर्क करने की याद दिलाई जाएगी।`
              : `Reminder: contact ${nextContact.name || "the next emergency contact"} if help has not arrived.`,
            { duration: 10000 },
          );
        }
      }
    };
    updateReminder();
    const timer = window.setInterval(updateReminder, 1000);
    return () => {
      window.clearInterval(timer);
      setEscalationTimeLeft(null);
    };
  }, [profile?.role, parentActiveAlert, globalContacts, globalElderSettings]);
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
    refetchInterval: 30000,
  });
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
          void queryClient.invalidateQueries({ queryKey: ["notifUnread", user.id] });
          void queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
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
  const activePageLabel =
    [...navItems, ...aiItems, { to: "/sos", label: "SOS Control", icon: null }].find(
      (item) => item.to === pathname,
    )?.label ?? "ElderCare";
  const NavContent = ({ onLinkClick }: { onLinkClick?: () => void }) => (
    <nav className="space-y-1.5">
      <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100/[0.45]">
        Care workspace
      </p>
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
      <div className="my-4 border-t border-white/10 pt-4">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100/[0.45]">
          Smart care
        </p>
        <div className="space-y-1.5">
          {aiItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              active={pathname === item.to}
              onClick={onLinkClick}
            />
          ))}
        </div>
      </div>
      <div className="mt-4 border-t border-white/10 pt-4">
        <Link
          to="/sos"
          preload="intent"
          onClick={onLinkClick}
          className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all ${pathname === "/sos"
              ? "bg-rose-500 text-white shadow-lg shadow-rose-950/25"
              : "bg-rose-500/[0.12] text-rose-100 hover:bg-rose-500/20"
            }`}
        >
          <span className="grid size-8 place-items-center rounded-lg bg-rose-500 text-white shadow-lg shadow-rose-950/25">
            <Siren className="size-4 animate-pulse" strokeWidth={1.9} />
          </span>
          SOS Control
          <span className="ml-auto size-2 rounded-full bg-rose-300 animate-pulse" />
        </Link>
      </div>
    </nav>
  );
  return (
    <div className="min-h-screen bg-[#f4f8f6] text-[#17343a] flex flex-col">
      <style>{`
        @keyframes alarmWobble { from { transform: rotate(-8deg) scale(1); } to { transform: rotate(8deg) scale(1.08); } }
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
      `}</style>
      <Dialog
        open={!!alarmMed}
        onOpenChange={(open) => {
          if (!open) handleAlarmSnooze();
        }}
      >
        <DialogContent
          className="max-w-md p-0 overflow-hidden border-0 shadow-2xl"
          style={{ borderRadius: "1.5rem" }}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div
            className="relative flex flex-col items-center justify-center pt-10 pb-8 px-6 text-white"
            style={{ background: "linear-gradient(135deg, #0f8a83 0%, #08727a 58%, #07515e 100%)" }}
          >
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span
                className="block rounded-full opacity-20"
                style={{
                  width: 180,
                  height: 180,
                  background: "white",
                  animation: "ping 1.4s cubic-bezier(0,0,0.2,1) infinite",
                }}
              />
            </span>
            <div
              className="relative z-10 rounded-full flex items-center justify-center mb-4 shadow-lg"
              style={{
                width: 72,
                height: 72,
                background: "rgba(255,255,255,0.2)",
                backdropFilter: "blur(8px)",
                animation: "alarmWobble 0.6s ease-in-out infinite alternate",
              }}
            >
              <AlarmClock className="size-9" />
            </div>
            <h2 className="relative z-10 text-2xl font-bold tracking-tight text-center">
              Time for your medicine!
            </h2>
            <p className="relative z-10 mt-1 text-white/80 text-sm">
              {alarmMed && format(new Date(), "hh:mm a · EEEE, MMM d")}
            </p>
          </div>

          <div className="px-6 py-5">
            {alarmMed && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 flex items-center gap-4 mb-6">
                <div
                  className="shrink-0 size-14 rounded-xl flex items-center justify-center text-2xl font-bold"
                  style={{ background: "linear-gradient(135deg,#e8f7ef,#d4eee0)" }}
                >
                  {alarmMed.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-lg leading-tight truncate">{alarmMed.name}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {alarmMed.dosage} &nbsp;·&nbsp;
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${periodColors[alarmMed.period] ?? "bg-stone-100 text-stone-700"}`}
                    >
                      {periodEmoji[alarmMed.period]} {alarmMed.period}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="size-3 inline" /> Scheduled:{" "}
                    {alarmMed.schedule_time?.slice(0, 5)}
                  </p>
                  {alarmMed.notes && (
                    <p className="text-xs italic text-muted-foreground mt-0.5 truncate">
                      {alarmMed.notes}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 gap-2"
                onClick={handleAlarmSnooze}
              >
                <Clock className="size-4" /> Snooze 5 min
              </Button>
              <Button
                className="flex-1 rounded-xl gap-2 text-white font-semibold shadow-md"
                style={{ background: "linear-gradient(135deg, #0f8a83, #08727a)" }}
                onClick={handleAlarmTaken}
                disabled={globalMarkTaken.isPending}
              >
                <CheckCircle2 className="size-4" />
                {globalMarkTaken.isPending ? "Saving…" : "Medicine Taken"}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-4">
              Closing this dialog will snooze the alarm for 5 minutes.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!alarmAppointment}
        onOpenChange={(open) => {
          if (!open) handleAppointmentDismiss();
        }}
      >
        <DialogContent
          className="max-w-md p-0 overflow-hidden border-0 shadow-2xl"
          style={{ borderRadius: "1.5rem" }}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <div
            className="relative flex flex-col items-center justify-center px-6 pb-8 pt-10 text-white"
            style={{ background: "linear-gradient(135deg, #1595a0 0%, #08727a 55%, #07515e 100%)" }}
          >
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span
                className="block rounded-full opacity-20"
                style={{
                  width: 180,
                  height: 180,
                  background: "white",
                  animation: "ping 1.4s cubic-bezier(0,0,0.2,1) infinite",
                }}
              />
            </span>
            <div
              className="relative z-10 mb-4 flex size-[72px] items-center justify-center rounded-full shadow-lg"
              style={{
                background: "rgba(255,255,255,0.2)",
                backdropFilter: "blur(8px)",
                animation: "alarmWobble 0.6s ease-in-out infinite alternate",
              }}
            >
              <CalendarDays className="size-9" />
            </div>
            <h2 className="relative z-10 text-center text-2xl font-bold tracking-tight">
              Appointment time!
            </h2>
            <p className="relative z-10 mt-1 text-sm text-white/80">
              {alarmAppointment &&
                format(new Date(alarmAppointment.scheduled_at), "hh:mm a · EEEE, MMM d")}
            </p>
          </div>

          <div className="px-6 py-5">
            {alarmAppointment && (
              <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-lg font-bold leading-tight">{alarmAppointment.title}</p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  Dr. {alarmAppointment.doctor_name}
                  {alarmAppointment.specialty ? ` · ${alarmAppointment.specialty}` : ""}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  {format(new Date(alarmAppointment.scheduled_at), "EEEE, MMM d, yyyy · hh:mm a")}
                </p>
                {alarmAppointment.location && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" />
                    {alarmAppointment.location}
                  </p>
                )}
                {alarmAppointment.notes && (
                  <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs italic text-muted-foreground">
                    {alarmAppointment.notes}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-xl gap-2"
                onClick={handleAppointmentSnooze}
              >
                <Clock className="size-4" /> Snooze 5 min
              </Button>
              <Button
                className="flex-1 rounded-xl gap-2 text-white font-semibold shadow-md"
                style={{ background: "linear-gradient(135deg, #1595a0, #08727a)" }}
                onClick={handleAppointmentDismiss}
              >
                <CheckCircle2 className="size-4" /> Dismiss
              </Button>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              This alarm appears only when Enable Notifications is checked for the appointment.
            </p>
          </div>
        </DialogContent>
      </Dialog>

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

      {!isChildView && parentActiveAlert && (
        <div className="bg-orange-600 text-white px-4 py-2.5 text-center text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 select-none z-50 relative shadow-md shrink-0">
          <Siren className="size-4 shrink-0 animate-pulse" />
          <span>
            🚨 SOS Alert Active
            {escalationTimeLeft !== null && escalationTimeLeft > 0
              ? ` — Next contact reminder in ${Math.floor(escalationTimeLeft / 60)}m ${escalationTimeLeft % 60}s`
              : ""}
          </span>
          <Link to="/sos" className="underline hover:text-orange-100 ml-1.5 font-bold">
            Manage
          </Link>
        </div>
      )}

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[272px] flex-col overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,#0b4a50_0%,#083c43_52%,#062f36_100%)] text-white shadow-[18px_0_50px_-35px_rgba(2,38,45,0.85)] md:flex">
        <div className="relative px-6 pb-4 pt-6">
          <div className="flex items-center gap-3" aria-label="ElderCare Connect">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-[#9ed6c7]">
              <HeartPulse className="size-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[17px] font-bold tracking-[-0.035em] text-white">
                ElderCare <span className="text-[#8ed0be]">Connect</span>
              </p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">
                Family care platform
              </p>
            </div>
          </div>
          <p className="mt-3 max-w-[210px] text-xs leading-relaxed text-emerald-50/[0.48]">
            Care, health and family connection in one calm place.
          </p>
        </div>

        <div className="relative mx-4 mb-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <EditableAvatar size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{profile?.full_name || "User"}</p>
              <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-200/[0.65]">
                {isChildView ? `Monitoring ${activeParent?.full_name ?? "parent"}` : "Care recipient"}
              </p>
            </div>
            <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.85)]" />
          </div>
          {isChildView && linkedParents.length > 0 && (
            <Select value={activeParent?.id ?? undefined} onValueChange={(v) => setSelectedParentId(v)}>
              <SelectTrigger className="mt-3 h-9 border-white/10 bg-black/10 text-xs text-white hover:bg-white/10">
                <SelectValue placeholder="Select parent" />
              </SelectTrigger>
              <SelectContent>
                {linkedParents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="relative flex-1 overflow-y-auto px-4 pb-5 pt-2 [scrollbar-color:rgba(255,255,255,.15)_transparent] [scrollbar-width:thin]">
          <NavContent />
        </div>

        <div className="relative m-4 mt-0 rounded-2xl border border-white/10 bg-white/[0.055] p-3">
          <div className="mb-3 flex items-start gap-2.5 rounded-xl bg-emerald-300/10 px-3 py-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-emerald-300" />
            <p className="text-[11px] leading-relaxed text-emerald-50/[0.65]">Your care data stays private and protected.</p>
          </div>
          <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-100 transition-colors hover:bg-rose-500/15 hover:text-white">
            <LogOut className="size-4 shrink-0" /> Sign out
          </button>
        </div>
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[292px] max-w-[88vw] flex-col overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,#0b4a50_0%,#062f36_100%)] text-white shadow-2xl transition-transform duration-300 ease-out md:hidden ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Mobile navigation"
      >
        <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3" aria-label="ElderCare Connect">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-[#9ed6c7]">
              <HeartPulse className="size-4.5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold tracking-[-0.03em] text-white">
                ElderCare <span className="text-[#8ed0be]">Connect</span>
              </p>
            </div>
          </div>
          <button onClick={() => setDrawerOpen(false)} className="grid size-9 place-items-center rounded-xl bg-white/[0.08] text-white/75 hover:bg-white/[0.14] hover:text-white" aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <div className="relative mx-4 mt-4 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5">
          <div className="flex items-center gap-3">
            <EditableAvatar size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{profile?.full_name || "User"}</p>
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200/[0.6]">{isChildView ? "Family monitoring" : "Care recipient"}</p>
            </div>
          </div>
          {isChildView && linkedParents.length > 0 && (
            <Select value={activeParent?.id ?? undefined} onValueChange={(v) => setSelectedParentId(v)}>
              <SelectTrigger className="mt-3 h-9 border-white/10 bg-black/10 text-xs text-white">
                <SelectValue placeholder="Select parent" />
              </SelectTrigger>
              <SelectContent>
                {linkedParents.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="relative flex-1 overflow-y-auto px-4 py-4">
          <NavContent onLinkClick={() => setDrawerOpen(false)} />
        </div>
        <div className="relative border-t border-white/10 p-4">
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-100 hover:bg-rose-500/15 hover:text-white">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex min-h-screen flex-1 flex-col md:pl-[272px]">
        <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4 lg:px-8">
          <div className="mx-auto flex min-h-[68px] max-w-[1460px] items-center gap-3 rounded-2xl border border-[#dce8e4] bg-white/95 px-3.5 shadow-[0_16px_40px_-28px_rgba(3,59,68,0.45)] backdrop-blur-xl sm:px-5">
            <button onClick={() => setDrawerOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-white text-muted-foreground shadow-sm hover:bg-accent md:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </button>

            <div className="min-w-0 shrink-0">
              <p className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-[#789095] sm:block">Care workspace</p>
              <p className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">{activePageLabel}</p>
            </div>

            <div className="mx-auto hidden w-full max-w-xl lg:block">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input type="search" placeholder="Search medicines, appointments, records..." className="h-11 w-full rounded-xl border border-border/90 bg-[#f5f8f7] pl-10 pr-4 text-sm outline-none transition focus:border-primary/50 focus:bg-white focus:ring-4 focus:ring-primary/10" />
              </label>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {isChildView && linkedParents.length > 0 && (
                <Select value={activeParent?.id ?? undefined} onValueChange={(v) => setSelectedParentId(v)}>
                  <SelectTrigger className="hidden h-10 w-auto min-w-[150px] rounded-xl border-border bg-white text-sm shadow-sm sm:flex">
                    <SelectValue placeholder="Select parent" />
                  </SelectTrigger>
                  <SelectContent>
                    {linkedParents.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              <Link to="/notifications" preload="intent" className="relative grid size-10 place-items-center rounded-xl border border-border bg-white text-muted-foreground shadow-sm transition hover:border-primary/25 hover:bg-accent hover:text-primary" aria-label="Notifications">
                <Bell className="size-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-[#d97745] px-1 text-[9px] font-bold text-white shadow-sm">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>

              <div className="hidden items-center gap-2 rounded-xl border border-border bg-white py-1.5 pl-1.5 pr-3 shadow-sm sm:flex">
                <EditableAvatar size="sm" />
                <div className="max-w-[130px] min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">{profile?.full_name || "User"}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{isChildView ? `Monitoring ${activeParent?.full_name ?? "parent"}` : "Active now"}</p>
                </div>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1460px] flex-1 px-3 pb-8 pt-5 sm:px-5 sm:pb-10 sm:pt-6 lg:px-8 lg:pb-12">
          {children}
        </div>
      </main>
    </div>
  );
}