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
      <div className="space-y-6 pb-10">
        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)]">
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-7">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-[#e2c4c0] bg-[#f9e9e7] text-[#9f4742]">
                  Rule-based safety monitoring
                </Badge>
                {isChildView && <Badge variant="secondary">Family view</Badge>}
              </div>
              <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#122f35] sm:text-4xl">AI Emergency Detection</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#667d82] sm:text-base">
                Automatically checks missed medicines, daily wellbeing check-ins, and activity inside
                ElderCare Connect for {activeParent?.full_name || "the selected care recipient"}.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline" className="h-11 rounded-xl border-[#d7e3df] bg-white px-5 font-semibold text-[#49666b] hover:bg-[#f3f8f6]">
                <Link to="/settings">
                  <Settings className="mr-2 size-4" /> Detection Settings
                </Link>
              </Button>
              <Button
                onClick={() => runDetection.mutate()}
                disabled={runDetection.isPending || !settings.emergency_detection_enabled}
                className="h-11 rounded-xl bg-[#0d6665] px-5 font-semibold text-white shadow-[0_14px_30px_-18px_rgba(13,102,101,0.9)] hover:bg-[#0a5958]"
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
          <div className="grid border-t border-[#e2ece9] bg-[#f7faf9] sm:grid-cols-3">
            <div className="border-b border-[#e2ebe8] px-5 py-4 sm:border-b-0 sm:border-r">
              <p className="text-xs font-bold uppercase tracking-[0.11em] text-[#7b8f93]">Monitoring</p>
              <p className="mt-1 text-sm font-semibold text-[#176f69]">{settings.emergency_detection_enabled ? "Active" : "Paused"}</p>
            </div>
            <div className="border-b border-[#e2ebe8] px-5 py-4 sm:border-b-0 sm:border-r">
              <p className="text-xs font-bold uppercase tracking-[0.11em] text-[#7b8f93]">Open alerts</p>
              <p className="mt-1 text-xl font-bold text-[#17343a]">{openAlerts.length}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.11em] text-[#7b8f93]">Check interval</p>
              <p className="mt-1 text-sm font-semibold text-[#35565c]">Every 15 minutes</p>
            </div>
          </div>
        </section>

        <Alert className="rounded-2xl border-[#cedfe4] bg-[#f2f7f8]">
          <Info className="size-4 text-[#4f7280]" />
          <AlertTitle className="text-[#294b53]">What “activity” means</AlertTitle>
          <AlertDescription className="text-[#60777d]">
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

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
          <div className="flex flex-col gap-4 border-b border-[#e3ece9] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">Care alert history</h2>
              <p className="mt-1 text-sm text-[#72868a]">
                Alerts automatically resolve when the underlying condition is cleared.
              </p>
            </div>
            <div className="flex rounded-xl border border-[#dfe8e5] bg-[#f7faf9] p-1">
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
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${filter === key
                      ? "bg-white text-[#1d4b50] shadow-sm"
                      : "text-[#71868a] hover:text-[#1d4b50]"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {alertsQuery.isLoading ? (
            <div className="flex items-center justify-center p-12 text-[#71868a]">
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
              <div className="grid size-14 place-items-center rounded-2xl bg-[#e5f2ed] text-[#19705f]">
                <CheckCircle2 className="size-7" />
              </div>
              <div>
                <h3 className="font-bold text-[#1c3b41]">
                  {filter === "resolved" ? "No resolved alerts yet" : "No open care alerts"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Scheduled checks continue every 15 minutes while detection is enabled.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#e7eeec]">
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
        <DialogContent className="rounded-[1.5rem] border-[#dce7e3] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-[-0.025em] text-[#17343a]">Resolve care alert</DialogTitle>
            <DialogDescription className="leading-6 text-[#6f8387]">
              Confirm that the situation has been checked. The alert may also resolve automatically
              when the medicine is marked taken, the wellbeing check is submitted, or app activity
              resumes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="resolution-note">Resolution note (optional)</Label>
            <Textarea
              id="resolution-note"
              className="rounded-xl border-[#d8e4e0]"
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Example: Spoke with the care recipient and confirmed they are safe."
            />
            <p className="text-right text-xs text-[#7b8e92]">{resolutionNote.length}/500</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11 rounded-xl border-[#d6e2de]" onClick={() => setResolvingAlert(null)}>
              Cancel
            </Button>
            <Button
              className="h-11 rounded-xl bg-[#0d6665] text-white hover:bg-[#0a5958]"
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
    <article className="px-5 py-5 transition-colors hover:bg-[#fbfdfc] sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className={`shrink-0 rounded-xl p-2.5 ${config.iconClass}`}>{config.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-[#1c3b41]">{alert.title}</h3>
            <StatusBadge status={alert.status} />
            <Badge
              variant="outline"
              className={
                alert.severity === "high"
                  ? "border-[#e2c4c0] bg-[#f9e9e7] text-[#9f4742]"
                  : "border-[#e4d0bd] bg-[#faf2e9] text-[#906139]"
              }
            >
              {alert.severity === "high" ? "High priority" : "Warning"}
            </Badge>
          </div>

          <p className="mt-2 text-sm leading-6 text-[#587075]">{alert.message}</p>

          {recommendedAction && (
            <div className="mt-3 rounded-xl border border-[#d3e2e5] bg-[#f3f7f8] px-4 py-3 text-sm leading-6 text-[#48636a]">
              <span className="font-semibold">Recommended action: </span>
              {recommendedAction}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#7b8e92]">
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
            <p className="mt-3 rounded-xl border border-[#dfe8e5] bg-[#f7faf9] px-4 py-3 text-sm text-[#526b70]">
              <span className="font-semibold">Resolution: </span>
              {alert.resolution_note}
            </p>
          )}
        </div>

        {alert.status !== "resolved" && (
          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
            {alert.status === "active" && (
              <Button variant="outline" size="sm" className="rounded-xl border-[#d6e2de]" onClick={onAcknowledge} disabled={isPending}>
                <BellRing className="mr-2 size-4" /> Acknowledge
              </Button>
            )}
            <Button size="sm" className="rounded-xl bg-[#0d6665] text-white hover:bg-[#0a5958]" onClick={onResolve} disabled={isPending}>
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
          className="rounded-full border border-[#dfe8e5] bg-[#f6f9f8] px-2.5 py-1 text-[11px] font-semibold text-[#5f777b]"
        >
          <span className="text-[#87999c]">{badge.label}: </span>
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
    red: "border-[#e4c8c4] bg-[#f9e9e7] text-[#a44f49]",
    amber: "border-[#e5d1bd] bg-[#faf2e9] text-[#95613a]",
    pink: "border-[#dfcfd4] bg-[#f6edef] text-[#825b68]",
    slate: "border-[#d4e0e3] bg-[#edf3f4] text-[#536f79]",
  }[tone];
  return (
    <div className="rounded-2xl border border-[#dce7e3] bg-white p-5 shadow-[0_16px_38px_-32px_rgba(16,49,54,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.11em] text-[#7b8f93]">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-[-0.04em] text-[#17343a]">{value}</p>
          <p className="mt-1 text-xs leading-5 text-[#768a8e]">{detail}</p>
        </div>
        <div className={`rounded-xl border p-2.5 ${classes}`}>{icon}</div>
      </div>
    </div>
  );
}
function StatusBadge({ status }: { status: AlertStatus }) {
  if (status === "resolved") {
    return <Badge className="border-0 bg-[#e5f2ed] text-[#19705f] hover:bg-[#e5f2ed]">Resolved</Badge>;
  }
  if (status === "acknowledged") {
    return <Badge className="border-0 bg-[#e7eef5] text-[#4f6f8d] hover:bg-[#e7eef5]">Acknowledged</Badge>;
  }
  return <Badge className="border-0 bg-[#f7e7e5] text-[#a74d48] hover:bg-[#f7e7e5]">Active</Badge>;
}
function getAlertConfig(type: AlertType) {
  switch (type) {
    case "missed_medicine":
      return {
        icon: <Pill className="size-5" />,
        iconClass: "bg-[#f5eadf] text-[#9c6637]",
      };
    case "missed_checkin":
      return {
        icon: <HeartPulse className="size-5" />,
        iconClass: "bg-[#f4e9ec] text-[#8d5b6c]",
      };
    case "no_app_activity":
      return {
        icon: <Activity className="size-5" />,
        iconClass: "bg-[#f7e7e5] text-[#a74d48]",
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