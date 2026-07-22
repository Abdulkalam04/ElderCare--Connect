import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Heart,
  HeartPulse,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Pill,
  RefreshCw,
  ShieldAlert,
  Siren,
  Stethoscope,
  Users,
  Video,
  Wind,
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isTomorrow } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { WellbeingCheckCard } from "@/components/WellbeingCheckCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useActiveParent } from "@/hooks/useProfile";
import { useSosActions } from "@/hooks/useSosActions";
import { createMedicalFileAccessUrl } from "@/lib/api/medicalFiles.functions";
export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  component: DashboardPage,
});
type MedicineRow = {
  id: string;
  name: string;
  dosage: string | null;
  period: string | null;
  schedule_time: string;
  notes: string | null;
  active: boolean;
};
type VitalType = "blood_pressure" | "blood_sugar" | "heart_rate" | "oxygen_saturation";
type VitalRow = {
  id: string;
  vital_type: VitalType;
  value: number;
  value_secondary: number | null;
  unit: string | null;
  recorded_at: string;
  created_at: string;
  is_abnormal: boolean;
};
type CaregiverBooking = {
  id: string;
  caregiver_type: string | null;
  caregiver_name: string | null;
  scheduled_at: string;
  duration_hours: number | null;
  status: "pending" | "confirmed" | "assigned" | "in_progress";
  notes: string | null;
};
type HealthRecord = {
  id: string;
  title: string;
  category: string | null;
  doctor_name: string | null;
  record_date: string;
  file_path: string | null;
  file_url: string | null;
};
type ScheduleData = {
  appointments: Array<Record<string, any>>;
  consultations: Array<Record<string, any>>;
  transport: Array<Record<string, any>>;
};
type CareEvent = {
  id: string;
  kind: "appointment" | "video" | "transport";
  title: string;
  subtitle: string;
  location: string | null;
  scheduledAt: string;
  status: string;
  route: "/appointments" | "/video" | "/transport";
  isLive: boolean;
};
type ActiveSosAlert = {
  id: string;
  parent_name: string | null;
  status: "active" | "acknowledged";
  created_at: string;
  address: string | null;
  acknowledged_at?: string | null;
};
const VITAL_TYPES: VitalType[] = [
  "blood_pressure",
  "blood_sugar",
  "heart_rate",
  "oxygen_saturation",
];
function DashboardPage() {
  const medicalFileAccess = useServerFn(createMedicalFileAccessUrl);
  const {
    activeParent,
    activeParentId,
    profile,
    isChildView,
    isLoading: activeParentLoading,
  } = useActiveParent();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"my" | "family">("my");
  const [now, setNow] = useState(() => new Date());
  const today = format(now, "yyyy-MM-dd");
  const medicationLogKey = ["medLogs", activeParentId, today] as const;
  const sosActions = useSosActions({
    parentId: profile?.role === "parent" ? profile.id : activeParentId,
    actor: profile,
  });
  const linkedChildren = sosActions.linkedChildren;
  const emergencyContacts = sosActions.emergencyContacts;
  const showViewToggle = !isChildView && linkedChildren.length > 0;
  const isFamilyView = showViewToggle && viewMode === "family";
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!showViewToggle && viewMode === "family") {
      setViewMode("my");
    }
  }, [showViewToggle, viewMode]);
  const medicinesQuery = useQuery({
    queryKey: ["dashboardMedicines", activeParentId],
    enabled: Boolean(activeParentId),
    staleTime: 30000,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicines")
        .select("id,name,dosage,period,schedule_time,notes,active")
        .eq("parent_id", activeParentId!)
        .eq("active", true)
        .order("schedule_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MedicineRow[];
    },
  });
  const medicineLogsQuery = useQuery({
    queryKey: medicationLogKey,
    enabled: Boolean(activeParentId),
    staleTime: 15000,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicine_logs")
        .select("medicine_id")
        .eq("parent_id", activeParentId!)
        .eq("log_date", today);
      if (error) throw error;
      return new Set((data ?? []).map((log) => log.medicine_id));
    },
  });
  const wellbeingQuery = useQuery({
    queryKey: ["wellbeing", activeParentId, today],
    enabled: Boolean(activeParentId),
    staleTime: 15000,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wellbeing_checks")
        .select("*")
        .eq("parent_id", activeParentId!)
        .eq("check_date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const latestVitalsQuery = useQuery({
    queryKey: ["latestVitals", activeParentId],
    enabled: Boolean(activeParentId),
    staleTime: 15000,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vitals")
        .select("id,vital_type,value,value_secondary,unit,recorded_at,created_at,is_abnormal")
        .eq("parent_id", activeParentId!)
        .in("vital_type", VITAL_TYPES)
        .order("recorded_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as VitalRow[];
    },
  });
  const nextCaregiverQuery = useQuery({
    queryKey: ["nextBooking", activeParentId],
    enabled: Boolean(activeParentId),
    staleTime: 30000,
    refetchInterval: 60000,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("caregiver_bookings")
        .select("id,caregiver_type,caregiver_name,scheduled_at,duration_hours,status,notes")
        .eq("parent_id", activeParentId!)
        .in("status", ["pending", "confirmed", "assigned", "in_progress"])
        .order("scheduled_at", { ascending: true })
        .limit(40);
      if (error) throw error;
      const rows = (data ?? []) as CaregiverBooking[];
      const inProgress = rows
        .filter((booking) => booking.status === "in_progress")
        .sort(
          (first, second) => toTimestamp(second.scheduled_at) - toTimestamp(first.scheduled_at),
        )[0];
      if (inProgress) return inProgress;
      const currentTime = Date.now();
      const future = rows
        .filter((booking) => toTimestamp(booking.scheduled_at) >= currentTime)
        .sort(
          (first, second) => toTimestamp(first.scheduled_at) - toTimestamp(second.scheduled_at),
        )[0];
      if (future) return future;
      return (
        rows.sort(
          (first, second) => toTimestamp(second.scheduled_at) - toTimestamp(first.scheduled_at),
        )[0] ?? null
      );
    },
  });
  const recentReportsQuery = useQuery({
    queryKey: ["recentReports", activeParentId],
    enabled: Boolean(activeParentId),
    staleTime: 30000,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("health_records")
        .select("id,title,category,doctor_name,record_date,file_path,file_url,created_at")
        .eq("parent_id", activeParentId!)
        .order("record_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as HealthRecord[];
    },
  });
  const scheduleQuery = useQuery({
    queryKey: ["dashboardSchedule", activeParentId],
    enabled: Boolean(activeParentId),
    staleTime: 30000,
    refetchInterval: 60000,
    refetchOnMount: "always",
    queryFn: async (): Promise<ScheduleData> => {
      const [appointments, consultations, transport] = await Promise.all([
        (supabase as any)
          .from("appointments")
          .select(
            "id,title,doctor_name,location,scheduled_at,status,appointment_date,appointment_time",
          )
          .eq("parent_id", activeParentId!)
          .in("status", ["pending", "confirmed", "scheduled"])
          .order("scheduled_at", { ascending: true })
          .limit(15),
        (supabase as any)
          .from("video_consultations")
          .select(
            "id,doctor_name,specialty,scheduled_at,status,consultation_date,consultation_time",
          )
          .eq("parent_id", activeParentId!)
          .in("status", ["scheduled", "waiting", "pending", "in_progress"])
          .order("scheduled_at", { ascending: true })
          .limit(15),
        (supabase as any)
          .from("transport_bookings")
          .select(
            "id,purpose,pickup_address,destination,scheduled_at,status,transport_date,transport_time,driver_name",
          )
          .eq("parent_id", activeParentId!)
          .in("status", ["pending", "confirmed", "driver_assigned", "en_route", "arrived"])
          .order("scheduled_at", { ascending: true })
          .limit(15),
      ]);
      if (appointments.error) throw appointments.error;
      if (consultations.error) throw consultations.error;
      if (transport.error) throw transport.error;
      return {
        appointments: appointments.data ?? [],
        consultations: consultations.data ?? [],
        transport: transport.data ?? [],
      };
    },
  });
  const activeSosQuery = useQuery({
    queryKey: ["activeSosDashboard", activeParentId],
    enabled: Boolean(activeParentId),
    staleTime: 5000,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sos_alerts")
        .select("id,parent_name,status,created_at,address,acknowledged_at,acknowledged_by")
        .eq("parent_id", activeParentId!)
        .in("status", ["active", "acknowledged"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ActiveSosAlert | null;
    },
  });
  useEffect(() => {
    if (!activeParentId) return;
    const invalidate = (keys: ReadonlyArray<ReadonlyArray<unknown>>) => {
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: [...key] });
      }
    };
    const channel = supabase
      .channel(`dashboard-sync-${activeParentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "medicines",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () =>
          invalidate([
            ["dashboardMedicines", activeParentId],
            ["medicines-all", activeParentId],
            ["global_meds", activeParentId],
          ]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "medicine_logs",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () =>
          invalidate([
            ["medLogs", activeParentId],
            ["global_taken_meds", activeParentId],
          ]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wellbeing_checks",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () =>
          invalidate([
            ["wellbeing", activeParentId],
            ["wellbeing-history", activeParentId],
          ]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vitals",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () =>
          invalidate([
            ["latestVitals", activeParentId],
            ["vitals", activeParentId],
          ]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "caregiver_bookings",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () =>
          invalidate([
            ["nextBooking", activeParentId],
            ["caregiver_bookings", activeParentId],
          ]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "health_records",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () =>
          invalidate([
            ["recentReports", activeParentId],
            ["records", activeParentId],
          ]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () =>
          invalidate([
            ["dashboardSchedule", activeParentId],
            ["appointments", activeParentId],
          ]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "video_consultations",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () =>
          invalidate([
            ["dashboardSchedule", activeParentId],
            ["video", activeParentId],
          ]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transport_bookings",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () =>
          invalidate([
            ["dashboardSchedule", activeParentId],
            ["transport", activeParentId],
          ]),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sos_alerts",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () =>
          invalidate([
            ["activeSosDashboard", activeParentId],
            ["sos", activeParentId],
          ]),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeParentId, queryClient]);
  useEffect(() => {
    if (!profile?.id || profile.role !== "parent") return;
    const channel = supabase
      .channel(`dashboard-family-sync-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parent_child_links",
          filter: `parent_id=eq.${profile.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["linkedChildren", profile.id],
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.role, queryClient]);
  const markTaken = useMutation({
    mutationFn: async (medicineId: string) => {
      if (!activeParentId) throw new Error("No care profile is selected.");
      const { error } = await supabase.from("medicine_logs").insert({
        medicine_id: medicineId,
        parent_id: activeParentId,
        log_date: today,
      });
      if (error && (error as any).code !== "23505") throw error;
      return {
        medicineId,
        alreadyTaken: Boolean(error && (error as any).code === "23505"),
      };
    },
    onSuccess: ({ medicineId, alreadyTaken }) => {
      queryClient.setQueryData<Set<string>>(medicationLogKey, (current) => {
        const updated = new Set(current ?? []);
        updated.add(medicineId);
        return updated;
      });
      void queryClient.invalidateQueries({
        queryKey: ["global_taken_meds", activeParentId],
      });
      toast.success(alreadyTaken ? "Already marked as taken" : "Marked as taken");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Unable to mark the medicine as taken."),
  });
  const acknowledgeSos = useMutation({
    mutationFn: async (alertId: string) => {
      if (!profile?.id || !activeParentId) {
        throw new Error("Your profile is not ready.");
      }
      const { data, error } = await (supabase as any)
        .from("sos_alerts")
        .update({
          status: "acknowledged",
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: profile.id,
        })
        .eq("id", alertId)
        .eq("parent_id", activeParentId)
        .eq("status", "active")
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("This SOS alert was already acknowledged or changed.");
      }
    },
    onSuccess: () => {
      toast.success("SOS alert acknowledged.");
      void queryClient.invalidateQueries({ queryKey: ["activeSosDashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["sos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resolveSos = useMutation({
    mutationFn: async (alertId: string) => {
      if (!profile?.id || !activeParentId) {
        throw new Error("Your profile is not ready.");
      }
      const { data, error } = await (supabase as any)
        .from("sos_alerts")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: profile.id,
        })
        .eq("id", alertId)
        .eq("parent_id", activeParentId)
        .in("status", ["active", "acknowledged"])
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("This SOS alert was already resolved or changed.");
      }
    },
    onSuccess: () => {
      toast.success("SOS alert marked as resolved.");
      queryClient.setQueryData(["activeSosDashboard", activeParentId], null);
      void queryClient.invalidateQueries({ queryKey: ["sos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const latestVitalByType = useMemo(() => {
    const map = new Map<VitalType, VitalRow>();
    const sorted = [...(latestVitalsQuery.data ?? [])].sort((first, second) => {
      const recordedDifference = toTimestamp(second.recorded_at) - toTimestamp(first.recorded_at);
      if (recordedDifference !== 0) return recordedDifference;
      return toTimestamp(second.created_at) - toTimestamp(first.created_at);
    });
    for (const vital of sorted) {
      if (!map.has(vital.vital_type)) map.set(vital.vital_type, vital);
    }
    return map;
  }, [latestVitalsQuery.data]);
  const upcomingCareEvents = useMemo(() => {
    const source = scheduleQuery.data;
    if (!source) return [] as CareEvent[];
    const events: CareEvent[] = [
      ...source.appointments.map(
        (appointment): CareEvent => ({
          id: `appointment-${appointment.id}`,
          kind: "appointment",
          title: appointment.title || "Medical appointment",
          subtitle: appointment.doctor_name
            ? formatDoctorName(appointment.doctor_name)
            : "Doctor appointment",
          location: appointment.location || null,
          scheduledAt:
            appointment.scheduled_at ||
            localDateTime(appointment.appointment_date, appointment.appointment_time),
          status: appointment.status || "scheduled",
          route: "/appointments",
          isLive: false,
        }),
      ),
      ...source.consultations.map(
        (consultation): CareEvent => ({
          id: `video-${consultation.id}`,
          kind: "video",
          title: consultation.doctor_name
            ? `Video consultation with ${formatDoctorName(consultation.doctor_name)}`
            : "Video consultation",
          subtitle: consultation.specialty || "Online medical consultation",
          location: "Online",
          scheduledAt:
            consultation.scheduled_at ||
            localDateTime(consultation.consultation_date, consultation.consultation_time),
          status: consultation.status || "scheduled",
          route: "/video",
          isLive: consultation.status === "in_progress" || consultation.status === "waiting",
        }),
      ),
      ...source.transport.map(
        (ride): CareEvent => ({
          id: `transport-${ride.id}`,
          kind: "transport",
          title: `${humanize(ride.purpose || "medical")} transport`,
          subtitle: ride.destination || "Medical transport",
          location: ride.pickup_address || null,
          scheduledAt: ride.scheduled_at || localDateTime(ride.transport_date, ride.transport_time),
          status: ride.status || "pending",
          route: "/transport",
          isLive: ["en_route", "arrived"].includes(ride.status),
        }),
      ),
    ];
    const currentTime = now.getTime();
    const recentCutoff = currentTime - 6 * 60 * 60 * 1000;
    return events
      .filter((event) => {
        const timestamp = toTimestamp(event.scheduledAt);
        return Number.isFinite(timestamp) && (event.isLive || timestamp >= recentCutoff);
      })
      .sort((first, second) => {
        if (first.isLive !== second.isLive) return first.isLive ? -1 : 1;
        return toTimestamp(first.scheduledAt) - toTimestamp(second.scheduledAt);
      })
      .slice(0, 5);
  }, [now, scheduleQuery.data]);
  const medicines = medicinesQuery.data ?? [];
  const takenMedicineIds = medicineLogsQuery.data ?? new Set<string>();
  const completedMedicineCount = medicines.filter((medicine) =>
    takenMedicineIds.has(medicine.id),
  ).length;
  const medicineProgress = medicines.length
    ? Math.round((completedMedicineCount / medicines.length) * 100)
    : 0;
  const allMedicinesTaken = medicines.length > 0 && completedMedicineCount === medicines.length;
  const dashboardQueries = [
    medicinesQuery,
    medicineLogsQuery,
    wellbeingQuery,
    latestVitalsQuery,
    nextCaregiverQuery,
    recentReportsQuery,
    scheduleQuery,
    activeSosQuery,
  ];
  const dashboardError = dashboardQueries.find((query) => query.isError)?.error;
  const isRefreshing = dashboardQueries.some((query) => query.isFetching);
  async function refreshDashboard() {
    if (!activeParentId) return;
    void queryClient.invalidateQueries({
      queryKey: ["emergency_contacts", activeParentId],
    });
    if (profile?.role === "parent") {
      void queryClient.invalidateQueries({
        queryKey: ["linkedChildren", profile.id],
      });
    }
    const results = await Promise.all([
      medicinesQuery.refetch(),
      medicineLogsQuery.refetch(),
      wellbeingQuery.refetch(),
      latestVitalsQuery.refetch(),
      nextCaregiverQuery.refetch(),
      recentReportsQuery.refetch(),
      scheduleQuery.refetch(),
      activeSosQuery.refetch(),
    ]);
    const failed = results.filter((result) => result.isError).length;
    if (failed > 0) {
      toast.warning(
        `${failed} dashboard section${failed === 1 ? "" : "s"} could not be refreshed.`,
      );
    } else {
      toast.success("Dashboard refreshed");
    }
  }
  async function openReport(record: HealthRecord) {
    const hasFile = Boolean(record.file_path || record.file_url);
    if (!hasFile) {
      toast.info("This record does not have an attached file.");
      return;
    }
    const popup = window.open("about:blank", "_blank");
    if (popup) {
      popup.opener = null;
      popup.document.title = "Opening health record…";
      popup.document.body.innerHTML =
        '<p style="font-family:system-ui;padding:24px">Opening health record…</p>';
    }
    try {
      if (!record.file_path) {
        throw new Error("This legacy record must be re-uploaded into private medical storage.");
      }
      const result = await medicalFileAccess({
        data: {
          documentKind: "health_record",
          documentId: record.id,
          action: "view",
        },
      });
      const url = result.signedUrl;
      if (popup) popup.location.replace(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      popup?.close();
      toast.error(error instanceof Error ? error.message : "Unable to open the health record.");
    }
  }
  if (activeParentLoading) {
    return (
      <AppShell>
        <div className="grid min-h-[45vh] place-items-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Loading dashboard…</p>
          </div>
        </div>
      </AppShell>
    );
  }
  if (!activeParent) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-border bg-card p-10 text-center sm:p-12">
          <Heart className="mx-auto mb-4 size-10 text-primary" />
          <h2 className="font-display text-2xl font-bold">
            {isChildView ? "Connect to a care recipient" : "Welcome to ElderCare"}
          </h2>
          <p className="mx-auto mb-6 mt-2 max-w-md text-muted-foreground">
            {isChildView
              ? "Enter the Family Link Code on the Family page to start viewing the care dashboard."
              : "Complete your profile and share your Family Link Code with trusted family members."}
          </p>
          <Link to="/family">
            <Button className="rounded-xl">Open Family page</Button>
          </Link>
        </div>
      </AppShell>
    );
  }
  const activeSosAlert = activeSosQuery.data;
  const primaryEmergencyContact = emergencyContacts[0] ?? null;
  const greeting = getGreeting(now);
  return (
    <AppShell>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">{format(now, "EEEE, MMMM d")}</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
            {greeting}, {profile?.full_name?.split(" ")[0] || "there"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isChildView
              ? `Care overview for ${activeParent.full_name || "your family member"}.`
              : "Here is your care overview for today."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showViewToggle && (
            <div className="flex items-center rounded-full border border-border bg-card p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode("my")}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  viewMode === "my"
                    ? "bg-muted font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                My View
              </button>
              <button
                type="button"
                onClick={() => setViewMode("family")}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  viewMode === "family"
                    ? "bg-muted font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                Family ({linkedChildren.length})
              </button>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={refreshDashboard}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 size-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      {dashboardError && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">
                Some dashboard information could not be loaded.
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                {dashboardError instanceof Error
                  ? dashboardError.message
                  : "Please refresh and try again."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl border-red-300 bg-white"
            onClick={refreshDashboard}
          >
            Try again
          </Button>
        </div>
      )}

      {activeSosAlert && (
        <SosBanner
          alert={activeSosAlert}
          parentName={activeParent.full_name}
          isChildView={isChildView}
          acknowledgePending={acknowledgeSos.isPending}
          resolvePending={resolveSos.isPending}
          resendPending={sosActions.resend.isPending}
          cooldown={sosActions.cooldown}
          onAcknowledge={() => acknowledgeSos.mutate(activeSosAlert.id)}
          onResolve={() => resolveSos.mutate(activeSosAlert.id)}
          onResend={() => sosActions.resend.mutate(activeSosAlert.id)}
        />
      )}

      {!isChildView && sosActions.automatedRecipientCount === 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">No automatic SOS recipient is configured.</p>
            <p className="mt-0.5 text-xs text-amber-800">
              SOS will still activate, but add a linked family member or an emergency-contact email
              for automatic delivery.
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
              <Link to="/family" className="underline underline-offset-2">
                Manage family
              </Link>
              <Link to="/emergency-contacts" className="underline underline-offset-2">
                Manage emergency contacts
              </Link>
            </div>
          </div>
        </div>
      )}

      {isFamilyView ? (
        <FamilyView members={linkedChildren} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <main className="space-y-6 lg:col-span-2">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Latest Vitals</h2>
                  <p className="text-xs text-muted-foreground">Click any card to open Vitals.</p>
                </div>
                <Link to="/vitals" className="text-sm font-semibold text-brand-accent">
                  View all
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <VitalCard
                  label="Blood Pressure"
                  icon={<Activity className="size-5" />}
                  vital={latestVitalByType.get("blood_pressure")}
                />
                <VitalCard
                  label="Blood Sugar"
                  icon={<HeartPulse className="size-5" />}
                  vital={latestVitalByType.get("blood_sugar")}
                />
                <VitalCard
                  label="Heart Rate"
                  icon={<Heart className="size-5" />}
                  vital={latestVitalByType.get("heart_rate")}
                />
                <VitalCard
                  label="Oxygen"
                  icon={<Wind className="size-5" />}
                  vital={latestVitalByType.get("oxygen_saturation")}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">Today's Medicines</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Only active medicines are counted in today's progress.
                  </p>
                </div>
                <Link to="/medicines" className="shrink-0 text-sm font-semibold text-brand-accent">
                  View all
                </Link>
              </div>

              {medicines.length > 0 && (
                <div className="mb-5">
                  <div className="mb-2 flex items-center justify-between text-xs font-medium">
                    <span className="text-emerald-600">{completedMedicineCount} completed</span>
                    <span className="text-muted-foreground">
                      {medicines.length - completedMedicineCount} remaining
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${medicineProgress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {completedMedicineCount} of {medicines.length} doses taken today (
                    {medicineProgress}%)
                  </p>
                </div>
              )}

              {allMedicinesTaken && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                  <CheckCircle2 className="size-5" />
                  All medicines scheduled for today are marked as taken.
                </div>
              )}

              {medicinesQuery.isLoading || medicineLogsQuery.isLoading ? (
                <div className="grid min-h-36 place-items-center">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
              ) : medicines.length === 0 ? (
                <div className="rounded-xl bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  No active medicines are scheduled.{" "}
                  {!isChildView && (
                    <Link to="/medicines" className="font-semibold text-brand-accent">
                      Add medicine →
                    </Link>
                  )}
                </div>
              ) : (
                <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                  {medicines.map((medicine) => {
                    const taken = takenMedicineIds.has(medicine.id);
                    const schedule = medicineSchedule(today, medicine.schedule_time);
                    const overdue = !taken && schedule.getTime() < now.getTime();
                    const markingThisMedicine =
                      markTaken.isPending && markTaken.variables === medicine.id;
                    return (
                      <div
                        key={medicine.id}
                        className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3 sm:flex-row sm:items-center"
                      >
                        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                          <Pill className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold">{medicine.name}</p>
                            {overdue && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                Overdue
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {medicine.dosage || "Dosage not specified"}
                            {medicine.period ? ` · ${humanize(medicine.period)}` : ""}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock3 className="size-3" />
                            {format(schedule, "h:mm a")}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={taken ? "outline" : "default"}
                          className="rounded-xl sm:min-w-28"
                          disabled={taken || markingThisMedicine}
                          onClick={() => markTaken.mutate(medicine.id)}
                        >
                          {markingThisMedicine ? (
                            <Loader2 className="mr-1 size-4 animate-spin" />
                          ) : taken ? (
                            <CheckCircle2 className="mr-1 size-4 text-emerald-600" />
                          ) : null}
                          {taken ? "Taken" : "Mark taken"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Upcoming Care</h2>
                  <p className="text-xs text-muted-foreground">
                    Appointments, video consultations, and transport in one place.
                  </p>
                </div>
              </div>

              {scheduleQuery.isLoading ? (
                <div className="grid min-h-32 place-items-center">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
              ) : upcomingCareEvents.length === 0 ? (
                <div className="rounded-xl bg-muted/40 p-6 text-center">
                  <p className="text-sm text-muted-foreground">No upcoming care events.</p>
                  {!isChildView && (
                    <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs font-semibold text-brand-accent">
                      <Link to="/appointments">Add appointment</Link>
                      <Link to="/video">Schedule video consult</Link>
                      <Link to="/transport">Book transport</Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingCareEvents.map((event) => (
                    <CareEventItem key={event.id} event={event} now={now} />
                  ))}
                </div>
              )}
            </section>

            <WellbeingCheckCard
              parentId={activeParentId!}
              isChild={isChildView}
              existing={wellbeingQuery.data}
            />
          </main>

          <aside className="space-y-6">
            <QuickContacts
              isChildView={isChildView}
              activeParent={activeParent}
              primaryEmergencyContact={primaryEmergencyContact}
              familyMembers={linkedChildren}
            />

            {!isChildView && (
              <button
                type="button"
                onClick={() => sosActions.trigger.mutate()}
                disabled={sosActions.trigger.isPending || sosActions.cooldown > 0}
                className={`flex w-full items-center gap-3 rounded-2xl p-4 text-white shadow-sm transition-all disabled:opacity-65 ${
                  sosActions.cooldown > 0 ? "bg-stone-500" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                <div className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-white/30">
                  {sosActions.cooldown > 0 ? (
                    <span className="text-sm font-bold">{sosActions.cooldown}</span>
                  ) : sosActions.trigger.isPending ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Siren className="size-5" />
                  )}
                </div>
                <div className="text-left">
                  <p className="font-bold leading-none">
                    {sosActions.cooldown > 0 ? "SOS sent" : "Emergency SOS"}
                  </p>
                  <p className="mt-1 text-xs text-white/80">
                    {sosActions.cooldown > 0
                      ? "Cooldown active"
                      : "Tap to activate the emergency alert"}
                  </p>
                </div>
              </button>
            )}

            <UpcomingCaregiver booking={nextCaregiverQuery.data} now={now} />

            <RecentReports
              records={recentReportsQuery.data ?? []}
              loading={recentReportsQuery.isLoading}
              onOpen={openReport}
            />
          </aside>
        </div>
      )}
    </AppShell>
  );
}
function FamilyView({ members }: { members: Array<Record<string, any>> }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand">
          <Users className="size-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Linked Family Members</h2>
          <p className="text-xs text-muted-foreground">
            {members.length} trusted {members.length === 1 ? "person can" : "people can"} view your
            care information.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((member) => (
          <div key={member.id} className="rounded-xl bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              {member.avatar_url ? (
                <img src={member.avatar_url} alt="" className="size-12 rounded-full object-cover" />
              ) : (
                <div className="grid size-12 shrink-0 place-items-center rounded-full bg-brand/10 font-bold text-brand">
                  {(member.full_name || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{member.full_name || "Family member"}</p>
                {member.email && (
                  <a
                    href={`mailto:${member.email}`}
                    className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground hover:text-primary"
                  >
                    <Mail className="size-3 shrink-0" />
                    <span className="truncate">{member.email}</span>
                  </a>
                )}
                {member.phone && (
                  <a
                    href={`tel:${cleanPhone(member.phone)}`}
                    className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground hover:text-primary"
                  >
                    <Phone className="size-3 shrink-0" />
                    <span className="truncate">{member.phone}</span>
                  </a>
                )}
                {member.linked_at && (
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <CalendarDays className="size-3" />
                    Linked {format(new Date(member.linked_at), "MMM d, yyyy")}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <Link to="/family" className="text-sm font-semibold text-brand-accent">
          Manage family →
        </Link>
      </div>
    </section>
  );
}
function VitalCard({
  label,
  icon,
  vital,
}: {
  label: string;
  icon: React.ReactNode;
  vital: VitalRow | undefined;
}) {
  const value = vital ? formatVitalValue(vital) : "—";
  const unit = vital?.unit || defaultVitalUnit(label);
  const statusLabel = !vital ? "No data" : vital.is_abnormal ? "Needs attention" : "Within range";
  return (
    <Link
      to="/vitals"
      className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`Open ${label} in Vitals`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
            !vital
              ? "bg-muted text-muted-foreground"
              : vital.is_abnormal
                ? "bg-red-100 text-red-700"
                : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        {vital
          ? `Recorded ${formatDistanceToNow(new Date(vital.recorded_at), { addSuffix: true })}`
          : "Click to add a reading"}
      </p>
    </Link>
  );
}
function CareEventItem({ event, now }: { event: CareEvent; now: Date }) {
  const icon =
    event.kind === "appointment" ? (
      <CalendarDays className="size-5" />
    ) : event.kind === "video" ? (
      <Video className="size-5" />
    ) : (
      <Car className="size-5" />
    );
  const timestamp = new Date(event.scheduledAt);
  const isPastDue = !event.isLive && timestamp.getTime() < now.getTime();
  return (
    <Link
      to={event.route as any}
      className="flex flex-col gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold">{event.title}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              event.isLive
                ? "bg-emerald-100 text-emerald-700"
                : isPastDue
                  ? "bg-red-100 text-red-700"
                  : "bg-blue-100 text-blue-700"
            }`}
          >
            {event.isLive
              ? humanize(event.status)
              : isPastDue
                ? "Past due"
                : humanize(event.status)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{event.subtitle}</p>
        {event.location && (
          <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{event.location}</span>
          </p>
        )}
      </div>
      <div className="shrink-0 text-left sm:text-right">
        <p className="text-sm font-semibold">{formatEventDate(timestamp)}</p>
        <p className="text-xs text-muted-foreground">{format(timestamp, "h:mm a")}</p>
      </div>
    </Link>
  );
}
function QuickContacts({
  isChildView,
  activeParent,
  primaryEmergencyContact,
  familyMembers,
}: {
  isChildView: boolean;
  activeParent: Record<string, any>;
  primaryEmergencyContact: Record<string, any> | null;
  familyMembers: Array<Record<string, any>>;
}) {
  const contacts = isChildView
    ? [
        {
          id: activeParent.id,
          name: activeParent.full_name || "Care recipient",
          subtitle: "Care recipient",
          phone: activeParent.phone,
          email: activeParent.email,
        },
      ]
    : [
        ...(primaryEmergencyContact
          ? [
              {
                id: `emergency-${primaryEmergencyContact.id}`,
                name: primaryEmergencyContact.name,
                subtitle: primaryEmergencyContact.relationship
                  ? `Primary · ${primaryEmergencyContact.relationship}`
                  : "Primary emergency contact",
                phone: primaryEmergencyContact.phone,
                email: primaryEmergencyContact.email,
              },
            ]
          : []),
        ...familyMembers.slice(0, 2).map((member) => ({
          id: `family-${member.id}`,
          name: member.full_name || "Family member",
          subtitle: "Linked family member",
          phone: member.phone,
          email: member.email,
        })),
      ];
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold">Quick Contacts</h3>
        <Phone className="size-5 text-primary" />
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
          No emergency or family contact is available.
          <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-brand-accent">
            <Link to="/emergency-contacts">Add emergency contact</Link>
            <Link to="/family">Link family</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {contacts.map((contact) => (
            <div key={contact.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
              <p className="font-semibold">{contact.name}</p>
              <p className="text-[11px] text-muted-foreground">{contact.subtitle}</p>
              <ContactActions name={contact.name} phone={contact.phone} email={contact.email} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function ContactActions({
  name,
  phone,
  email,
}: {
  name: string;
  phone: string | null | undefined;
  email: string | null | undefined;
}) {
  const cleanedPhone = cleanPhone(phone);
  const whatsappPhone = cleanedPhone.replace(/\D/g, "");
  if (!cleanedPhone && !email) {
    return <p className="mt-2 text-xs italic text-muted-foreground">No contact method saved.</p>;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {cleanedPhone && (
        <>
          <a
            href={`tel:${cleanedPhone}`}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground"
            aria-label={`Call ${name}`}
          >
            <Phone className="size-3" /> Call
          </a>
          <a
            href={`sms:${cleanedPhone}?body=${encodeURIComponent("Hi, just checking in.")}`}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white"
            aria-label={`Message ${name}`}
          >
            <MessageSquare className="size-3" /> SMS
          </a>
          {whatsappPhone && (
            <a
              href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent("Hi, just checking in.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-[11px] font-semibold text-white"
              aria-label={`WhatsApp ${name}`}
            >
              <MessageCircle className="size-3" /> WhatsApp
            </a>
          )}
        </>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold"
          aria-label={`Email ${name}`}
        >
          <Mail className="size-3" /> Email
        </a>
      )}
    </div>
  );
}
function UpcomingCaregiver({
  booking,
  now,
}: {
  booking: CaregiverBooking | null | undefined;
  now: Date;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold">Caregiver Visit</h3>
        <Stethoscope className="size-5 text-primary" />
      </div>

      {booking ? (
        <>
          <div className="flex items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary">
              {(booking.caregiver_name || booking.caregiver_type || "C").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {booking.caregiver_name || humanize(booking.caregiver_type || "Caregiver")}
              </p>
              <p className="text-xs capitalize text-muted-foreground">
                {humanize(booking.caregiver_type || "Caregiver service")}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-muted/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Schedule
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                {humanize(booking.status)}
              </span>
            </div>
            <p className="mt-1 font-bold">
              {format(new Date(booking.scheduled_at), "EEE, MMM d · h:mm a")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {booking.status === "in_progress"
                ? "Service is currently in progress."
                : toTimestamp(booking.scheduled_at) < now.getTime()
                  ? "This active booking is past its scheduled time."
                  : formatDistanceToNow(new Date(booking.scheduled_at), {
                      addSuffix: true,
                    })}
              {booking.duration_hours ? ` · ${booking.duration_hours} hr` : ""}
            </p>
            {booking.notes && (
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{booking.notes}</p>
            )}
          </div>

          <Link
            to="/caregivers"
            className="mt-4 block w-full rounded-xl bg-foreground py-3 text-center text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            View details
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">No active caregiver visit is scheduled.</p>
          <Link
            to="/caregivers"
            className="mt-4 block w-full rounded-xl bg-foreground py-3 text-center text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Open Caregivers
          </Link>
        </>
      )}
    </section>
  );
}
function RecentReports({
  records,
  loading,
  onOpen,
}: {
  records: HealthRecord[];
  loading: boolean;
  onOpen: (record: HealthRecord) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Recent Health Records
        </h3>
        <Link to="/records" className="text-xs font-semibold text-primary hover:underline">
          View all
        </Link>
      </div>

      {loading ? (
        <div className="grid min-h-24 place-items-center">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
          No health records have been added yet.
        </div>
      ) : (
        <div className="space-y-1">
          {records.map((record) => {
            const hasFile = Boolean(record.file_path || record.file_url);
            return (
              <button
                key={record.id}
                type="button"
                onClick={() => onOpen(record)}
                disabled={!hasFile}
                className="flex w-full items-center justify-between gap-2 rounded-lg border-b border-border px-2 py-2 text-left transition-colors last:border-0 hover:bg-muted/60 disabled:cursor-default disabled:opacity-70"
                title={hasFile ? "Open attached file" : "No file attached"}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{record.title}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {record.doctor_name || humanize(record.category || "Health record")}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {formatLocalDate(record.record_date)}
                  </span>
                  {hasFile && <ExternalLink className="size-3.5 text-muted-foreground" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
function SosBanner({
  alert,
  parentName,
  isChildView,
  acknowledgePending,
  resolvePending,
  resendPending,
  cooldown,
  onAcknowledge,
  onResolve,
  onResend,
}: {
  alert: ActiveSosAlert;
  parentName: string | null;
  isChildView: boolean;
  acknowledgePending: boolean;
  resolvePending: boolean;
  resendPending: boolean;
  cooldown: number;
  onAcknowledge: () => void;
  onResolve: () => void;
  onResend: () => void;
}) {
  const acknowledged = alert.status === "acknowledged";
  return (
    <div
      className={`mb-6 flex flex-col gap-4 rounded-3xl border-2 p-5 shadow-lg sm:flex-row sm:items-center sm:justify-between ${
        acknowledged
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-red-200 bg-red-50 text-red-950"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`grid size-12 shrink-0 place-items-center rounded-2xl ${acknowledged ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}
        >
          <Siren className="size-6" />
        </div>
        <div>
          <h3 className="font-bold">
            {isChildView
              ? `${parentName || "Your family member"} requested emergency assistance`
              : acknowledged
                ? "Your SOS has been acknowledged"
                : "Your SOS alert is active"}
          </h3>
          <p className="mt-0.5 text-sm opacity-80">
            Activated {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
          </p>
          {alert.address && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium opacity-80">
              <MapPin className="size-4 shrink-0" />
              {alert.address}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link to="/sos">
          <Button type="button" size="sm" variant="outline" className="rounded-xl bg-white">
            Open details
          </Button>
        </Link>
        {isChildView && alert.status === "active" && (
          <Button
            type="button"
            size="sm"
            className="rounded-xl bg-amber-500 text-white hover:bg-amber-600"
            disabled={acknowledgePending}
            onClick={onAcknowledge}
          >
            {acknowledgePending && <Loader2 className="mr-1 size-4 animate-spin" />}
            Acknowledge
          </Button>
        )}
        {!isChildView && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl bg-white"
            disabled={resendPending || cooldown > 0}
            onClick={onResend}
          >
            {resendPending && <Loader2 className="mr-1 size-4 animate-spin" />}
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={resolvePending}
          onClick={onResolve}
        >
          {resolvePending && <Loader2 className="mr-1 size-4 animate-spin" />}
          Resolve
        </Button>
      </div>
    </div>
  );
}
function formatVitalValue(vital: VitalRow) {
  if (vital.vital_type === "blood_pressure") {
    return `${vital.value}/${vital.value_secondary ?? "—"}`;
  }
  return String(vital.value);
}
function defaultVitalUnit(label: string) {
  switch (label) {
    case "Blood Pressure":
      return "mmHg";
    case "Blood Sugar":
      return "mg/dL";
    case "Heart Rate":
      return "bpm";
    case "Oxygen":
      return "%";
    default:
      return "";
  }
}
function getGreeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
function toTimestamp(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}
function medicineSchedule(date: string, time: string) {
  const parsed = new Date(`${date}T${(time || "00:00").slice(0, 5)}:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
function localDateTime(date: string | null | undefined, time: string | null | undefined) {
  if (!date) return "";
  return `${date}T${(time || "00:00").slice(0, 5)}:00`;
}
function formatEventDate(date: Date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE, MMM d");
}
function formatLocalDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "MMM d");
}
function formatDoctorName(name: string) {
  const trimmed = name.trim();
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}
function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function cleanPhone(value: string | null | undefined) {
  return value?.replace(/[^+\d]/g, "") ?? "";
}
