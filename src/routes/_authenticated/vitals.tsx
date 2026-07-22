import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useActiveParent, useCurrentUser } from "@/hooks/useProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, Plus, Trash2, Activity, Check, SkipForward } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { DateTimeInput } from "@/components/ui/datetime-input";
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
const VITAL_SEQUENCE: VitalType[] = [
  "blood_pressure",
  "blood_sugar",
  "heart_rate",
  "weight",
  "oxygen_saturation",
  "temperature",
];
const VITAL_META: Record<
  VitalType,
  {
    label: string;
    unit: string;
    hasSecondary?: boolean;
    placeholder: string;
  }
> = {
  blood_pressure: {
    label: "Blood Pressure",
    unit: "mmHg",
    hasSecondary: true,
    placeholder: "Systolic",
  },
  blood_sugar: {
    label: "Blood Sugar",
    unit: "mg/dL",
    placeholder: "e.g. 110",
  },
  heart_rate: {
    label: "Heart Rate",
    unit: "bpm",
    placeholder: "e.g. 72",
  },
  weight: { label: "Weight", unit: "kg", placeholder: "e.g. 68" },
  oxygen_saturation: {
    label: "Oxygen (SpO2)",
    unit: "%",
    placeholder: "e.g. 98",
  },
  temperature: {
    label: "Temperature",
    unit: "°C",
    placeholder: "e.g. 36.7",
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
        return { abnormal: true, reason: "High BP (≥140/90)" };
      }
      if (value < 90 || (secondary ?? 200) < 60) {
        return { abnormal: true, reason: "Low BP (<90/60)" };
      }
      return { abnormal: false };
    case "blood_sugar":
      if (value >= 180) {
        return {
          abnormal: true,
          reason: "High blood sugar (≥180 mg/dL)",
        };
      }
      if (value < 70) {
        return {
          abnormal: true,
          reason: "Low blood sugar (<70 mg/dL)",
        };
      }
      return { abnormal: false };
    case "heart_rate":
      if (value > 120) {
        return { abnormal: true, reason: "High heart rate (>120 bpm)" };
      }
      if (value < 50) {
        return { abnormal: true, reason: "Low heart rate (<50 bpm)" };
      }
      return { abnormal: false };
    case "oxygen_saturation":
      if (value < 95) {
        return { abnormal: true, reason: "Low SpO2 (<95%)" };
      }
      return { abnormal: false };
    case "temperature":
      if (value >= 38) {
        return { abnormal: true, reason: "Fever (≥38°C)" };
      }
      if (value < 35) {
        return { abnormal: true, reason: "Hypothermia (<35°C)" };
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
  const [initialVitalType, setInitialVitalType] = useState<VitalType>("blood_pressure");
  const { data: vitals = [], isLoading } = useQuery({
    queryKey: ["vitals", activeParentId, days],
    enabled: !!activeParentId,
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data, error } = await (supabase as any)
        .from("vitals")
        .select("*")
        .eq("parent_id", activeParentId!)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VitalRow[];
    },
  });
  const filtered = useMemo(
    () =>
      filterType === "all" ? vitals : vitals.filter((vital) => vital.vital_type === filterType),
    [vitals, filterType],
  );
  const latestByType = useMemo(() => {
    const map = new Map<VitalType, VitalRow>();
    const newestFirst = [...vitals].sort((first, second) => {
      const recordedDifference =
        new Date(second.recorded_at).getTime() - new Date(first.recorded_at).getTime();
      if (recordedDifference !== 0) {
        return recordedDifference;
      }
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    });
    for (const vital of newestFirst) {
      if (!map.has(vital.vital_type)) {
        map.set(vital.vital_type, vital);
      }
    }
    return map;
  }, [vitals]);
  const addMutation = useMutation({
    mutationFn: async (input: VitalInput) => {
      if (!activeParentId || !user) {
        throw new Error("The selected profile is not ready.");
      }
      const meta = VITAL_META[input.vital_type];
      const abnormalResult = checkAbnormal(input.vital_type, input.value, input.value_secondary);
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
      if (error) throw error;
      return abnormalResult;
    },
    onSuccess: (abnormalResult, input) => {
      queryClient.invalidateQueries({ queryKey: ["vitals"] });
      if (abnormalResult.abnormal) {
        toast.warning(`${VITAL_META[input.vital_type].label}: ${abnormalResult.reason}`);
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
      if (error) throw error;
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
        (currentVitals) => currentVitals?.filter((vital) => vital.id !== deletedId),
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
  const clearAll = useMutation({
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
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vitals"] });
      toast.success("All vitals cleared");
    },
    onError: (error: any) => {
      toast.error(error.message ?? "Failed to clear vitals");
    },
  });
  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold italic sm:text-4xl">Vitals</h1>
          <p className="mt-1 text-muted-foreground">
            Health vitals for {activeParent?.full_name ?? "—"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isChildView && activeParentId && vitals.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                if (
                  confirm(
                    "Are you sure you want to delete ALL vitals? This action cannot be undone.",
                  )
                ) {
                  clearAll.mutate();
                }
              }}
              disabled={clearAll.isPending}
              className="rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Delete All
            </Button>
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                disabled={!activeParentId}
                onClick={() => setInitialVitalType("blood_pressure")}
              >
                <Plus className="mr-1 size-4" /> Add Record
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

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {VITAL_SEQUENCE.map((type) => {
          const vital = latestByType.get(type);
          return (
            <button
              key={type}
              type="button"
              disabled={!activeParentId}
              onClick={() => {
                setInitialVitalType(type);
                setOpen(true);
              }}
              aria-label={`Add ${VITAL_META[type].label} record`}
              title={`Click to add ${VITAL_META[type].label}`}
              className="group rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {VITAL_META[type].label}
                </p>
                <Plus className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>

              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-2xl font-bold">
                  {vital ? formatValue(vital) : "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {vital?.unit ?? VITAL_META[type].unit}
                </span>
              </div>

              {vital?.is_abnormal && (
                <Badge variant="destructive" className="mt-2 text-[10px]">
                  <AlertTriangle className="mr-1 size-3" /> Abnormal
                </Badge>
              )}

              {vital && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {format(new Date(vital.recorded_at), "MMM d, HH:mm")}
                </p>
              )}

              <p className="mt-3 text-[10px] font-medium text-primary opacity-80">
                Click to add record
              </p>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          value={filterType}
          onValueChange={(value) => setFilterType(value as VitalType | "all")}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vitals</SelectItem>
            {VITAL_SEQUENCE.map((type) => (
              <SelectItem key={type} value={type}>
                {VITAL_META[type].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
          <SelectTrigger className="w-full sm:w-[160px]">
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

      {filterType !== "all" && filtered.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Activity className="size-4" /> {VITAL_META[filterType].label} trend
          </p>
          <div className="h-56 min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={[...filtered].reverse().map((vital) => ({
                  date: format(new Date(vital.recorded_at), "MMM d"),
                  value: Number(vital.value),
                  secondary: vital.value_secondary ? Number(vital.value_secondary) : undefined,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" fontSize={10} tick={{ fontSize: 10 }} />
                <YAxis fontSize={10} tick={{ fontSize: 10 }} width={36} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                {filterType === "blood_pressure" && (
                  <Line
                    type="monotone"
                    dataKey="secondary"
                    stroke="hsl(var(--secondary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No vitals recorded in this period.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((vital) => (
              <div
                key={vital.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{VITAL_META[vital.vital_type].label}</p>
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">
                    {format(new Date(vital.recorded_at), "MMM d, yyyy HH:mm")}
                  </p>
                  {vital.notes && (
                    <p className="mt-0.5 line-clamp-1 text-xs italic text-muted-foreground">
                      {vital.notes}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-lg font-bold">{formatValue(vital)}</span>
                  <span className="text-xs text-muted-foreground">{vital.unit}</span>

                  {vital.is_abnormal ? (
                    <Badge variant="destructive" className="text-[10px]">
                      <AlertTriangle className="mr-1 size-3" /> Abnormal
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Normal
                    </Badge>
                  )}

                  {!isChildView && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Delete ${VITAL_META[vital.vital_type].label} record`}
                      title="Delete this record"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Delete this ${VITAL_META[vital.vital_type].label} record? This action cannot be undone.`,
                          )
                        ) {
                          deleteMutation.mutate(vital.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
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
  const [when, setWhen] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [stepStatus, setStepStatus] =
    useState<Record<VitalType, StepStatus>>(createInitialStepStatus);
  const meta = VITAL_META[type];
  const currentIndex = VITAL_SEQUENCE.indexOf(type);
  const processedCount = VITAL_SEQUENCE.filter(
    (vitalType) => stepStatus[vitalType] !== "pending",
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
    const nextType = orderedNextTypes.find((vitalType) => updatedStatus[vitalType] === "pending");
    if (!nextType) {
      toast.success("Vital recording session completed");
      onComplete();
      return;
    }
    setType(nextType);
    clearReadingFields();
  }
  async function submit(event: React.FormEvent) {
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
      void 0;
    }
  }
  function skipCurrentStep() {
    const updatedStatus = {
      ...stepStatus,
      [type]: stepStatus[type] === "saved" ? "saved" : "skipped",
    };
    setStepStatus(updatedStatus);
    toast.message(`${meta.label} skipped`);
    moveToNextStep(updatedStatus);
  }
  const remainingAfterSave = VITAL_SEQUENCE.filter(
    (vitalType) => vitalType !== type && stepStatus[vitalType] === "pending",
  ).length;
  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Add vital records</DialogTitle>
        <DialogDescription>
          The form starts with blood pressure and automatically moves through all six vitals. Use
          the list to jump to another vital, or skip a reading you do not have.
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-2xl border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium">
            Step {currentIndex + 1} of {VITAL_SEQUENCE.length}
          </span>
          <span className="text-muted-foreground">{processedCount} completed or skipped</span>
        </div>

        <div className="mt-3 grid grid-cols-6 gap-1.5">
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
                className={`h-2 rounded-full transition-all ${
                  isCurrent
                    ? "bg-primary ring-2 ring-primary/20 ring-offset-1"
                    : status === "saved"
                      ? "bg-emerald-500"
                      : status === "skipped"
                        ? "bg-amber-400"
                        : "bg-border"
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

      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Vital type</Label>
          <Select
            value={type}
            onValueChange={(value) => {
              setType(value as VitalType);
              clearReadingFields();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VITAL_SEQUENCE.map((vitalType) => {
                const status = stepStatus[vitalType];
                return (
                  <SelectItem key={vitalType} value={vitalType}>
                    {VITAL_META[vitalType].label}
                    {status === "saved" ? " — Saved" : status === "skipped" ? " — Skipped" : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={meta.hasSecondary ? "" : "sm:col-span-2"}>
            <Label>
              {meta.hasSecondary ? "Systolic" : meta.label} ({meta.unit})
            </Label>
            <Input
              type="number"
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={meta.placeholder}
              autoFocus
              required
            />
          </div>

          {meta.hasSecondary && (
            <div>
              <Label>Diastolic ({meta.unit})</Label>
              <Input
                type="number"
                step="any"
                value={secondary}
                onChange={(event) => setSecondary(event.target.value)}
                placeholder="Diastolic"
                required
              />
            </div>
          )}
        </div>

        <div>
          <Label>Date / time</Label>
          <DateTimeInput
            value={when}
            onChange={(value) => setWhen(value)}
            placeholder="YYYY-MM-DD HH:MM"
          />
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={`Optional notes about ${meta.label.toLowerCase()}`}
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onComplete} disabled={pending}>
              Close
            </Button>
            <Button type="button" variant="outline" onClick={skipCurrentStep} disabled={pending}>
              <SkipForward className="mr-2 size-4" /> Skip
            </Button>
          </div>

          <Button type="submit" disabled={pending}>
            <Check className="mr-2 size-4" />
            {pending ? "Saving…" : remainingAfterSave === 0 ? "Save & Finish" : "Save & Next"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
