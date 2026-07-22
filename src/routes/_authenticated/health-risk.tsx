import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useActiveParent } from "@/hooks/useProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { predictHealthRisk } from "@/lib/api/healthRisk.functions";
import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { differenceInYears, format } from "date-fns";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Database,
  HeartPulse,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Stethoscope,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/health-risk")({
  ssr: false,
  component: HealthRiskPage,
});

const riskStyles: Record<
  RiskAssessment["risk_level"],
  { bg: string; text: string; border: string; dot: string }
> = {
  low: {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  medium: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  high: {
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-200",
    dot: "bg-red-500",
  },
};

type RiskAssessment = {
  id: string;
  parent_id: string;
  age: number;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  sugar_level: number | null;
  heart_rate: number | null;
  weight: number | null;
  oxygen_level: number | null;
  activity_level: string | null;
  wellness_data: string | null;
  risk_level: "low" | "medium" | "high";
  risk_score: number | null;
  summary: string | null;
  recommendations: string | null;
  warning_flags: string[];
  urgent: boolean;
  generated_by: "rules" | "rules+gemini";
  source_mode: "manual" | "latest_vitals";
  source_vital_ids: string[];
  comparison: {
    previous_assessment_id?: string | null;
    previous_score?: number | null;
    score_delta?: number | null;
    trend?: "no_previous" | "increased" | "improved" | "stable";
    new_warning_flags?: string[];
    resolved_warning_flags?: string[];
  } | null;
  created_at: string;
};

type VitalType =
  | "blood_pressure"
  | "blood_sugar"
  | "heart_rate"
  | "weight"
  | "oxygen_saturation"
  | "temperature";

type VitalRow = {
  id: string;
  vital_type: VitalType;
  value: number;
  value_secondary: number | null;
  recorded_at: string;
  created_at: string;
};

function getAge(dateOfBirth: string | null | undefined) {
  if (!dateOfBirth) return null;
  const date = new Date(dateOfBirth);
  if (Number.isNaN(date.getTime())) return null;
  const years = differenceInYears(new Date(), date);
  return years >= 18 && years <= 125 ? years : null;
}

function getWarningFlags(assessment: RiskAssessment) {
  const flags: string[] = [];
  let urgent = false;
  const sys = assessment.bp_systolic;
  const dia = assessment.bp_diastolic;
  const sugar = assessment.sugar_level;
  const heartRate = assessment.heart_rate;
  const oxygen = assessment.oxygen_level;

  if (sys !== null && dia !== null) {
    if (sys >= 180 || dia >= 120) {
      urgent = true;
      flags.push("Very high blood pressure reading");
    } else if (sys >= 140 || dia >= 90) {
      flags.push("Elevated blood pressure reading");
    }

    if (sys < 80 || dia < 50) {
      urgent = true;
      flags.push("Very low blood pressure reading");
    } else if (sys < 90 || dia < 60) {
      flags.push("Low blood pressure reading");
    }
  }

  if (sugar !== null) {
    if (sugar < 54) {
      urgent = true;
      flags.push("Very low blood sugar reading");
    } else if (sugar < 70) {
      flags.push("Low blood sugar reading");
    } else if (sugar >= 300) {
      urgent = true;
      flags.push("Very high blood sugar reading");
    } else if (sugar >= 126) {
      flags.push("Fasting blood sugar is above the usual range");
    }
  }

  if (heartRate !== null) {
    if (heartRate < 40 || heartRate > 130) {
      urgent = true;
      flags.push(heartRate < 40 ? "Very slow heart-rate reading" : "Very fast heart-rate reading");
    } else if (heartRate < 50 || heartRate > 100) {
      flags.push(heartRate < 50 ? "Slow heart-rate reading" : "Fast heart-rate reading");
    }
  }

  if (oxygen !== null) {
    if (oxygen < 90) {
      urgent = true;
      flags.push("Very low oxygen saturation reading");
    } else if (oxygen < 95) {
      flags.push("Oxygen saturation is below the usual range");
    }
  }

  if (assessment.activity_level === "low") flags.push("Low daily activity level");

  return { flags: [...new Set(flags)], urgent };
}

function HealthRiskPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const qc = useQueryClient();
  const predict = useServerFn(predictHealthRisk);

  const [age, setAge] = useState("");
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [sugar, setSugar] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [activity, setActivity] = useState<"low" | "moderate" | "high">("moderate");
  const [weight, setWeight] = useState("");
  const [oxygen, setOxygen] = useState("");
  const [wellnessData, setWellnessData] = useState("");
  const [loadedFromVitals, setLoadedFromVitals] = useState(false);
  const [sourceVitalIds, setSourceVitalIds] = useState<string[]>([]);

  useEffect(() => {
    const profileAge = getAge(activeParent?.date_of_birth);
    if (profileAge !== null) setAge((current) => current || String(profileAge));
  }, [activeParent?.date_of_birth]);

  const {
    data: history = [],
    isLoading,
    isFetching,
    error: historyError,
    refetch,
  } = useQuery({
    queryKey: ["riskHistory", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("health_risk_assessments")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RiskAssessment[];
    },
  });

  const { data: latestVitals = [], isFetching: loadingVitals } = useQuery({
    queryKey: ["riskLatestVitals", activeParentId],
    enabled: !!activeParentId && !isChildView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vitals")
        .select("id,vital_type,value,value_secondary,recorded_at,created_at")
        .eq("parent_id", activeParentId!)
        .order("recorded_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as VitalRow[];
    },
  });

  useEffect(() => {
    if (!activeParentId) return;
    const channel = supabase
      .channel(`health-risk-${activeParentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "health_risk_assessments",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["riskHistory", activeParentId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeParentId, qc]);

  const latest = history[0];
  const latestSafety = useMemo(() => {
    if (!latest) return null;
    const calculated = getWarningFlags(latest);
    return {
      flags: latest.warning_flags?.length ? latest.warning_flags : calculated.flags,
      urgent: latest.urgent || calculated.urgent,
    };
  }, [latest]);

  function resetForm() {
    setAge(getAge(activeParent?.date_of_birth)?.toString() ?? "");
    setSys("");
    setDia("");
    setSugar("");
    setHeartRate("");
    setActivity("moderate");
    setWeight("");
    setOxygen("");
    setWellnessData("");
    setLoadedFromVitals(false);
    setSourceVitalIds([]);
  }

  function loadLatestVitals() {
    const byType = new Map<VitalType, VitalRow>();
    for (const vital of latestVitals) {
      if (!byType.has(vital.vital_type)) byType.set(vital.vital_type, vital);
    }

    const bloodPressure = byType.get("blood_pressure");
    const bloodSugar = byType.get("blood_sugar");
    const pulse = byType.get("heart_rate");
    const latestWeight = byType.get("weight");
    const latestOxygen = byType.get("oxygen_saturation");
    const missing: string[] = [];
    const usedIds: string[] = [];

    if (bloodPressure?.value_secondary !== null && bloodPressure?.value_secondary !== undefined) {
      setSys(String(bloodPressure.value));
      setDia(String(bloodPressure.value_secondary));
      usedIds.push(bloodPressure.id);
    } else {
      missing.push("blood pressure");
    }

    if (bloodSugar) {
      setSugar(String(bloodSugar.value));
      usedIds.push(bloodSugar.id);
    } else missing.push("blood sugar");

    if (pulse) {
      setHeartRate(String(pulse.value));
      usedIds.push(pulse.id);
    } else missing.push("heart rate");

    if (latestWeight) {
      setWeight(String(latestWeight.value));
      usedIds.push(latestWeight.id);
    }
    if (latestOxygen) {
      setOxygen(String(latestOxygen.value));
      usedIds.push(latestOxygen.id);
    }

    const profileAge = getAge(activeParent?.date_of_birth);
    if (profileAge !== null) setAge(String(profileAge));
    else if (!age) missing.push("age/date of birth");

    setLoadedFromVitals(true);
    setSourceVitalIds([...new Set(usedIds)]);

    if (missing.length) {
      toast.warning(`Loaded available readings. Still enter: ${missing.join(", ")}.`);
    } else {
      toast.success(
        "Latest recorded vitals loaded. Confirm that the blood-sugar reading was fasting.",
      );
    }
  }

  function validateInputs() {
    if (!age || !sys || !dia || !sugar || !heartRate) {
      toast.error("Age, blood pressure, fasting blood sugar, and heart rate are required.");
      return false;
    }

    const parsed = {
      age: Number(age),
      sys: Number(sys),
      dia: Number(dia),
      sugar: Number(sugar),
      heartRate: Number(heartRate),
      weight: weight ? Number(weight) : undefined,
      oxygen: oxygen ? Number(oxygen) : undefined,
    };

    if (Object.values(parsed).some((value) => value !== undefined && !Number.isFinite(value))) {
      toast.error("Please enter valid numeric measurements.");
      return false;
    }

    if (!Number.isInteger(parsed.age) || parsed.age < 18 || parsed.age > 125) {
      toast.error("Age must be a whole number between 18 and 125.");
      return false;
    }
    if (parsed.sys < 50 || parsed.sys > 300 || parsed.dia < 30 || parsed.dia > 200) {
      toast.error("Blood pressure appears outside the supported measurement range.");
      return false;
    }
    if (parsed.sys <= parsed.dia) {
      toast.error("Systolic blood pressure must be higher than diastolic blood pressure.");
      return false;
    }
    if (parsed.sugar < 20 || parsed.sugar > 800) {
      toast.error("Blood sugar must be between 20 and 800 mg/dL.");
      return false;
    }
    if (parsed.heartRate < 20 || parsed.heartRate > 250) {
      toast.error("Heart rate must be between 20 and 250 bpm.");
      return false;
    }
    if (parsed.weight !== undefined && (parsed.weight < 20 || parsed.weight > 400)) {
      toast.error("Weight must be between 20 and 400 kg.");
      return false;
    }
    if (parsed.oxygen !== undefined && (parsed.oxygen < 50 || parsed.oxygen > 100)) {
      toast.error("Oxygen saturation must be between 50% and 100%.");
      return false;
    }
    if (wellnessData.trim().length > 1000) {
      toast.error("Wellness context must be 1,000 characters or fewer.");
      return false;
    }

    return true;
  }

  const run = useMutation({
    mutationFn: async () => {
      if (!activeParentId || isChildView) {
        throw new Error("Only the care-recipient account can run a risk check.");
      }

      const result = await predict({
        data: {
          age: Number(age),
          bpSystolic: Number(sys),
          bpDiastolic: Number(dia),
          sugarLevel: Number(sugar),
          heartRate: Number(heartRate),
          activityLevel: activity,
          weight: weight ? Number(weight) : undefined,
          oxygenLevel: oxygen ? Number(oxygen) : undefined,
          wellnessData: wellnessData.trim() || undefined,
          sourceMode: loadedFromVitals ? "latest_vitals" : "manual",
          sourceVitalIds: loadedFromVitals ? sourceVitalIds : [],
        },
      });

      return { row: result.assessment as RiskAssessment, urgent: result.urgent };
    },
    onSuccess: ({ row, urgent }) => {
      qc.setQueryData<RiskAssessment[]>(["riskHistory", activeParentId], (current = []) => [
        row,
        ...current.filter((item) => item.id !== row.id),
      ]);
      qc.invalidateQueries({ queryKey: ["riskHistory", activeParentId] });
      setWellnessData("");
      setLoadedFromVitals(false);
      setSourceVitalIds([]);
      toast[urgent ? "warning" : "success"](
        urgent
          ? "Assessment saved. Please review the urgent safety guidance."
          : "Risk screening completed and saved.",
      );
    },
    onError: (error: Error) =>
      toast.error(error.message || "The risk check could not be completed."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeParentId || isChildView) throw new Error("You cannot delete this assessment.");
      const { data, error } = await supabase
        .from("health_risk_assessments")
        .delete()
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error(
          "The assessment was not deleted. Check your permissions or refresh the page.",
        );
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<RiskAssessment[]>(["riskHistory", activeParentId], (current = []) =>
        current.filter((item) => item.id !== id),
      );
      qc.invalidateQueries({ queryKey: ["riskHistory", activeParentId] });
      toast.success("Assessment deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      if (!activeParentId || isChildView) throw new Error("You cannot delete these assessments.");
      const { data, error } = await supabase
        .from("health_risk_assessments")
        .delete()
        .eq("parent_id", activeParentId)
        .select("id");
      if (error) throw error;
      if (history.length > 0 && (data?.length ?? 0) === 0) {
        throw new Error("No assessments were deleted. Check your database permissions.");
      }
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      qc.setQueryData(["riskHistory", activeParentId], []);
      qc.invalidateQueries({ queryKey: ["riskHistory", activeParentId] });
      toast.success(`${count} assessment${count === 1 ? "" : "s"} deleted.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold italic sm:text-4xl">
            AI Health Risk Check
          </h1>
          <p className="mt-1 text-muted-foreground">
            A safety-first screening for {activeParent?.full_name ?? "the care recipient"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching || !activeParentId}
            className="rounded-xl"
          >
            <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {!isChildView && history.length > 0 && (
            <Button
              variant="outline"
              disabled={clearAll.isPending}
              onClick={() => {
                if (confirm("Delete every saved risk assessment? This cannot be undone."))
                  clearAll.mutate();
              }}
              className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Delete All
            </Button>
          )}
        </div>
      </div>

      <div className="mb-8 flex items-start gap-4 rounded-3xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
        <ShieldAlert className="mt-0.5 size-6 shrink-0 text-blue-600" />
        <div>
          <p className="font-bold">This is a screening tool, not a diagnosis.</p>
          <p className="mt-1">
            The score is an application screening score—not a disease probability. Do not delay
            medical care because of a low result.
          </p>
        </div>
      </div>

      {isChildView && (
        <div className="mb-8 flex items-start gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 size-6 shrink-0" />
          <div>
            <p className="font-bold">Read-only family view</p>
            <p className="mt-1">
              Only the care-recipient account can run or delete a risk assessment.
            </p>
          </div>
        </div>
      )}

      {historyError && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load assessment history. {(historyError as Error).message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {!isChildView && (
          <section className="space-y-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8 lg:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <Stethoscope className="size-5 text-primary" />
                Health Measurements
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={resetForm} className="rounded-xl">
                  <RotateCcw className="mr-1.5 size-4" /> Reset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadLatestVitals}
                  disabled={loadingVitals || latestVitals.length === 0}
                  className="rounded-xl"
                >
                  {loadingVitals ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Database className="mr-1.5 size-4" />
                  )}
                  Use Latest Vitals
                </Button>
              </div>
            </div>

            {loadedFromVitals && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                Values were copied from the latest Vitals records. Confirm every value, especially
                that blood sugar was measured while fasting.
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Age" required>
                <Input
                  id="risk-age"
                  type="number"
                  min={18}
                  max={125}
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                  placeholder="e.g. 65"
                />
              </Field>

              <Field label="Activity Level" required>
                <Select
                  value={activity}
                  onValueChange={(value) => setActivity(value as typeof activity)}
                >
                  <SelectTrigger id="risk-activity" className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="BP Systolic (mmHg)" required>
                <Input
                  id="risk-sys"
                  type="number"
                  min={50}
                  max={300}
                  value={sys}
                  onChange={(event) => setSys(event.target.value)}
                  placeholder="e.g. 120"
                />
              </Field>

              <Field label="BP Diastolic (mmHg)" required>
                <Input
                  id="risk-dia"
                  type="number"
                  min={30}
                  max={200}
                  value={dia}
                  onChange={(event) => setDia(event.target.value)}
                  placeholder="e.g. 80"
                />
              </Field>

              <Field label="Fasting Blood Sugar (mg/dL)" required className="sm:col-span-2">
                <Input
                  id="risk-sugar"
                  type="number"
                  min={20}
                  max={800}
                  value={sugar}
                  onChange={(event) => setSugar(event.target.value)}
                  placeholder="e.g. 100"
                />
              </Field>

              <Field label="Heart Rate (bpm)" required className="sm:col-span-2">
                <Input
                  id="risk-heart"
                  type="number"
                  min={20}
                  max={250}
                  value={heartRate}
                  onChange={(event) => setHeartRate(event.target.value)}
                  placeholder="e.g. 72"
                />
              </Field>

              <Field label="Weight (kg)" optional>
                <Input
                  id="risk-weight"
                  type="number"
                  min={20}
                  max={400}
                  step="0.1"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                  placeholder="e.g. 70"
                />
              </Field>

              <Field label="Oxygen Saturation (%)" optional>
                <Input
                  id="risk-oxygen"
                  type="number"
                  min={50}
                  max={100}
                  value={oxygen}
                  onChange={(event) => setOxygen(event.target.value)}
                  placeholder="e.g. 98"
                />
              </Field>

              <Field label="Symptoms or wellness context" optional className="sm:col-span-2">
                <Textarea
                  id="risk-wellness"
                  rows={4}
                  maxLength={1000}
                  value={wellnessData}
                  onChange={(event) => setWellnessData(event.target.value)}
                  placeholder="e.g. mild headache, dizziness, daily walks, poor sleep"
                />
                <p className="text-right text-[10px] text-muted-foreground">
                  {wellnessData.length}/1000
                </p>
              </Field>
            </div>

            <Button
              disabled={!activeParentId || run.isPending}
              onClick={() => validateInputs() && run.mutate()}
              className="w-full rounded-xl py-6 font-semibold"
            >
              {run.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Running safety screening…
                </>
              ) : (
                <>
                  <HeartPulse className="mr-2 size-4" /> Run AI Risk Check
                </>
              )}
            </Button>
          </section>
        )}

        <section className={`space-y-8 ${isChildView ? "lg:col-span-12" : "lg:col-span-6"}`}>
          {isLoading ? (
            <div className="rounded-3xl border border-border bg-card p-12 text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-3 size-7 animate-spin" /> Loading the latest
              assessment…
            </div>
          ) : latest ? (
            <div
              className={`relative overflow-hidden rounded-3xl border-2 p-6 shadow-md sm:p-8 ${riskStyles[latest.risk_level].bg} ${riskStyles[latest.risk_level].border} ${riskStyles[latest.risk_level].text}`}
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest">
                  Latest screening result
                </span>
                <Activity className="size-5" />
              </div>
              <p className="font-display text-4xl font-extrabold capitalize leading-none">
                {latest.risk_level} Risk
              </p>
              {latest.risk_score !== null && (
                <p className="mt-2 font-mono text-xs font-semibold uppercase tracking-wider">
                  Screening score: {latest.risk_score}/100
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline" className="border-current/25 bg-white/50 text-current">
                  {latest.source_mode === "latest_vitals"
                    ? "Latest saved vitals"
                    : "Manual measurements"}
                </Badge>
                <Badge variant="outline" className="border-current/25 bg-white/50 text-current">
                  {latest.generated_by === "rules+gemini"
                    ? "Rules + Gemini wording"
                    : "Free rule engine"}
                </Badge>
              </div>

              {latest.comparison?.trend && latest.comparison.trend !== "no_previous" && (
                <div className="mt-4 rounded-2xl border border-white/60 bg-white/45 p-4 text-sm">
                  <p className="font-bold">Change from previous screening</p>
                  <p className="mt-1">
                    {latest.comparison.trend === "increased"
                      ? `Risk score increased by ${Math.abs(latest.comparison.score_delta ?? 0)} points.`
                      : latest.comparison.trend === "improved"
                        ? `Risk score improved by ${Math.abs(latest.comparison.score_delta ?? 0)} points.`
                        : "Risk score is broadly stable compared with the previous screening."}
                  </p>
                  {!!latest.comparison.new_warning_flags?.length && (
                    <p className="mt-2 text-xs">
                      New warning signs: {latest.comparison.new_warning_flags.join(", ")}
                    </p>
                  )}
                  {!!latest.comparison.resolved_warning_flags?.length && (
                    <p className="mt-1 text-xs">
                      No longer flagged: {latest.comparison.resolved_warning_flags.join(", ")}
                    </p>
                  )}
                </div>
              )}

              {latestSafety?.urgent && (
                <div className="mt-5 rounded-2xl border border-red-300 bg-white/70 p-4 text-red-900">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                    <div>
                      <p className="font-bold">Prompt medical attention may be needed</p>
                      <p className="mt-1 text-sm">
                        If there is chest pain, severe breathing difficulty, fainting, new
                        confusion, one-sided weakness, or another severe symptom, use SOS or call
                        emergency services now.
                      </p>
                      <Button asChild size="sm" variant="destructive" className="mt-3 rounded-xl">
                        <Link to="/sos">Open SOS</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {latestSafety && latestSafety.flags.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {latestSafety.flags.map((flag) => (
                    <Badge
                      key={flag}
                      variant="outline"
                      className="border-current/25 bg-white/50 text-current"
                    >
                      {flag}
                    </Badge>
                  ))}
                </div>
              )}

              <p className="mt-5 rounded-2xl border border-white/60 bg-white/45 p-4 text-sm font-medium leading-relaxed">
                {latest.summary || "No summary was saved."}
              </p>

              {latest.recommendations && (
                <div className="mt-6">
                  <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest">
                    Recommended next steps
                  </p>
                  <ul className="space-y-2 text-sm">
                    {latest.recommendations
                      .split("\n")
                      .map((item) => item.replace(/^[-•]\s*/, "").trim())
                      .filter(Boolean)
                      .map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 rounded-xl bg-white/30 p-2.5"
                        >
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current" />
                          <span>{item}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-current/10 pt-4 text-[11px] font-semibold sm:grid-cols-4">
                <Measurement label="Age" value={`${latest.age} yrs`} />
                <Measurement
                  label="Blood Pressure"
                  value={`${latest.bp_systolic ?? "—"}/${latest.bp_diastolic ?? "—"} mmHg`}
                />
                <Measurement label="Fasting Sugar" value={`${latest.sugar_level ?? "—"} mg/dL`} />
                <Measurement label="Heart Rate" value={`${latest.heart_rate ?? "—"} bpm`} />
                {latest.weight !== null && (
                  <Measurement label="Weight" value={`${latest.weight} kg`} />
                )}
                {latest.oxygen_level !== null && (
                  <Measurement label="Oxygen" value={`${latest.oxygen_level}%`} />
                )}
                {latest.activity_level && (
                  <Measurement label="Activity" value={latest.activity_level} capitalize />
                )}
              </div>

              <p className="mt-4 text-right font-mono text-[10px] opacity-65">
                {format(new Date(latest.created_at), "MMM d, yyyy · h:mm a")}
              </p>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border p-14 text-center text-muted-foreground">
              <Activity className="mx-auto mb-3 size-10 opacity-30" />
              <p className="font-semibold">No saved assessments</p>
              {!isChildView && (
                <p className="mt-1 text-sm">
                  Enter measurements or load the latest Vitals records.
                </p>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div className="space-y-3">
              <h3 className="px-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Assessment History
              </h3>
              <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                {history.map((item) => {
                  const style = riskStyles[item.risk_level];
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-3 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`size-2.5 shrink-0 rounded-full ${style.dot}`} />
                        <div>
                          <p className="font-semibold capitalize">{item.risk_level} Risk</p>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays className="size-3.5" />
                            {format(new Date(item.created_at), "MMM d, yyyy · h:mm a")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4 sm:justify-end">
                        <div className="text-right">
                          <Badge
                            variant="outline"
                            className={`${style.bg} ${style.text} ${style.border}`}
                          >
                            Score: {item.risk_score ?? "—"}
                          </Badge>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            BP {item.bp_systolic ?? "—"}/{item.bp_diastolic ?? "—"} · Sugar{" "}
                            {item.sugar_level ?? "—"}
                          </p>
                          {item.comparison?.trend && item.comparison.trend !== "no_previous" && (
                            <p className="mt-1 text-[10px] font-semibold capitalize text-muted-foreground">
                              Trend: {item.comparison.trend}
                              {item.comparison.score_delta !== null &&
                                item.comparison.score_delta !== undefined
                                ? ` (${item.comparison.score_delta > 0 ? "+" : ""}${item.comparison.score_delta})`
                                : ""}
                            </p>
                          )}
                        </div>
                        {!isChildView && (
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm("Delete this risk assessment?"))
                                deleteMutation.mutate(item.id);
                            }}
                            className="rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Delete assessment"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  required,
  optional,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
        {optional && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
        )}
      </Label>
      {children}
    </div>
  );
}

function Measurement({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <span className="block font-mono text-[9px] uppercase tracking-wider opacity-60">
        {label}
      </span>
      <span className={capitalize ? "capitalize" : ""}>{value}</span>
    </div>
  );
}