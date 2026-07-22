import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useActiveParent } from "@/hooks/useProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { WellbeingCheckCard } from "@/components/WellbeingCheckCard";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wellbeing")({
  ssr: false,
  component: WellbeingPage,
});

function WellbeingPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: checks } = useQuery({
    queryKey: ["wellbeing-history", activeParentId],
    enabled: !!activeParentId,
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

  const todayCheck = checks?.find((c) => c.check_date === today);

  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: async ({ id, checkDate }: { id: string; checkDate: string }) => {
      if (isChildView) throw new Error("You do not have permission to perform this action.");
      if (!activeParentId) throw new Error("No active parent selected.");

      const { data, error } = await supabase
        .from("wellbeing_checks")
        .delete()
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Wellbeing record could not be deleted or was already removed.");
      return { id, checkDate };
    },
    onSuccess: ({ id, checkDate }) => {
      toast.success(
        `Wellbeing record for ${format(new Date(`${checkDate}T00:00:00`), "MMM d, yyyy")} deleted.`,
      );
      qc.setQueryData<any[]>(
        ["wellbeing-history", activeParentId],
        (current) => current?.filter((check) => check.id !== id) ?? [],
      );
      qc.invalidateQueries({ queryKey: ["wellbeing-history"] });
      qc.invalidateQueries({ queryKey: ["wellbeing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      if (isChildView) throw new Error("You do not have permission to perform this action.");
      const { error } = await supabase
        .from("wellbeing_checks")
        .delete()
        .eq("parent_id", activeParentId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All wellbeing records cleared.");
      qc.setQueryData(["wellbeing-history", activeParentId], []);
      qc.invalidateQueries({ queryKey: ["wellbeing-history"] });
      qc.invalidateQueries({ queryKey: ["wellbeing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold italic">Wellbeing</h1>
          <p className="text-muted-foreground mt-1">
            Daily check-ins from {activeParent?.full_name ?? "—"} · last 14 days
          </p>
        </div>
        {!isChildView && activeParentId && checks && checks.length > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              if (
                confirm(
                  "Are you sure you want to delete ALL wellbeing checks? This action cannot be undone.",
                )
              ) {
                clearAll.mutate();
              }
            }}
            disabled={clearAll.isPending}
            className="rounded-xl text-destructive hover:bg-destructive/5 hover:text-destructive border-destructive/20"
          >
            <Trash2 className="size-4 mr-2" />
            Delete All
          </Button>
        )}
      </div>

      {activeParentId && (
        <div className="mb-8">
          <WellbeingCheckCard
            parentId={activeParentId}
            isChild={isChildView}
            existing={todayCheck}
          />
        </div>
      )}

      <div className="bg-card border border-border rounded-3xl overflow-hidden">
        {!checks || checks.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No check-ins logged yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {checks.map((c) => (
              <div key={c.id} className="p-6 grid grid-cols-2 sm:grid-cols-6 gap-4 items-center">
                <div>
                  <p className="font-display text-lg font-bold">
                    {format(new Date(`${c.check_date}T00:00:00`), "EEE, MMM d")}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground uppercase">
                    {c.check_date}
                  </p>
                </div>
                <Pill label="Energy" value={c.energy_level} />
                <Pill label="Feeling" value={c.feeling} />
                <Pill
                  label="Meals"
                  value={c.ate_meals === true ? "Yes" : c.ate_meals === false ? "No" : "—"}
                />
                <Pill
                  label="Water"
                  value={c.drank_water === true ? "Yes" : c.drank_water === false ? "No" : "—"}
                />
                {!isChildView && (
                  <div className="flex justify-end sm:justify-center col-span-2 sm:col-span-1">
                    <button
                      onClick={() => {
                        const dateLabel = format(
                          new Date(`${c.check_date}T00:00:00`),
                          "MMM d, yyyy",
                        );
                        if (
                          confirm(
                            `Delete the wellbeing record for ${dateLabel}? This action cannot be undone.`,
                          )
                        ) {
                          remove.mutate({ id: c.id, checkDate: c.check_date });
                        }
                      }}
                      disabled={remove.isPending && remove.variables?.id === c.id}
                      className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                      title="Delete wellbeing record"
                      aria-label={`Delete wellbeing record for ${c.check_date}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Pill({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold mt-1">{value ?? "—"}</p>
    </div>
  );
}
