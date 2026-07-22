import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Info,
  Loader2,
  Pill,
  RefreshCw,
  Settings,
  ShieldAlert,
  Siren,
  TriangleAlert,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActiveParent } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
export const Route = createFileRoute("/_authenticated/emergency-detection")({
  ssr: false,
  component: EmergencyDetectionPage,
});
type AlertType = "missed_medicine" | "missed_checkin" | "no_app_activity";
type AlertStatus = "active" | "acknowledged" | "resolved";
type AlertSeverity = "info" | "warning" | "high";
type FilterKey = "open" | "all" | "resolved";
type CareAlert = {
  id: string;
  parent_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  source_key: string;
  metadata: Record<string, unknown>;
  status: AlertStatus;
  detected_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};
type DetectionSettings = {
  emergency_detection_enabled: boolean;
  detect_missed_medicine: boolean;
  detect_missed_checkin: boolean;
  detect_no_app_activity: boolean;
  wellbeing_checkin_cutoff: string;
  no_app_activity_hours: number;
};
const EMPTY_ALERTS: CareAlert[] = [];
const DEFAULT_SETTINGS: DetectionSettings = {
  emergency_detection_enabled: true,
  detect_missed_medicine: true,
  detect_missed_checkin: true,
  detect_no_app_activity: true,
  wellbeing_checkin_cutoff: "20:00",
  no_app_activity_hours: 24,
};
function normalizeSettings(value: Record<string, unknown> | null): DetectionSettings {
  return {
    emergency_detection_enabled: value?.emergency_detection_enabled !== false,
    detect_missed_medicine: value?.detect_missed_medicine !== false,
    detect_missed_checkin: value?.detect_missed_checkin !== false,
    detect_no_app_activity: value?.detect_no_app_activity !== false,
    wellbeing_checkin_cutoff:
      typeof value?.wellbeing_checkin_cutoff === "string"
        ? value.wellbeing_checkin_cutoff.slice(0, 5)
        : DEFAULT_SETTINGS.wellbeing_checkin_cutoff,
    no_app_activity_hours: Number.isFinite(Number(value?.no_app_activity_hours))
      ? Math.min(168, Math.max(6, Number(value?.no_app_activity_hours)))
      : DEFAULT_SETTINGS.no_app_activity_hours,
  };
}
function EmergencyDetectionPage() {
  const { activeParent, activeParentId, isChildView, isLoading } = useActiveParent();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("open");
  const [resolvingAlert, setResolvingAlert] = useState<CareAlert | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const alertsQuery = useQuery({
    queryKey: ["care-alerts", activeParentId],
    enabled: Boolean(activeParentId),
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("care_alerts")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("detected_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CareAlert[];
    },
  });
  const settingsQuery = useQuery({
    queryKey: ["emergency-detection-settings", activeParentId],
    enabled: Boolean(activeParentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("elder_settings")
        .select(
          "emergency_detection_enabled,detect_missed_medicine,detect_missed_checkin,detect_no_app_activity,wellbeing_checkin_cutoff,no_app_activity_hours",
        )
        .eq("parent_id", activeParentId!)
        .maybeSingle();
      if (error) throw error;
      return normalizeSettings((data ?? null) as Record<string, unknown> | null);
    },
  });
  useEffect(() => {
    if (!activeParentId) return;
    const channel = supabase
      .channel(`care-alerts-${activeParentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "care_alerts",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["care-alerts", activeParentId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeParentId, queryClient]);
  const runDetection = useMutation({
    mutationFn: async () => {
      if (!activeParentId) throw new Error("No care-recipient account is selected.");
      const { data, error } = await supabase.rpc("detect_care_issues_for_parent", {
        _parent_id: activeParentId,
      });
      if (error) throw error;
      return (
        data?.[0] ?? {
          missed_medicine_alerts: 0,
          no_checkin_alerts: 0,
          no_activity_alerts: 0,
        }
      );
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["care-alerts", activeParentId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["notifUnread"] }),
      ]);
      const total =
        result.missed_medicine_alerts + result.no_checkin_alerts + result.no_activity_alerts;
      if (total === 0) {
        toast.success("Detection completed. No new care alerts were found.");
      } else {
        toast.warning(`${total} new care alert${total === 1 ? "" : "s"} detected.`);
      }
    },
    onError: (error: Error) => toast.error(error.message || "Emergency detection failed."),
  });
  const updateStatus = useMutation({
    mutationFn: async ({
      alertId,
      status,
      note,
    }: {
      alertId: string;
      status: "acknowledged" | "resolved";
      note?: string;
    }) => {
      const { error } = await supabase.rpc("set_care_alert_status", {
        _alert_id: alertId,
        _status: status,
        _resolution_note: note?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["care-alerts", activeParentId] });
      toast.success(
        variables.status === "resolved" ? "Care alert resolved." : "Care alert acknowledged.",
      );
      setResolvingAlert(null);
      setResolutionNote("");
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the alert."),
  });
  const alerts = alertsQuery.data ?? EMPTY_ALERTS;
  const openAlerts = alerts.filter((alert) => alert.status !== "resolved");
  const resolvedAlerts = alerts.filter((alert) => alert.status === "resolved");
  const visibleAlerts = useMemo(() => {
    if (filter === "open") return openAlerts;
    if (filter === "resolved") return resolvedAlerts;
    return alerts;
  }, [alerts, filter, openAlerts, resolvedAlerts]);
  const counts = useMemo(
    () => ({
      high: openAlerts.filter((alert) => alert.severity === "high").length,
      medicine: openAlerts.filter((alert) => alert.alert_type === "missed_medicine").length,
      checkin: openAlerts.filter((alert) => alert.alert_type === "missed_checkin").length,
      activity: openAlerts.filter((alert) => alert.alert_type === "no_app_activity").length,
    }),
    [openAlerts],
  );
  const settings = settingsQuery.data ?? DEFAULT_SETTINGS;
  if (isLoading) {
    return (
      <AppShell>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Loading emergency detection…
        </div>
      </AppShell>
    );
  }
  if (!activeParentId) {
    return (
      <AppShell>
        <Alert>
          <ShieldAlert className="size-4" />
          <AlertTitle>No care-recipient account selected</AlertTitle>
          <AlertDescription>
            Connect or select a care-recipient account before viewing automatic care alerts.
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                Rule-based safety monitoring
              </Badge>
              {isChildView && <Badge variant="secondary">Family view</Badge>}
            </div>
            <h1 className="font-display text-4xl font-bold italic">AI Emergency Detection</h1>
            <p className="mt-1 max-w-3xl text-muted-foreground">
              Automatically checks missed medicines, daily wellbeing check-ins, and activity inside
              ElderCare Connect for {activeParent?.full_name || "the selected care recipient"}.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/settings">
                <Settings className="mr-2 size-4" /> Detection Settings
              </Link>
            </Button>
            <Button
              onClick={() => runDetection.mutate()}
              disabled={runDetection.isPending || !settings.emergency_detection_enabled}
            >
              {runDetection.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Run Detection Now
            </Button>
          </div>
        </div>

        <Alert className="border-blue-200 bg-blue-50/70">
          <Info className="size-4 text-blue-700" />
          <AlertTitle className="text-blue-900">What “activity” means</AlertTitle>
          <AlertDescription className="text-blue-800">
            The system measures only activity inside ElderCare Connect. A website cannot inspect
            calls, WhatsApp, screen unlocks, movement, or activity in other phone applications.
          </AlertDescription>
        </Alert>

        {!settings.emergency_detection_enabled && (
          <Alert variant="destructive">
            <ShieldAlert className="size-4" />
            <AlertTitle>Emergency detection is disabled</AlertTitle>
            <AlertDescription>
              Automatic checks are paused. Enable them from Settings to resume scheduled detection.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={<Siren className="size-5" />}
            label="Open alerts"
            value={openAlerts.length}
            detail={`${counts.high} high priority`}
            tone="red"
          />
          <SummaryCard
            icon={<Pill className="size-5" />}
            label="Medicine"
            value={counts.medicine}
            detail={settings.detect_missed_medicine ? "Detection enabled" : "Detection disabled"}
            tone="amber"
          />
          <SummaryCard
            icon={<HeartPulse className="size-5" />}
            label="Wellbeing"
            value={counts.checkin}
            detail={`Cutoff ${formatTime(settings.wellbeing_checkin_cutoff)}`}
            tone="pink"
          />
          <SummaryCard
            icon={<Activity className="size-5" />}
            label="App activity"
            value={counts.activity}
            detail={`${settings.no_app_activity_hours}-hour threshold`}
            tone="slate"
          />
        </div>

        <section className="rounded-2xl border bg-card">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Care Alert History</h2>
              <p className="text-sm text-muted-foreground">
                Alerts automatically resolve when the underlying condition is cleared.
              </p>
            </div>
            <div className="flex rounded-lg border bg-muted/30 p-1">
              {(
                [
                  ["open", `Open (${openAlerts.length})`],
                  ["all", `All (${alerts.length})`],
                  ["resolved", `Resolved (${resolvedAlerts.length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    filter === key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {alertsQuery.isLoading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" /> Loading care alerts…
            </div>
          ) : alertsQuery.isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <TriangleAlert className="size-4" />
                <AlertTitle>Care alerts could not be loaded</AlertTitle>
                <AlertDescription className="mt-2">
                  {(alertsQuery.error as Error).message}
                </AlertDescription>
              </Alert>
            </div>
          ) : visibleAlerts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <div className="rounded-full bg-emerald-100 p-3 text-emerald-700">
                <CheckCircle2 className="size-7" />
              </div>
              <div>
                <h3 className="font-semibold">
                  {filter === "resolved" ? "No resolved alerts yet" : "No open care alerts"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Scheduled checks continue every 15 minutes while detection is enabled.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {visibleAlerts.map((alert) => (
                <CareAlertRow
                  key={alert.id}
                  alert={alert}
                  isPending={updateStatus.isPending}
                  onAcknowledge={() =>
                    updateStatus.mutate({ alertId: alert.id, status: "acknowledged" })
                  }
                  onResolve={() => {
                    setResolvingAlert(alert);
                    setResolutionNote("");
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={Boolean(resolvingAlert)}
        onOpenChange={(open) => {
          if (!open) {
            setResolvingAlert(null);
            setResolutionNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve care alert</DialogTitle>
            <DialogDescription>
              Confirm that the situation has been checked. The alert may also resolve automatically
              when the medicine is marked taken, the wellbeing check is submitted, or app activity
              resumes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="resolution-note">Resolution note (optional)</Label>
            <Textarea
              id="resolution-note"
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Example: Spoke with the care recipient and confirmed they are safe."
            />
            <p className="text-right text-xs text-muted-foreground">{resolutionNote.length}/500</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolvingAlert(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!resolvingAlert) return;
                updateStatus.mutate({
                  alertId: resolvingAlert.id,
                  status: "resolved",
                  note: resolutionNote,
                });
              }}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
function CareAlertRow({
  alert,
  isPending,
  onAcknowledge,
  onResolve,
}: {
  alert: CareAlert;
  isPending: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
}) {
  const config = getAlertConfig(alert.alert_type);
  const recommendedAction = asString(alert.metadata.recommended_action);
  return (
    <article className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className={`shrink-0 rounded-xl p-2.5 ${config.iconClass}`}>{config.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{alert.title}</h3>
            <StatusBadge status={alert.status} />
            <Badge
              variant="outline"
              className={
                alert.severity === "high"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }
            >
              {alert.severity === "high" ? "High priority" : "Warning"}
            </Badge>
          </div>

          <p className="mt-1.5 text-sm text-foreground/80">{alert.message}</p>

          {recommendedAction && (
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm text-blue-900">
              <span className="font-semibold">Recommended action: </span>
              {recommendedAction}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3.5" />
              Detected {formatDistanceToNow(new Date(alert.detected_at), { addSuffix: true })}
            </span>
            <span>{format(new Date(alert.detected_at), "MMM d, yyyy · h:mm a")}</span>
            {alert.resolved_at && (
              <span>Resolved {format(new Date(alert.resolved_at), "MMM d · h:mm a")}</span>
            )}
          </div>

          <AlertMetadata alert={alert} />

          {alert.resolution_note && (
            <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="font-semibold">Resolution: </span>
              {alert.resolution_note}
            </p>
          )}
        </div>

        {alert.status !== "resolved" && (
          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
            {alert.status === "active" && (
              <Button variant="outline" size="sm" onClick={onAcknowledge} disabled={isPending}>
                <BellRing className="mr-2 size-4" /> Acknowledge
              </Button>
            )}
            <Button size="sm" onClick={onResolve} disabled={isPending}>
              <Check className="mr-2 size-4" /> Resolve
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
function AlertMetadata({ alert }: { alert: CareAlert }) {
  const badges: Array<{
    label: string;
    value: string;
  }> = [];
  if (alert.alert_type === "missed_medicine") {
    const medicineName = asString(alert.metadata.medicine_name);
    const scheduleTime = asString(alert.metadata.schedule_time);
    const checkDate = asString(alert.metadata.check_date);
    if (medicineName) badges.push({ label: "Medicine", value: medicineName });
    if (scheduleTime) badges.push({ label: "Due", value: formatTime(scheduleTime) });
    if (checkDate) badges.push({ label: "Date", value: checkDate });
  }
  if (alert.alert_type === "missed_checkin") {
    const checkDate = asString(alert.metadata.check_date);
    const cutoff = asString(alert.metadata.cutoff_time);
    if (checkDate) badges.push({ label: "Date", value: checkDate });
    if (cutoff) badges.push({ label: "Cutoff", value: formatTime(cutoff) });
  }
  if (alert.alert_type === "no_app_activity") {
    const lastSignal = asString(alert.metadata.last_signal_at);
    const threshold = Number(alert.metadata.threshold_hours);
    if (lastSignal) {
      badges.push({
        label: "Last signal",
        value: format(new Date(lastSignal), "MMM d · h:mm a"),
      });
    }
    if (Number.isFinite(threshold)) badges.push({ label: "Threshold", value: `${threshold}h` });
  }
  if (badges.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span
          key={badge.label}
          className="rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
        >
          <span className="text-foreground/50">{badge.label}: </span>
          {badge.value}
        </span>
      ))}
    </div>
  );
}
function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  tone: "red" | "amber" | "pink" | "slate";
}) {
  const classes = {
    red: "bg-red-50 text-red-700 border-red-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    pink: "bg-pink-50 text-pink-700 border-pink-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  }[tone];
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className={`rounded-xl border p-2.5 ${classes}`}>{icon}</div>
      </div>
    </div>
  );
}
function StatusBadge({ status }: { status: AlertStatus }) {
  if (status === "resolved") {
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Resolved</Badge>;
  }
  if (status === "acknowledged") {
    return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Acknowledged</Badge>;
  }
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Active</Badge>;
}
function getAlertConfig(type: AlertType) {
  switch (type) {
    case "missed_medicine":
      return {
        icon: <Pill className="size-5" />,
        iconClass: "bg-amber-100 text-amber-700",
      };
    case "missed_checkin":
      return {
        icon: <HeartPulse className="size-5" />,
        iconClass: "bg-pink-100 text-pink-700",
      };
    case "no_app_activity":
      return {
        icon: <Activity className="size-5" />,
        iconClass: "bg-red-100 text-red-700",
      };
  }
}
function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
function formatTime(value: string) {
  const clean = value.slice(0, 5);
  const [hours, minutes] = clean.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return clean;
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
