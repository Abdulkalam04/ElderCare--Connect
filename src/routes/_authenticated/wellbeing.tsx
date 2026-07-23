import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  CalendarCheck2,
  Check,
  CircleAlert,
  ClipboardCheck,
  Droplets,
  HeartPulse,
  Moon,
  Pill,
  ShieldCheck,
  Trash2,
  Utensils,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useActiveParent } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import type {
  Tables,
  TablesInsert,
} from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/wellbeing")({
  ssr: false,
  component: WellbeingPage,
});

type WellbeingCheck = Tables<"wellbeing_checks">;
type EditableField =
  | "feeling"
  | "energy_level"
  | "meals_logged"
  | "took_medicine"
  | "water_intake"
  | "sleep_quality"
  | "pain_status";

type UpdatePayload = {
  field: EditableField;
  value: string | number | boolean;
};

const TOTAL_CHECK_ITEMS = 7;

function WellbeingPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const {
    data: checks = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["wellbeing-history", activeParentId],
    enabled: Boolean(activeParentId),
    queryFn: async () => {
      const since = format(subDays(new Date(), 14), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("wellbeing_checks")
        .select("*")
        .eq("parent_id", activeParentId!)
        .gte("check_date", since)
        .order("check_date", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const todayCheck = checks.find((check) => check.check_date === today);
  const completionCount = countCompletedItems(todayCheck);
  const completionPercent = Math.round(
    (completionCount / TOTAL_CHECK_ITEMS) * 100,
  );
  const positiveDays = checks.filter(isPositiveDay).length;
  const mostCommonMood = getMostCommonMood(checks);

  const saveCheck = useMutation({
    mutationFn: async ({ field, value }: UpdatePayload) => {
      if (isChildView) {
        throw new Error("Family members have read-only access to wellbeing check-ins.");
      }

      if (!activeParentId) {
        throw new Error("No active parent selected.");
      }

      const extraFields: Partial<TablesInsert<"wellbeing_checks">> = {};

      if (field === "meals_logged") {
        extraFields.ate_meals = value === "Completed" || value === "Partially";
      }

      if (field === "water_intake") {
        extraFields.drank_water = Number(value) >= 4;
      }

      const payload: TablesInsert<"wellbeing_checks"> = {
        parent_id: activeParentId,
        check_date: today,
        ...extraFields,
      };

      switch (field) {
        case "feeling":
          payload.feeling = String(value);
          break;
        case "energy_level":
          payload.energy_level = String(value);
          break;
        case "meals_logged":
          payload.meals_logged = String(value);
          break;
        case "took_medicine":
          payload.took_medicine = Boolean(value);
          break;
        case "water_intake":
          payload.water_intake = Number(value);
          break;
        case "sleep_quality":
          payload.sleep_quality = String(value);
          break;
        case "pain_status":
          payload.pain_status = Boolean(value);
          break;
      }

      const { data, error } = await supabase
        .from("wellbeing_checks")
        .upsert(payload, { onConflict: "parent_id,check_date" })
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (savedCheck) => {
      queryClient.setQueryData<WellbeingCheck[]>(
        ["wellbeing-history", activeParentId],
        (current = []) => {
          const exists = current.some((check) => check.id === savedCheck.id);

          if (exists) {
            return current.map((check) =>
              check.id === savedCheck.id ? savedCheck : check,
            );
          }

          return [savedCheck, ...current];
        },
      );

      queryClient.invalidateQueries({ queryKey: ["wellbeing"] });
      toast.success("Today’s wellbeing check-in was updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeCheck = useMutation({
    mutationFn: async ({ id, checkDate }: { id: string; checkDate: string }) => {
      if (isChildView) {
        throw new Error("You do not have permission to delete wellbeing records.");
      }

      if (!activeParentId) {
        throw new Error("No active parent selected.");
      }

      const { data, error } = await supabase
        .from("wellbeing_checks")
        .delete()
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("The wellbeing record was already removed or could not be deleted.");
      }

      return { id, checkDate };
    },
    onSuccess: ({ id, checkDate }) => {
      queryClient.setQueryData<WellbeingCheck[]>(
        ["wellbeing-history", activeParentId],
        (current = []) => current.filter((check) => check.id !== id),
      );
      queryClient.invalidateQueries({ queryKey: ["wellbeing"] });
      toast.success(
        `Wellbeing record for ${formatDate(checkDate, "MMM d, yyyy")} was deleted.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error("You do not have permission to clear wellbeing records.");
      }

      if (!activeParentId) {
        throw new Error("No active parent selected.");
      }

      const { error } = await supabase
        .from("wellbeing_checks")
        .delete()
        .eq("parent_id", activeParentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData<WellbeingCheck[]>(
        ["wellbeing-history", activeParentId],
        [],
      );
      queryClient.invalidateQueries({ queryKey: ["wellbeing"] });
      toast.success("All wellbeing records were cleared.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const parentName = activeParent?.full_name ?? "Selected parent";

  return (
    <AppShell>
      <div className="space-y-6 pb-8">
        <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#cfe1dc] bg-white px-3 py-1.5 text-xs font-semibold text-[#176963] shadow-sm">
              <HeartPulse className="size-3.5" />
              Daily wellbeing
            </div>

            <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#163238] sm:text-4xl">
              Wellbeing overview
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#647a80] sm:text-base">
              Track the daily routine, comfort and general wellness of {parentName}.
              The history below shows the most recent 14 days.
            </p>
          </div>

          {!isChildView && checks.length > 0 && (
            <Button
              variant="outline"
              className="h-11 rounded-xl border-[#e3c9c5] bg-white px-4 font-semibold text-[#a1433e] hover:border-[#d7aaa5] hover:bg-[#fff5f4] hover:text-[#8f3732]"
              disabled={clearAll.isPending}
              onClick={() => {
                const confirmed = window.confirm(
                  "Delete all wellbeing checks? This action cannot be undone.",
                );

                if (confirmed) clearAll.mutate();
              }}
            >
              <Trash2 className="size-4" />
              {clearAll.isPending ? "Deleting…" : "Delete all records"}
            </Button>
          )}
        </section>

        {!activeParentId ? (
          <EmptyState
            icon={CircleAlert}
            title="Select a parent profile"
            description="Choose a parent from the navigation bar before reviewing or recording wellbeing information."
          />
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                icon={ClipboardCheck}
                label="Today’s check-in"
                value={`${completionCount}/${TOTAL_CHECK_ITEMS}`}
                detail={
                  completionCount === TOTAL_CHECK_ITEMS
                    ? "All wellbeing items completed"
                    : `${TOTAL_CHECK_ITEMS - completionCount} items remaining`
                }
                tone="teal"
              />

              <SummaryCard
                icon={CalendarCheck2}
                label="Check-ins logged"
                value={`${checks.length}`}
                detail="During the last 14 days"
                tone="blue"
              />

              <SummaryCard
                icon={ShieldCheck}
                label="Positive days"
                value={`${positiveDays}`}
                detail="Good mood with no pain reported"
                tone="green"
              />

              <SummaryCard
                icon={Activity}
                label="Common mood"
                value={mostCommonMood}
                detail="Most frequently reported mood"
                tone="amber"
              />
            </section>

            <section className="overflow-hidden rounded-2xl border border-[#dce8e4] bg-white shadow-[0_18px_45px_-35px_rgba(15,35,57,0.4)]">
              <div className="border-b border-[#e4ece9] px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold tracking-[-0.025em] text-[#19373d]">
                        Today’s check-in
                      </h2>

                      <StatusBadge complete={completionCount === TOTAL_CHECK_ITEMS} />
                    </div>

                    <p className="mt-1 text-sm leading-5 text-[#70858a]">
                      {isChildView
                        ? "This is a read-only view of today’s wellbeing information."
                        : "Choose the option that best reflects today. Every selection is saved automatically."}
                    </p>
                  </div>

                  <div className="min-w-48">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                      <span className="text-[#6c8186]">Completion</span>
                      <span className="text-[#176963]">{completionPercent}%</span>
                    </div>
                    <Progress
                      value={completionPercent}
                      className="h-2 bg-[#e8f0ed]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-3 sm:p-6">
                <CheckInGroup
                  icon={HeartPulse}
                  title="Mood"
                  description="How are you feeling today?"
                  options={[
                    { label: "Happy", value: "Happy" },
                    { label: "Great", value: "Great" },
                    { label: "Okay", value: "Okay" },
                    { label: "Tired", value: "Tired" },
                  ]}
                  selectedValue={todayCheck?.feeling}
                  readOnly={isChildView}
                  disabled={saveCheck.isPending}
                  onSelect={(value) =>
                    saveCheck.mutate({ field: "feeling", value })
                  }
                />

                <CheckInGroup
                  icon={Zap}
                  title="Energy"
                  description="What is your energy level?"
                  options={[
                    { label: "Low", value: "Low" },
                    { label: "Medium", value: "Med" },
                    { label: "High", value: "High" },
                  ]}
                  selectedValue={todayCheck?.energy_level}
                  readOnly={isChildView}
                  disabled={saveCheck.isPending}
                  onSelect={(value) =>
                    saveCheck.mutate({ field: "energy_level", value })
                  }
                />

                <CheckInGroup
                  icon={Utensils}
                  title="Meals"
                  description="How were today’s meals?"
                  options={[
                    { label: "Completed", value: "Completed" },
                    { label: "Partially", value: "Partially" },
                    { label: "Skipped", value: "Skipped" },
                  ]}
                  selectedValue={todayCheck?.meals_logged}
                  readOnly={isChildView}
                  disabled={saveCheck.isPending}
                  onSelect={(value) =>
                    saveCheck.mutate({ field: "meals_logged", value })
                  }
                />

                <CheckInGroup
                  icon={Pill}
                  title="Medication"
                  description="Was today’s medicine taken?"
                  options={[
                    { label: "Taken", value: true },
                    { label: "Not yet", value: false },
                  ]}
                  selectedValue={todayCheck?.took_medicine}
                  readOnly={isChildView}
                  disabled={saveCheck.isPending}
                  onSelect={(value) =>
                    saveCheck.mutate({ field: "took_medicine", value })
                  }
                />

                <CheckInGroup
                  icon={Droplets}
                  title="Water intake"
                  description="How many glasses of water?"
                  options={[
                    { label: "4 glasses", value: 4 },
                    { label: "6 glasses", value: 6 },
                    { label: "8 glasses", value: 8 },
                    { label: "10 glasses", value: 10 },
                  ]}
                  selectedValue={todayCheck?.water_intake}
                  readOnly={isChildView}
                  disabled={saveCheck.isPending}
                  onSelect={(value) =>
                    saveCheck.mutate({ field: "water_intake", value })
                  }
                />

                <CheckInGroup
                  icon={Moon}
                  title="Sleep quality"
                  description="How well did you sleep?"
                  options={[
                    { label: "Poor", value: "Poor" },
                    { label: "Fair", value: "Fair" },
                    { label: "Good", value: "Good" },
                    { label: "Excellent", value: "Excellent" },
                  ]}
                  selectedValue={todayCheck?.sleep_quality}
                  readOnly={isChildView}
                  disabled={saveCheck.isPending}
                  onSelect={(value) =>
                    saveCheck.mutate({ field: "sleep_quality", value })
                  }
                />

                <CheckInGroup
                  icon={ShieldCheck}
                  title="Pain or discomfort"
                  description="Is there any pain today?"
                  options={[
                    { label: "No pain", value: false },
                    { label: "Pain reported", value: true },
                  ]}
                  selectedValue={todayCheck?.pain_status}
                  readOnly={isChildView}
                  disabled={saveCheck.isPending}
                  onSelect={(value) =>
                    saveCheck.mutate({ field: "pain_status", value })
                  }
                  className="md:col-span-2 xl:col-span-3"
                />
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-[#dce8e4] bg-white shadow-[0_18px_45px_-35px_rgba(15,35,57,0.4)]">
              <div className="flex flex-col gap-2 border-b border-[#e4ece9] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <h2 className="text-lg font-bold tracking-[-0.025em] text-[#19373d]">
                    Recent check-in history
                  </h2>
                  <p className="mt-1 text-sm text-[#70858a]">
                    A clear view of daily wellbeing over the last two weeks.
                  </p>
                </div>

                <span className="inline-flex w-fit rounded-full bg-[#edf5f2] px-3 py-1.5 text-xs font-semibold text-[#276c66]">
                  {checks.length} {checks.length === 1 ? "record" : "records"}
                </span>
              </div>

              {isLoading ? (
                <HistoryLoading />
              ) : isError ? (
                <div className="p-8">
                  <EmptyState
                    icon={CircleAlert}
                    title="Unable to load wellbeing history"
                    description="Refresh the page and try again. Your saved data has not been changed."
                    compact
                  />
                </div>
              ) : checks.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={ClipboardCheck}
                    title="No check-ins recorded yet"
                    description="Complete today’s wellbeing check-in to start building a useful daily history."
                    compact
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[940px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[#e4ece9] bg-[#f7faf9] text-[11px] font-bold uppercase tracking-[0.12em] text-[#73878c]">
                        <th className="px-6 py-4">Date</th>
                        <th className="px-4 py-4">Mood</th>
                        <th className="px-4 py-4">Energy</th>
                        <th className="px-4 py-4">Meals</th>
                        <th className="px-4 py-4">Medication</th>
                        <th className="px-4 py-4">Water</th>
                        <th className="px-4 py-4">Sleep</th>
                        <th className="px-4 py-4">Pain</th>
                        {!isChildView && (
                          <th className="px-6 py-4 text-right">Action</th>
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#e9efed]">
                      {checks.map((check) => (
                        <tr
                          key={check.id}
                          className="transition-colors hover:bg-[#fafcfb]"
                        >
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-[#203e44]">
                              {formatDate(check.check_date, "EEE, MMM d")}
                            </p>
                            <p className="mt-0.5 text-xs text-[#819397]">
                              {formatDate(check.check_date, "yyyy")}
                            </p>
                          </td>
                          <TableValue value={check.feeling} />
                          <TableValue value={normaliseEnergy(check.energy_level)} />
                          <TableValue value={check.meals_logged} />
                          <TableValue
                            value={booleanLabel(
                              check.took_medicine,
                              "Taken",
                              "Not taken",
                            )}
                            status={
                              check.took_medicine === true
                                ? "positive"
                                : check.took_medicine === false
                                  ? "warning"
                                  : "neutral"
                            }
                          />
                          <TableValue
                            value={
                              check.water_intake
                                ? `${check.water_intake} glasses`
                                : booleanLabel(
                                  check.drank_water,
                                  "Completed",
                                  "Low",
                                )
                            }
                          />
                          <TableValue value={check.sleep_quality} />
                          <TableValue
                            value={booleanLabel(
                              check.pain_status,
                              "Pain reported",
                              "No pain",
                              true,
                            )}
                            status={
                              check.pain_status === true
                                ? "danger"
                                : check.pain_status === false
                                  ? "positive"
                                  : "neutral"
                            }
                          />

                          {!isChildView && (
                            <td className="px-6 py-4 text-right">
                              <button
                                type="button"
                                className="inline-flex size-9 items-center justify-center rounded-lg border border-transparent text-[#829397] transition hover:border-[#efd0cc] hover:bg-[#fff5f4] hover:text-[#a1433e] disabled:cursor-not-allowed disabled:opacity-50"
                                title="Delete wellbeing record"
                                aria-label={`Delete wellbeing record for ${check.check_date}`}
                                disabled={
                                  removeCheck.isPending &&
                                  removeCheck.variables?.id === check.id
                                }
                                onClick={() => {
                                  const dateLabel = formatDate(
                                    check.check_date,
                                    "MMM d, yyyy",
                                  );
                                  const confirmed = window.confirm(
                                    `Delete the wellbeing record for ${dateLabel}? This action cannot be undone.`,
                                  );

                                  if (confirmed) {
                                    removeCheck.mutate({
                                      id: check.id,
                                      checkDate: check.check_date,
                                    });
                                  }
                                }}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

type SummaryTone = "teal" | "blue" | "green" | "amber";

type SummaryCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: SummaryTone;
};

function SummaryCard({ icon: Icon, label, value, detail, tone }: SummaryCardProps) {
  const tones: Record<
    SummaryTone,
    { icon: string; border: string; accent: string }
  > = {
    teal: {
      icon: "bg-[#e5f2ee] text-[#176963]",
      border: "border-[#d6e7e2]",
      accent: "bg-[#176963]",
    },
    blue: {
      icon: "bg-[#e9f0f5] text-[#426980]",
      border: "border-[#dae5eb]",
      accent: "bg-[#5d8297]",
    },
    green: {
      icon: "bg-[#e8f3eb] text-[#4a8059]",
      border: "border-[#dbe9df]",
      accent: "bg-[#5f946c]",
    },
    amber: {
      icon: "bg-[#f7eee3] text-[#a66735]",
      border: "border-[#eee0cf]",
      accent: "bg-[#bf8351]",
    },
  };

  const selectedTone = tones[tone];

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_16px_36px_-32px_rgba(15,35,57,0.45)] ${selectedTone.border}`}
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 ${selectedTone.accent}`} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#71868b]">{label}</p>
          <p className="mt-3 text-2xl font-bold tracking-[-0.04em] text-[#19373d]">
            {value}
          </p>
        </div>

        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${selectedTone.icon}`}
        >
          <Icon className="size-5" />
        </span>
      </div>

      <p className="mt-2 text-xs leading-5 text-[#829397]">{detail}</p>
    </article>
  );
}

type OptionValue = string | number | boolean;

type CheckInOption = {
  label: string;
  value: OptionValue;
};

type CheckInGroupProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  options: CheckInOption[];
  selectedValue: OptionValue | null | undefined;
  readOnly: boolean;
  disabled: boolean;
  className?: string;
  onSelect: (value: OptionValue) => void;
};

function CheckInGroup({
  icon: Icon,
  title,
  description,
  options,
  selectedValue,
  readOnly,
  disabled,
  className = "",
  onSelect,
}: CheckInGroupProps) {
  return (
    <article
      className={`rounded-2xl border border-[#dfe9e6] bg-[#fbfdfc] p-5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e6f2ee] text-[#176963]">
          <Icon className="size-4.5" />
        </span>

        <div>
          <h3 className="text-sm font-bold text-[#213e44]">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-[#7a8e92]">{description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedValue === option.value;

          return (
            <button
              key={`${title}-${String(option.value)}`}
              type="button"
              disabled={readOnly || disabled}
              onClick={() => onSelect(option.value)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9289]/35 disabled:cursor-default ${selected
                  ? "border-[#176963] bg-[#176963] text-white shadow-sm"
                  : "border-[#d6e3df] bg-white text-[#4f666b] hover:border-[#a9c7bf] hover:bg-[#f1f7f5] disabled:hover:border-[#d6e3df] disabled:hover:bg-white"
                }`}
            >
              {selected && <Check className="size-3.5" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function StatusBadge({ complete }: { complete: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${complete
          ? "bg-[#e5f2e9] text-[#39734d]"
          : "bg-[#f6eee2] text-[#9a6635]"
        }`}
    >
      <span
        className={`size-1.5 rounded-full ${complete ? "bg-[#4c9965]" : "bg-[#c1874f]"}`}
      />
      {complete ? "Complete" : "In progress"}
    </span>
  );
}

type TableStatus = "positive" | "warning" | "danger" | "neutral";

function TableValue({
  value,
  status = "neutral",
}: {
  value: string | null | undefined;
  status?: TableStatus;
}) {
  const styles: Record<TableStatus, string> = {
    positive: "bg-[#e7f2ea] text-[#477854]",
    warning: "bg-[#f7eee3] text-[#9a6635]",
    danger: "bg-[#f9e8e6] text-[#a1433e]",
    neutral: "bg-[#f1f5f3] text-[#536a6f]",
  };

  return (
    <td className="px-4 py-4">
      <span
        className={`inline-flex max-w-36 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${styles[status]}`}
      >
        {value ?? "—"}
      </span>
    </td>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-[#cdded9] bg-[#f8fbfa] text-center ${compact ? "px-6 py-10" : "px-6 py-14"
        }`}
    >
      <span className="mx-auto grid size-11 place-items-center rounded-xl bg-[#e7f2ee] text-[#176963]">
        <Icon className="size-5" />
      </span>
      <h2 className="mt-4 text-base font-bold text-[#203e44]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#72868b]">
        {description}
      </p>
    </div>
  );
}

function HistoryLoading() {
  return (
    <div className="space-y-3 p-6">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-14 animate-pulse rounded-xl bg-[#f0f5f3]"
        />
      ))}
    </div>
  );
}

function countCompletedItems(check: WellbeingCheck | undefined) {
  if (!check) return 0;

  return [
    check.feeling,
    check.energy_level,
    check.meals_logged,
    check.took_medicine,
    check.water_intake,
    check.sleep_quality,
    check.pain_status,
  ].filter((value) => value !== null && value !== undefined).length;
}

function isPositiveDay(check: WellbeingCheck) {
  const positiveMood = check.feeling === "Happy" || check.feeling === "Great";
  return positiveMood && check.pain_status === false;
}

function getMostCommonMood(checks: WellbeingCheck[]) {
  const moodCounts = checks.reduce<Record<string, number>>((counts, check) => {
    if (check.feeling) {
      counts[check.feeling] = (counts[check.feeling] ?? 0) + 1;
    }
    return counts;
  }, {});

  const [mostCommon] = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
  return mostCommon?.[0] ?? "Not available";
}

function booleanLabel(
  value: boolean | null,
  trueLabel: string,
  falseLabel: string,
  reverse = false,
) {
  if (value === null) return "—";

  if (reverse) {
    return value ? trueLabel : falseLabel;
  }

  return value ? trueLabel : falseLabel;
}

function normaliseEnergy(value: string | null) {
  if (value === "Med") return "Medium";
  return value ?? "—";
}

function formatDate(date: string, pattern: string) {
  return format(new Date(`${date}T00:00:00`), pattern);
}