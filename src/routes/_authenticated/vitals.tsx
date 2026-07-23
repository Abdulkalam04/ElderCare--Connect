import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { format, subDays } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Check,
  Droplets,
  Gauge,
  HeartPulse,
  Plus,
  Scale,
  ShieldCheck,
  SkipForward,
  Thermometer,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { DateTimeInput } from "@/components/ui/datetime-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveParent, useCurrentUser } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/vitals")({
  ssr: false,
  component: VitalsPage,
});

type VitalType =
  | "blood_pressure"
  | "blood_sugar"
  | "heart_rate"
  | "weight"
  | "oxygen_saturation"
  | "temperature";

type VitalRow = {
  id: string;
  parent_id: string;
  vital_type: VitalType;
  value: number;
  value_secondary: number | null;
  unit: string;
  recorded_at: string;
  notes: string | null;
  is_abnormal: boolean;
  created_by: string | null;
  created_at: string;
};

type VitalInput = {
  vital_type: VitalType;
  value: number;
  value_secondary: number | null;
  recorded_at: string;
  notes: string;
};

type StepStatus = "pending" | "saved" | "skipped";

type VitalMeta = {
  label: string;
  shortLabel: string;
  unit: string;
  icon: LucideIcon;
  hasSecondary?: boolean;
  placeholder: string;
  supportingText: string;
  normalRange: string;
  iconClass: string;
  iconBackground: string;
};

const VITAL_SEQUENCE: VitalType[] = [
  "blood_pressure",
  "blood_sugar",
  "heart_rate",
  "weight",
  "oxygen_saturation",
  "temperature",
];

const VITAL_META: Record<VitalType, VitalMeta> = {
  blood_pressure: {
    label: "Blood Pressure",
    shortLabel: "Blood pressure",
    unit: "mmHg",
    icon: Gauge,
    hasSecondary: true,
    placeholder: "Systolic",
    supportingText: "Systolic and diastolic pressure",
    normalRange: "Typical target: below 140/90",
    iconClass: "text-[#1d6f6a]",
    iconBackground: "bg-[#e4f1ed]",
  },
  blood_sugar: {
    label: "Blood Sugar",
    shortLabel: "Blood sugar",
    unit: "mg/dL",
    icon: Droplets,
    placeholder: "e.g. 110",
    supportingText: "Glucose reading",
    normalRange: "Alert below 70 or at/above 180",
    iconClass: "text-[#9c6637]",
    iconBackground: "bg-[#f5eadf]",
  },
  heart_rate: {
    label: "Heart Rate",
    shortLabel: "Heart rate",
    unit: "bpm",
    icon: HeartPulse,
    placeholder: "e.g. 72",
    supportingText: "Resting pulse",
    normalRange: "Alert below 50 or above 120",
    iconClass: "text-[#ad5555]",
    iconBackground: "bg-[#f7e9e8]",
  },
  weight: {
    label: "Weight",
    shortLabel: "Weight",
    unit: "kg",
    icon: Scale,
    placeholder: "e.g. 68",
    supportingText: "Body weight",
    normalRange: "Track changes over time",
    iconClass: "text-[#516a89]",
    iconBackground: "bg-[#e9eef5]",
  },
  oxygen_saturation: {
    label: "Oxygen Saturation",
    shortLabel: "Oxygen",
    unit: "%",
    icon: Activity,
    placeholder: "e.g. 98",
    supportingText: "SpO2 oxygen level",
    normalRange: "Alert below 95%",
    iconClass: "text-[#426f94]",
    iconBackground: "bg-[#e7f0f6]",
  },
  temperature: {
    label: "Temperature",
    shortLabel: "Temperature",
    unit: "°C",
    icon: Thermometer,
    placeholder: "e.g. 36.7",
    supportingText: "Body temperature",
    normalRange: "Alert below 35°C or at/above 38°C",
    iconClass: "text-[#a35c3a]",
    iconBackground: "bg-[#f7e9df]",
  },
};

function createInitialStepStatus(): Record<VitalType, StepStatus> {
  return {
    blood_pressure: "pending",
    blood_sugar: "pending",
    heart_rate: "pending",
    weight: "pending",
    oxygen_saturation: "pending",
    temperature: "pending",
  };
}

function checkAbnormal(
  type: VitalType,
  value: number,
  secondary?: number | null,
): {
  abnormal: boolean;
  reason?: string;
} {
  switch (type) {
    case "blood_pressure":
      if (value >= 140 || (secondary ?? 0) >= 90) {
        return { abnormal: true, reason: "High blood pressure (at least 140/90)" };
      }

      if (value < 90 || (secondary ?? 200) < 60) {
        return { abnormal: true, reason: "Low blood pressure (below 90/60)" };
      }

      return { abnormal: false };

    case "blood_sugar":
      if (value >= 180) {
        return {
          abnormal: true,
          reason: "High blood sugar (at least 180 mg/dL)",
        };
      }

      if (value < 70) {
        return {
          abnormal: true,
          reason: "Low blood sugar (below 70 mg/dL)",
        };
      }

      return { abnormal: false };

    case "heart_rate":
      if (value > 120) {
        return { abnormal: true, reason: "High heart rate (above 120 bpm)" };
      }

      if (value < 50) {
        return { abnormal: true, reason: "Low heart rate (below 50 bpm)" };
      }

      return { abnormal: false };

    case "oxygen_saturation":
      if (value < 95) {
        return { abnormal: true, reason: "Low oxygen saturation (below 95%)" };
      }

      return { abnormal: false };

    case "temperature":
      if (value >= 38) {
        return { abnormal: true, reason: "Fever (at least 38°C)" };
      }

      if (value < 35) {
        return { abnormal: true, reason: "Low body temperature (below 35°C)" };
      }

      return { abnormal: false };

    case "weight":
      return { abnormal: false };
  }
}

function formatValue(vital: VitalRow): string {
  if (vital.vital_type === "blood_pressure") {
    return `${vital.value}/${vital.value_secondary ?? "—"}`;
  }

  return String(vital.value);
}

function VitalsPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [filterType, setFilterType] = useState<VitalType | "all">("all");
  const [days, setDays] = useState<number>(30);
  const [open, setOpen] = useState(false);
  const [initialVitalType, setInitialVitalType] =
    useState<VitalType>("blood_pressure");

  const { data: vitals = [], isLoading } = useQuery({
    queryKey: ["vitals", activeParentId, days],
    enabled: Boolean(activeParentId),
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();

      const { data, error } = await (supabase as any)
        .from("vitals")
        .select("*")
        .eq("parent_id", activeParentId!)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as VitalRow[];
    },
  });

  const filteredVitals = useMemo(
    () =>
      filterType === "all"
        ? vitals
        : vitals.filter((vital) => vital.vital_type === filterType),
    [filterType, vitals],
  );

  const latestByType = useMemo(() => {
    const latest = new Map<VitalType, VitalRow>();

    const newestFirst = [...vitals].sort((first, second) => {
      const recordedDifference =
        new Date(second.recorded_at).getTime() -
        new Date(first.recorded_at).getTime();

      if (recordedDifference !== 0) {
        return recordedDifference;
      }

      return (
        new Date(second.created_at).getTime() -
        new Date(first.created_at).getTime()
      );
    });

    for (const vital of newestFirst) {
      if (!latest.has(vital.vital_type)) {
        latest.set(vital.vital_type, vital);
      }
    }

    return latest;
  }, [vitals]);

  const abnormalReadings = useMemo(
    () => vitals.filter((vital) => vital.is_abnormal).length,
    [vitals],
  );

  const readingsToday = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");

    return vitals.filter(
      (vital) => format(new Date(vital.recorded_at), "yyyy-MM-dd") === today,
    ).length;
  }, [vitals]);

  const lastRecordedAt = vitals[0]?.recorded_at ?? null;

  const trendData = useMemo(
    () =>
      [...filteredVitals]
        .reverse()
        .map((vital) => ({
          date: format(new Date(vital.recorded_at), "MMM d"),
          value: Number(vital.value),
          secondary:
            vital.value_secondary !== null
              ? Number(vital.value_secondary)
              : undefined,
        })),
    [filteredVitals],
  );

  const addMutation = useMutation({
    mutationFn: async (input: VitalInput) => {
      if (!activeParentId || !user) {
        throw new Error("The selected profile is not ready.");
      }

      const meta = VITAL_META[input.vital_type];
      const abnormalResult = checkAbnormal(
        input.vital_type,
        input.value,
        input.value_secondary,
      );

      const { error } = await (supabase as any).from("vitals").insert({
        parent_id: activeParentId,
        vital_type: input.vital_type,
        value: input.value,
        value_secondary: input.value_secondary,
        unit: meta.unit,
        recorded_at: input.recorded_at,
        notes: input.notes || null,
        is_abnormal: abnormalResult.abnormal,
        created_by: user.id,
      });

      if (error) {
        throw error;
      }

      return abnormalResult;
    },
    onSuccess: (abnormalResult, input) => {
      queryClient.invalidateQueries({ queryKey: ["vitals"] });

      if (abnormalResult.abnormal) {
        toast.warning(
          `${VITAL_META[input.vital_type].label}: ${abnormalResult.reason}`,
        );
      } else {
        toast.success(`${VITAL_META[input.vital_type].label} recorded`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message ?? "Failed to save the vital record");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView) {
        throw new Error("You do not have permission to delete this record.");
      }

      if (!activeParentId) {
        throw new Error("No parent profile is selected.");
      }

      const { data, error } = await (supabase as any)
        .from("vitals")
        .delete()
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id");

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error(
          "The record was not deleted. It may already be removed or blocked by permissions.",
        );
      }

      return id;
    },
    onSuccess: async (deletedId) => {
      queryClient.setQueriesData<VitalRow[]>(
        { queryKey: ["vitals", activeParentId] },
        (currentVitals) =>
          currentVitals?.filter((vital) => vital.id !== deletedId),
      );

      await queryClient.refetchQueries({
        queryKey: ["vitals", activeParentId],
        type: "active",
      });

      toast.success("Vital record deleted");
    },
    onError: (error: any) => {
      toast.error(error.message ?? "Failed to delete the vital record");
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error("You do not have permission to perform this action.");
      }

      if (!activeParentId) {
        throw new Error("No parent profile is selected.");
      }

      const { error } = await (supabase as any)
        .from("vitals")
        .delete()
        .eq("parent_id", activeParentId);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vitals"] });
      toast.success("All vital records cleared");
    },
    onError: (error: any) => {
      toast.error(error.message ?? "Failed to clear vital records");
    },
  });

  function openAddDialog(type: VitalType) {
    setInitialVitalType(type);
    setOpen(true);
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-10">
        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)]">
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-7">
            <div className="max-w-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#e8f3ef] px-3 py-1.5 text-xs font-bold text-[#176f69]">
                  <Activity className="size-3.5" />
                  Health monitoring
                </span>

                {isChildView && (
                  <span className="rounded-full border border-[#d8e5e1] bg-[#f7faf9] px-3 py-1.5 text-xs font-semibold text-[#647b80]">
                    Family view
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#122f35] sm:text-4xl">
                Vitals
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[#667d82] sm:text-base">
                Monitor key health readings for{" "}
                <span className="font-semibold text-[#294b50]">
                  {activeParent?.full_name ?? "the selected profile"}
                </span>
                , review trends and identify readings that may require attention.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {!isChildView && activeParentId && vitals.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl border-[#e0cbc7] bg-white px-5 font-semibold text-[#a44f49] hover:border-[#dcb9b4] hover:bg-[#fff6f5] hover:text-[#923f3a]"
                  disabled={clearAllMutation.isPending}
                  onClick={() => {
                    const confirmed = window.confirm(
                      "Delete every vital record for this profile? This action cannot be undone.",
                    );

                    if (confirmed) {
                      clearAllMutation.mutate();
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                  {clearAllMutation.isPending ? "Deleting…" : "Delete all"}
                </Button>
              )}

              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    disabled={!activeParentId}
                    className="h-11 rounded-xl bg-[#0d6665] px-5 font-semibold text-white shadow-[0_14px_30px_-18px_rgba(13,102,101,0.9)] hover:bg-[#0a5958]"
                    onClick={() => setInitialVitalType("blood_pressure")}
                  >
                    <Plus className="size-4" />
                    Add vital record
                  </Button>
                </DialogTrigger>

                <AddVitalDialog
                  key={`${open ? "open" : "closed"}-${initialVitalType}`}
                  initialType={initialVitalType}
                  onSubmit={async (input) => {
                    await addMutation.mutateAsync(input);
                  }}
                  pending={addMutation.isPending}
                  onComplete={() => setOpen(false)}
                />
              </Dialog>
            </div>
          </div>

          <div className="grid border-t border-[#e2ece9] bg-[#f7faf9] sm:grid-cols-2 lg:grid-cols-4">
            <OverviewMetric
              icon={Activity}
              label="Readings in range"
              value={String(Math.max(vitals.length - abnormalReadings, 0))}
              detail={`Out of ${vitals.length} recorded`}
              iconBackground="bg-[#e5f2ed]"
              iconClass="text-[#19705f]"
            />

            <OverviewMetric
              icon={AlertTriangle}
              label="Needs attention"
              value={String(abnormalReadings)}
              detail={
                abnormalReadings === 0
                  ? "No abnormal readings"
                  : "Review flagged results"
              }
              iconBackground={
                abnormalReadings > 0 ? "bg-[#f8e8e6]" : "bg-[#edf3f1]"
              }
              iconClass={
                abnormalReadings > 0 ? "text-[#ac504b]" : "text-[#5c777a]"
              }
            />

            <OverviewMetric
              icon={CalendarClock}
              label="Recorded today"
              value={String(readingsToday)}
              detail="New entries today"
              iconBackground="bg-[#e9eff5]"
              iconClass="text-[#506f8e]"
            />

            <OverviewMetric
              icon={TrendingUp}
              label="Latest update"
              value={
                lastRecordedAt
                  ? format(new Date(lastRecordedAt), "MMM d")
                  : "No data"
              }
              detail={
                lastRecordedAt
                  ? format(new Date(lastRecordedAt), "h:mm a")
                  : "Add the first reading"
              }
              iconBackground="bg-[#f5eadf]"
              iconClass="text-[#9b663a]"
              last
            />
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                Latest readings
              </h2>
              <p className="mt-1 text-sm text-[#71868a]">
                Select a card to add a new measurement for that vital.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-[#688085]">
              <ShieldCheck className="size-4 text-[#23756d]" />
              Thresholds are used only to flag readings for review.
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {VITAL_SEQUENCE.map((type) => {
              const meta = VITAL_META[type];
              const latest = latestByType.get(type);
              const Icon = meta.icon;

              return (
                <button
                  key={type}
                  type="button"
                  disabled={!activeParentId}
                  onClick={() => openAddDialog(type)}
                  className="group rounded-2xl border border-[#dce7e3] bg-white p-5 text-left shadow-[0_16px_38px_-32px_rgba(16,49,54,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-[#b8d1c9] hover:shadow-[0_22px_42px_-30px_rgba(16,49,54,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7774] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span
                      className={`grid size-11 shrink-0 place-items-center rounded-xl ${meta.iconBackground} ${meta.iconClass}`}
                    >
                      <Icon className="size-5" />
                    </span>

                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#758a8e] transition-colors group-hover:text-[#0d7774]">
                      Add reading
                      <Plus className="size-3.5" />
                    </span>
                  </div>

                  <div className="mt-5">
                    <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#829397]">
                      {meta.shortLabel}
                    </p>

                    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-3xl font-bold tracking-[-0.045em] text-[#18373d]">
                        {latest ? formatValue(latest) : "—"}
                      </span>

                      <span className="text-sm font-semibold text-[#7a8e92]">
                        {latest?.unit ?? meta.unit}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-[#708589]">
                      {latest
                        ? format(
                          new Date(latest.recorded_at),
                          "MMM d, yyyy · h:mm a",
                        )
                        : "No reading recorded yet"}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#e8efed] pt-4">
                    <p className="text-xs text-[#7b8f92]">{meta.normalRange}</p>

                    {latest &&
                      (latest.is_abnormal ? (
                        <Badge className="shrink-0 border-0 bg-[#f8e5e3] text-[#a74742] hover:bg-[#f8e5e3]">
                          <AlertTriangle className="mr-1 size-3" />
                          Review
                        </Badge>
                      ) : (
                        <Badge className="shrink-0 border-0 bg-[#e5f2ed] text-[#1b725f] hover:bg-[#e5f2ed]">
                          <Check className="mr-1 size-3" />
                          In range
                        </Badge>
                      ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
          <div className="flex flex-col gap-4 border-b border-[#e3ece9] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                Reading history
              </h2>

              <p className="mt-1 text-sm text-[#72868a]">
                Filter the history and review changes over time.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Select
                value={filterType}
                onValueChange={(value) =>
                  setFilterType(value as VitalType | "all")
                }
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-[#d8e4e0] bg-[#fbfdfc] sm:w-[210px]">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">All vital types</SelectItem>

                  {VITAL_SEQUENCE.map((type) => (
                    <SelectItem key={type} value={type}>
                      {VITAL_META[type].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={String(days)}
                onValueChange={(value) => setDays(Number(value))}
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-[#d8e4e0] bg-[#fbfdfc] sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {filterType !== "all" && filteredVitals.length > 0 && (
            <div className="border-b border-[#e5edea] bg-[#fbfdfc] p-5 sm:p-6">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-[#25474d]">
                    {VITAL_META[filterType].label} trend
                  </p>

                  <p className="mt-1 text-xs text-[#7b8d91]">
                    {filteredVitals.length} reading
                    {filteredVitals.length === 1 ? "" : "s"} in the selected
                    period
                  </p>
                </div>

                {filterType === "blood_pressure" && (
                  <div className="flex items-center gap-4 text-xs font-semibold text-[#667d81]">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-[#0d7774]" />
                      Systolic
                    </span>

                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-[#c47b43]" />
                      Diastolic
                    </span>
                  </div>
                )}
              </div>

              <div className="h-64 min-w-0 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trendData}
                    margin={{ top: 8, right: 10, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="#e4ece9"
                      strokeDasharray="4 4"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#71868a", fontSize: 11 }}
                      dy={10}
                    />

                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#71868a", fontSize: 11 }}
                      width={48}
                    />

                    <Tooltip
                      contentStyle={{
                        border: "1px solid #dbe6e2",
                        borderRadius: "12px",
                        boxShadow: "0 14px 35px -20px rgba(19, 50, 55, 0.45)",
                        backgroundColor: "#ffffff",
                      }}
                      labelStyle={{
                        color: "#1e4247",
                        fontWeight: 700,
                        marginBottom: 4,
                      }}
                    />

                    <Line
                      type="monotone"
                      dataKey="value"
                      name={
                        filterType === "blood_pressure"
                          ? "Systolic"
                          : VITAL_META[filterType].label
                      }
                      stroke="#0d7774"
                      strokeWidth={2.5}
                      dot={{
                        r: 3.5,
                        fill: "#ffffff",
                        stroke: "#0d7774",
                        strokeWidth: 2,
                      }}
                      activeDot={{
                        r: 5,
                        fill: "#0d7774",
                        stroke: "#ffffff",
                        strokeWidth: 2,
                      }}
                    />

                    {filterType === "blood_pressure" && (
                      <Line
                        type="monotone"
                        dataKey="secondary"
                        name="Diastolic"
                        stroke="#c47b43"
                        strokeWidth={2.5}
                        dot={{
                          r: 3.5,
                          fill: "#ffffff",
                          stroke: "#c47b43",
                          strokeWidth: 2,
                        }}
                        activeDot={{
                          r: 5,
                          fill: "#c47b43",
                          stroke: "#ffffff",
                          strokeWidth: 2,
                        }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {isLoading ? (
            <LoadingState />
          ) : filteredVitals.length === 0 ? (
            <EmptyState
              canAdd={Boolean(activeParentId)}
              onAdd={() =>
                openAddDialog(
                  filterType === "all" ? "blood_pressure" : filterType,
                )
              }
            />
          ) : (
            <div className="divide-y divide-[#e7eeec]">
              {filteredVitals.map((vital) => {
                const meta = VITAL_META[vital.vital_type];
                const Icon = meta.icon;

                return (
                  <article
                    key={vital.id}
                    className="flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-[#fbfdfc] sm:flex-row sm:items-center sm:px-6"
                  >
                    <div
                      className={`grid size-11 shrink-0 place-items-center rounded-xl ${meta.iconBackground} ${meta.iconClass}`}
                    >
                      <Icon className="size-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-[#234349]">
                          {meta.label}
                        </h3>

                        {vital.is_abnormal ? (
                          <Badge className="border-0 bg-[#f8e5e3] text-[#a74742] hover:bg-[#f8e5e3]">
                            <AlertTriangle className="mr-1 size-3" />
                            Needs review
                          </Badge>
                        ) : (
                          <Badge className="border-0 bg-[#e5f2ed] text-[#1b725f] hover:bg-[#e5f2ed]">
                            <Check className="mr-1 size-3" />
                            In range
                          </Badge>
                        )}
                      </div>

                      <p className="mt-1 text-xs text-[#768a8e]">
                        {format(
                          new Date(vital.recorded_at),
                          "MMM d, yyyy · h:mm a",
                        )}
                      </p>

                      {vital.notes && (
                        <p className="mt-2 max-w-2xl text-sm leading-5 text-[#61777b]">
                          {vital.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="text-right">
                        <p className="text-xl font-bold tracking-[-0.035em] text-[#18373d]">
                          {formatValue(vital)}
                        </p>

                        <p className="mt-0.5 text-xs font-semibold text-[#7d8f93]">
                          {vital.unit}
                        </p>
                      </div>

                      {!isChildView && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-10 rounded-xl text-[#9b5651] hover:bg-[#fff1ef] hover:text-[#8f413d]"
                          aria-label={`Delete ${meta.label} record`}
                          title="Delete this record"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            const confirmed = window.confirm(
                              `Delete this ${meta.label.toLowerCase()} record? This action cannot be undone.`,
                            );

                            if (confirmed) {
                              deleteMutation.mutate(vital.id);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-[#dce8e4] bg-[#0c3f45] p-6 text-white">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-[#a8d7cb]">
                <ShieldCheck className="size-5" />
              </span>

              <div>
                <h2 className="text-base font-bold">
                  Use vital readings as supporting information
                </h2>

                <p className="mt-2 text-sm leading-6 text-white/70">
                  A single reading does not always indicate a medical problem.
                  Consider symptoms, recent activity and guidance from a
                  qualified healthcare professional.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4d8ce] bg-[#fbf7f2] p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f3e4d7] text-[#9c6338]">
                <AlertTriangle className="size-5" />
              </span>

              <div>
                <h2 className="text-base font-bold text-[#3d3c35]">
                  Seek urgent help for severe symptoms
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#756d64]">
                  Contact emergency services for severe breathing difficulty,
                  chest pain, fainting, confusion or any rapidly worsening
                  condition.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

type OverviewMetricProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  iconBackground: string;
  iconClass: string;
  last?: boolean;
};

function OverviewMetric({
  icon: Icon,
  label,
  value,
  detail,
  iconBackground,
  iconClass,
  last = false,
}: OverviewMetricProps) {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-5 sm:px-6 ${last
          ? ""
          : "border-b border-[#e2ebe8] sm:border-r lg:border-b-0"
        }`}
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${iconBackground} ${iconClass}`}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0">
        <p className="truncate text-xs font-bold uppercase tracking-[0.11em] text-[#7b8f93]">
          {label}
        </p>

        <p className="mt-1 text-xl font-bold tracking-[-0.035em] text-[#17343a]">
          {value}
        </p>

        <p className="mt-0.5 truncate text-xs text-[#768a8e]">{detail}</p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-1 p-5 sm:p-6">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="flex animate-pulse items-center gap-4 rounded-xl px-1 py-4"
        >
          <div className="size-11 rounded-xl bg-[#edf2f0]" />

          <div className="flex-1 space-y-2">
            <div className="h-3 w-36 rounded bg-[#e8efed]" />
            <div className="h-3 w-24 rounded bg-[#f0f4f3]" />
          </div>

          <div className="h-6 w-16 rounded bg-[#e8efed]" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  canAdd,
  onAdd,
}: {
  canAdd: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-[#e7f2ee] text-[#176f69]">
        <Activity className="size-6" />
      </span>

      <h3 className="mt-5 text-lg font-bold text-[#1c3b41]">
        No vital readings found
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-[#71868a]">
        There are no records for the selected vital type and date range.
      </p>

      {canAdd && (
        <Button
          type="button"
          className="mt-6 h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
          onClick={onAdd}
        >
          <Plus className="size-4" />
          Add the first reading
        </Button>
      )}
    </div>
  );
}

function AddVitalDialog({
  initialType,
  onSubmit,
  pending,
  onComplete,
}: {
  initialType: VitalType;
  onSubmit: (input: VitalInput) => Promise<void>;
  pending: boolean;
  onComplete: () => void;
}) {
  const [type, setType] = useState<VitalType>(initialType);
  const [value, setValue] = useState("");
  const [secondary, setSecondary] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  );
  const [stepStatus, setStepStatus] =
    useState<Record<VitalType, StepStatus>>(createInitialStepStatus);

  const meta = VITAL_META[type];
  const CurrentIcon = meta.icon;
  const currentIndex = VITAL_SEQUENCE.indexOf(type);

  const processedCount = VITAL_SEQUENCE.filter(
    (vitalType) => stepStatus[vitalType] !== "pending",
  ).length;

  const remainingAfterSave = VITAL_SEQUENCE.filter(
    (vitalType) =>
      vitalType !== type && stepStatus[vitalType] === "pending",
  ).length;

  function clearReadingFields() {
    setValue("");
    setSecondary("");
    setNotes("");
  }

  function moveToNextStep(updatedStatus: Record<VitalType, StepStatus>) {
    const orderedNextTypes = [
      ...VITAL_SEQUENCE.slice(currentIndex + 1),
      ...VITAL_SEQUENCE.slice(0, currentIndex + 1),
    ];

    const nextType = orderedNextTypes.find(
      (vitalType) => updatedStatus[vitalType] === "pending",
    );

    if (!nextType) {
      toast.success("Vital recording session completed");
      onComplete();
      return;
    }

    setType(nextType);
    clearReadingFields();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      toast.error(`Enter a valid ${meta.label.toLowerCase()} value`);
      return;
    }

    let secondaryValue: number | null = null;

    if (meta.hasSecondary) {
      const numericSecondary = Number(secondary);

      if (!Number.isFinite(numericSecondary) || numericSecondary <= 0) {
        toast.error("Enter a valid diastolic value");
        return;
      }

      secondaryValue = numericSecondary;
    }

    const selectedDate = new Date(when);

    if (Number.isNaN(selectedDate.getTime())) {
      toast.error("Enter a valid date and time");
      return;
    }

    try {
      await onSubmit({
        vital_type: type,
        value: numericValue,
        value_secondary: secondaryValue,
        recorded_at: selectedDate.toISOString(),
        notes,
      });

      const updatedStatus = {
        ...stepStatus,
        [type]: "saved" as StepStatus,
      };

      setStepStatus(updatedStatus);
      moveToNextStep(updatedStatus);
    } catch {
      // The mutation displays the error toast.
    }
  }

  function skipCurrentStep() {
    const updatedStatus = {
      ...stepStatus,
      [type]:
        stepStatus[type] === "saved"
          ? ("saved" as StepStatus)
          : ("skipped" as StepStatus),
    };

    setStepStatus(updatedStatus);
    toast.message(`${meta.label} skipped`);
    moveToNextStep(updatedStatus);
  }

  return (
    <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] border-[#dce7e3] p-0 sm:max-w-2xl">
      <DialogHeader className="border-b border-[#e3ece9] px-6 py-5 text-left">
        <div className="flex items-start gap-4">
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-xl ${meta.iconBackground} ${meta.iconClass}`}
          >
            <CurrentIcon className="size-5" />
          </span>

          <div>
            <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">
              Record vital readings
            </DialogTitle>

            <DialogDescription className="mt-1.5 max-w-xl leading-6 text-[#71858a]">
              Save the current measurement, then continue through the remaining
              vital types or skip readings that are not available.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="px-6 pt-5">
        <div className="rounded-2xl border border-[#dfe9e6] bg-[#f8fbfa] p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f8589]">
                Recording progress
              </p>

              <p className="mt-1 text-sm font-semibold text-[#29494f]">
                Step {currentIndex + 1} of {VITAL_SEQUENCE.length}
              </p>
            </div>

            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#647b80] shadow-sm">
              {processedCount} completed or skipped
            </span>
          </div>

          <div className="mt-4 grid grid-cols-6 gap-2">
            {VITAL_SEQUENCE.map((vitalType, index) => {
              const status = stepStatus[vitalType];
              const isCurrent = vitalType === type;

              return (
                <button
                  key={vitalType}
                  type="button"
                  title={VITAL_META[vitalType].label}
                  aria-label={`Open ${VITAL_META[vitalType].label}`}
                  onClick={() => {
                    setType(vitalType);
                    clearReadingFields();
                  }}
                  className={`h-2.5 rounded-full transition-all ${isCurrent
                      ? "bg-[#0d7774] ring-2 ring-[#0d7774]/20 ring-offset-2"
                      : status === "saved"
                        ? "bg-[#55a587]"
                        : status === "skipped"
                          ? "bg-[#d6a269]"
                          : "bg-[#dfe8e5]"
                    }`}
                >
                  <span className="sr-only">
                    {index + 1}. {VITAL_META[vitalType].label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5 px-6 pb-6 pt-5">
        <div className="space-y-2">
          <Label className="font-semibold text-[#29484e]">Vital type</Label>

          <Select
            value={type}
            onValueChange={(selectedValue) => {
              setType(selectedValue as VitalType);
              clearReadingFields();
            }}
          >
            <SelectTrigger className="h-11 rounded-xl border-[#d8e4e0] bg-white">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              {VITAL_SEQUENCE.map((vitalType) => {
                const status = stepStatus[vitalType];

                return (
                  <SelectItem key={vitalType} value={vitalType}>
                    {VITAL_META[vitalType].label}
                    {status === "saved"
                      ? " — Saved"
                      : status === "skipped"
                        ? " — Skipped"
                        : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className={meta.hasSecondary ? "" : "sm:col-span-2"}>
            <Label className="font-semibold text-[#29484e]">
              {meta.hasSecondary ? "Systolic" : meta.label} ({meta.unit})
            </Label>

            <Input
              type="number"
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={meta.placeholder}
              className="mt-2 h-11 rounded-xl border-[#d8e4e0] bg-white"
              autoFocus
              required
            />
          </div>

          {meta.hasSecondary && (
            <div>
              <Label className="font-semibold text-[#29484e]">
                Diastolic ({meta.unit})
              </Label>

              <Input
                type="number"
                step="any"
                value={secondary}
                onChange={(event) => setSecondary(event.target.value)}
                placeholder="Diastolic"
                className="mt-2 h-11 rounded-xl border-[#d8e4e0] bg-white"
                required
              />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#e1e9e7] bg-[#f9fbfa] px-4 py-3">
          <p className="text-xs font-semibold text-[#587276]">
            {meta.normalRange}
          </p>

          <p className="mt-1 text-xs leading-5 text-[#7a8c90]">
            The application will flag readings outside this range for review.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="font-semibold text-[#29484e]">Date and time</Label>

          <DateTimeInput
            value={when}
            onChange={(selectedValue) => setWhen(selectedValue)}
            placeholder="YYYY-MM-DD HH:MM"
          />
        </div>

        <div className="space-y-2">
          <Label className="font-semibold text-[#29484e]">
            Notes <span className="font-normal text-[#849599]">(optional)</span>
          </Label>

          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={`Add context about this ${meta.label.toLowerCase()} reading`}
            className="min-h-24 rounded-xl border-[#d8e4e0] bg-white"
          />
        </div>

        <DialogFooter className="flex-col-reverse gap-3 border-t border-[#e5ecea] pt-5 sm:flex-row sm:justify-between">
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              className="h-11 flex-1 rounded-xl text-[#5e7579] hover:bg-[#f0f5f3] sm:flex-none"
              onClick={onComplete}
              disabled={pending}
            >
              Close
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-xl border-[#d7e2df] bg-white text-[#405f64] hover:bg-[#f5f9f7] sm:flex-none"
              onClick={skipCurrentStep}
              disabled={pending}
            >
              <SkipForward className="size-4" />
              Skip
            </Button>
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="h-11 w-full rounded-xl bg-[#0d6665] px-6 text-white hover:bg-[#0a5958] sm:w-auto"
          >
            <Check className="size-4" />
            {pending
              ? "Saving…"
              : remainingAfterSave === 0
                ? "Save and finish"
                : "Save and continue"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}