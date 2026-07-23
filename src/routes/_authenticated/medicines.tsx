import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  Edit3,
  Info,
  MoreHorizontal,
  Phone,
  Pill,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TimeInput } from "@/components/ui/datetime-input";
import {
  Dialog,
  DialogContent,
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
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/medicines")({
  ssr: false,
  component: MedicinesPage,
});

type MedForm = {
  name: string;
  dosage: string;
  period: string;
  schedule_time: string;
  duration: string;
  notes: string;
};

type PeriodFilter = "all" | "morning" | "noon" | "evening" | "night";

const EMPTY_FORM: MedForm = {
  name: "",
  dosage: "",
  period: "morning",
  schedule_time: "08:00",
  duration: "",
  notes: "",
};

const periodMeta: Record<
  string,
  { label: string; badge: string; icon: string; dot: string }
> = {
  morning: {
    label: "Morning",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    icon: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  noon: {
    label: "Afternoon",
    badge: "border-sky-200 bg-sky-50 text-sky-800",
    icon: "bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
  evening: {
    label: "Evening",
    badge: "border-violet-200 bg-violet-50 text-violet-800",
    icon: "bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
  },
  night: {
    label: "Night",
    badge: "border-slate-200 bg-slate-100 text-slate-700",
    icon: "bg-slate-100 text-slate-700",
    dot: "bg-slate-500",
  },
};

function formatMedicineTime(value: string | null) {
  if (!value) return "Time not set";

  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value.slice(0, 5);

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return format(date, "h:mm a");
}

function MedicinesPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Tables<"medicines"> | null>(null);
  const [form, setForm] = useState<MedForm>(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState("");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: meds, isLoading: medicinesLoading } = useQuery({
    queryKey: ["medicines-all", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicines")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("schedule_time");

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: takenToday } = useQuery({
    queryKey: ["medLogs", activeParentId, today],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("medicine_logs")
        .select("medicine_id")
        .eq("parent_id", activeParentId!)
        .eq("log_date", today);

      return new Set((data ?? []).map((log) => log.medicine_id));
    },
  });

  const filteredMedicines = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return (meds ?? []).filter((medicine) => {
      const matchesSearch =
        !normalizedSearch ||
        medicine.name.toLowerCase().includes(normalizedSearch) ||
        medicine.dosage.toLowerCase().includes(normalizedSearch) ||
        medicine.notes?.toLowerCase().includes(normalizedSearch);

      const matchesPeriod = periodFilter === "all" || medicine.period === periodFilter;
      return matchesSearch && matchesPeriod;
    });
  }, [meds, periodFilter, searchTerm]);

  const summary = useMemo(() => {
    const total = meds?.length ?? 0;
    const taken = meds?.filter((medicine) => takenToday?.has(medicine.id)).length ?? 0;
    const pending = Math.max(total - taken, 0);
    const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;

    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const pendingMedicines = (meds ?? []).filter((medicine) => !takenToday?.has(medicine.id));

    const nextMedicine =
      pendingMedicines.find((medicine) => {
        const [hours, minutes] = (medicine.schedule_time ?? "00:00")
          .slice(0, 5)
          .split(":")
          .map(Number);
        return hours * 60 + minutes >= currentMinutes;
      }) ?? pendingMedicines[0];

    return { total, taken, pending, adherence, nextMedicine };
  }, [meds, takenToday]);

  function validateForm(): boolean {
    if (!form.name.trim()) {
      toast.error("Please enter a medication name.");
      return false;
    }

    if (!form.dosage.trim()) {
      toast.error("Please enter a dosage.");
      return false;
    }

    if (!form.schedule_time) {
      toast.error("Please enter a valid time.");
      return false;
    }

    return true;
  }

  const add = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error("You do not have permission to perform this action.");
      }
      if (!validateForm()) throw new Error("__validation__");

      const { error } = await supabase.from("medicines").insert({
        parent_id: activeParentId!,
        name: form.name.trim(),
        dosage: form.dosage.trim(),
        period: form.period as "morning" | "noon" | "evening" | "night",
        schedule_time: form.schedule_time,
        duration: form.duration.trim() || null,
        notes: form.notes.trim() || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Medication added successfully.");
      setOpen(false);
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ["medicines-all"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["global_meds"] });
    },
    onError: (error: Error) => {
      if (error.message !== "__validation__") toast.error(error.message);
    },
  });

  const edit = useMutation({
    mutationFn: async (medId: string) => {
      if (isChildView) {
        throw new Error("You do not have permission to perform this action.");
      }
      if (!validateForm()) throw new Error("__validation__");

      const { data: existing } = await supabase
        .from("medicines")
        .select("id")
        .eq("id", medId)
        .maybeSingle();

      if (!existing) throw new Error("Medication not found.");

      const { error } = await supabase
        .from("medicines")
        .update({
          name: form.name.trim(),
          dosage: form.dosage.trim(),
          period: form.period as "morning" | "noon" | "evening" | "night",
          schedule_time: form.schedule_time,
          duration: form.duration.trim() || null,
          notes: form.notes.trim() || null,
        })
        .eq("id", medId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Medication updated successfully.");
      setOpen(false);
      setEditingMed(null);
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ["medicines-all"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["global_meds"] });
    },
    onError: (error: Error) => {
      if (error.message !== "__validation__") toast.error(error.message);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView) {
        throw new Error("You do not have permission to perform this action.");
      }
      if (!activeParentId) throw new Error("No active parent selected.");

      const { data, error } = await supabase
        .from("medicines")
        .delete()
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Medication could not be deleted or was already removed.");
      return id;
    },
    onSuccess: (deletedId) => {
      toast.success("Medication removed.");
      queryClient.setQueryData<Tables<"medicines">[]>(
        ["medicines-all", activeParentId],
        (current) => current?.filter((medicine) => medicine.id !== deletedId) ?? [],
      );
      queryClient.invalidateQueries({ queryKey: ["medicines-all"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["global_meds"] });
      queryClient.invalidateQueries({ queryKey: ["medLogs"] });
      queryClient.invalidateQueries({ queryKey: ["global_taken_meds"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error("You do not have permission to perform this action.");
      }

      const { error } = await supabase
        .from("medicines")
        .delete()
        .eq("parent_id", activeParentId!);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All medications removed.");
      queryClient.invalidateQueries({ queryKey: ["medicines-all"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["global_meds"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const markTaken = useMutation({
    mutationFn: async (medId: string) => {
      if (isChildView) {
        throw new Error("You do not have permission to perform this action.");
      }

      const { error } = await supabase.from("medicine_logs").insert({
        medicine_id: medId,
        parent_id: activeParentId!,
        log_date: today,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as taken.");
      queryClient.invalidateQueries({ queryKey: ["medLogs"] });
      queryClient.invalidateQueries({ queryKey: ["global_taken_meds"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendReminder = useMutation({
    mutationFn: async (medName: string) => {
      if (!user || !activeParentId) throw new Error("Not ready");

      const { error } = await (supabase as any).from("parent_notifications").insert({
        parent_id: activeParentId,
        sender_id: user.id,
        type: "reminder",
        message: `Medication reminder: Please take your ${medName}.`,
      });

      if (error) throw error;
    },
    onSuccess: () => toast.success("Reminder sent successfully."),
    onError: () => toast.error("Unable to send reminder. Please try again."),
  });

  const callParent = useMutation({
    mutationFn: async () => {
      if (!user || !activeParentId) throw new Error("Not ready");

      const { error } = await (supabase as any).from("parent_notifications").insert({
        parent_id: activeParentId,
        sender_id: user.id,
        type: "call",
        message: "Your family member is trying to reach you regarding medication.",
      });

      if (error) throw error;
    },
    onSuccess: () => toast.success("Call alert sent to parent successfully."),
    onError: () => toast.error("Unable to send call alert. Please try again."),
  });

  function openAdd() {
    setEditingMed(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(medicine: Tables<"medicines">) {
    setEditingMed(medicine);
    setForm({
      name: medicine.name,
      dosage: medicine.dosage,
      period: medicine.period,
      schedule_time: medicine.schedule_time?.slice(0, 5) ?? "08:00",
      duration: medicine.duration ?? "",
      notes: medicine.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1500px] space-y-6 pb-8">
        <section className="flex flex-col gap-5 rounded-[28px] border border-[#dfe9e6] bg-white px-5 py-6 shadow-[0_16px_50px_-38px_rgba(15,35,57,0.35)] sm:px-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e5f1ed] text-[#0d6b68]">
              <Pill className="size-6" strokeWidth={2} />
            </span>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0d7774]">
                Care management
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-[-0.035em] text-[#132f35] sm:text-3xl">
                Medication schedule
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6a7f84]">
                Manage daily medicines, monitor adherence and keep the care circle informed for{" "}
                <span className="font-semibold text-[#2e555b]">
                  {activeParent?.full_name ?? "the selected profile"}
                </span>
                .
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isChildView && activeParentId && (
              <>
                <Button
                  variant="outline"
                  onClick={() => callParent.mutate()}
                  disabled={callParent.isPending}
                  className="h-11 rounded-xl border-[#cadbd6] bg-white px-4 font-semibold text-[#31545a] hover:bg-[#f2f7f5]"
                >
                  <Phone className="mr-2 size-4" />
                  {callParent.isPending ? "Sending…" : "Call parent"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => sendReminder.mutate("their medication")}
                  disabled={sendReminder.isPending}
                  className="h-11 rounded-xl border-[#cadbd6] bg-white px-4 font-semibold text-[#31545a] hover:bg-[#f2f7f5]"
                >
                  <Bell className="mr-2 size-4" />
                  {sendReminder.isPending ? "Sending…" : "Send reminder"}
                </Button>
              </>
            )}

            {!isChildView && activeParentId && (
              <>
                {meds && meds.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete all medications? This action cannot be undone.",
                        )
                      ) {
                        clearAll.mutate();
                      }
                    }}
                    disabled={clearAll.isPending}
                    className="h-11 rounded-xl border-red-200 bg-white px-4 font-semibold text-red-700 hover:bg-red-50 hover:text-red-800"
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete all
                  </Button>
                )}

                <Dialog
                  open={open}
                  onOpenChange={(nextOpen) => {
                    setOpen(nextOpen);
                    if (!nextOpen) {
                      setEditingMed(null);
                      setForm(EMPTY_FORM);
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      onClick={openAdd}
                      className="h-11 rounded-xl bg-[#0d6665] px-5 font-semibold text-white shadow-[0_12px_26px_-16px_rgba(13,102,101,0.85)] hover:bg-[#0a5958]"
                    >
                      <Plus className="mr-2 size-4" />
                      Add medication
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-w-xl overflow-hidden rounded-[24px] border-[#dfe9e6] p-0">
                    <DialogHeader className="border-b border-[#e5ecea] bg-[#f7faf9] px-6 py-5 text-left">
                      <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-xl bg-[#e5f1ed] text-[#0d6b68]">
                          {editingMed ? <Edit3 className="size-5" /> : <Plus className="size-5" />}
                        </span>
                        <div>
                          <DialogTitle className="text-xl font-bold tracking-[-0.025em] text-[#18363c]">
                            {editingMed ? "Edit medication" : "Add medication"}
                          </DialogTitle>
                          <p className="mt-1 text-sm text-[#71858a]">
                            Enter the dosage and schedule exactly as prescribed.
                          </p>
                        </div>
                      </div>
                    </DialogHeader>

                    <div className="space-y-5 px-6 py-6">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="medicine-name" className="text-sm font-semibold text-[#28494f]">
                            Medication name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="medicine-name"
                            value={form.name}
                            onChange={(event) => setForm({ ...form, name: event.target.value })}
                            placeholder="For example, Metformin"
                            className="h-11 rounded-xl border-[#cfddd9] bg-white"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="medicine-dosage" className="text-sm font-semibold text-[#28494f]">
                            Dosage <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="medicine-dosage"
                            value={form.dosage}
                            onChange={(event) => setForm({ ...form, dosage: event.target.value })}
                            placeholder="For example, 500 mg"
                            className="h-11 rounded-xl border-[#cfddd9] bg-white"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-[#28494f]">Duration</Label>
                          <Select
                            value={form.duration}
                            onValueChange={(value) => setForm({ ...form, duration: value })}
                          >
                            <SelectTrigger className="h-11 rounded-xl border-[#cfddd9] bg-white">
                              <SelectValue placeholder="Select duration" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1 week">1 week</SelectItem>
                              <SelectItem value="2 weeks">2 weeks</SelectItem>
                              <SelectItem value="1 month">1 month</SelectItem>
                              <SelectItem value="3 months">3 months</SelectItem>
                              <SelectItem value="6 months">6 months</SelectItem>
                              <SelectItem value="1 year">1 year</SelectItem>
                              <SelectItem value="Indefinite">Indefinite</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-[#28494f]">Time of day</Label>
                          <Select
                            value={form.period}
                            onValueChange={(value) => setForm({ ...form, period: value })}
                          >
                            <SelectTrigger className="h-11 rounded-xl border-[#cfddd9] bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="morning">Morning</SelectItem>
                              <SelectItem value="noon">Afternoon</SelectItem>
                              <SelectItem value="evening">Evening</SelectItem>
                              <SelectItem value="night">Night</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-[#28494f]">
                            Scheduled time <span className="text-red-500">*</span>
                          </Label>
                          <TimeInput
                            value={form.schedule_time}
                            onChange={(value) => setForm({ ...form, schedule_time: value })}
                            placeholder="HH:MM"
                          />
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="medicine-notes" className="text-sm font-semibold text-[#28494f]">
                            Instructions or notes
                          </Label>
                          <Textarea
                            id="medicine-notes"
                            value={form.notes}
                            onChange={(event) => setForm({ ...form, notes: event.target.value })}
                            placeholder="For example, take after breakfast"
                            rows={3}
                            className="resize-none rounded-xl border-[#cfddd9] bg-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-[#dce9e5] bg-[#f3f8f6] p-4">
                        <Info className="mt-0.5 size-4 shrink-0 text-[#0d7774]" />
                        <p className="text-xs leading-5 text-[#5f777c]">
                          Always verify medicine details against the latest prescription before saving.
                        </p>
                      </div>
                    </div>

                    <DialogFooter className="border-t border-[#e5ecea] bg-[#fbfcfc] px-6 py-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                        className="h-10 rounded-xl border-[#cadbd6] px-5"
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={add.isPending || edit.isPending}
                        onClick={() => {
                          if (editingMed) edit.mutate(editingMed.id);
                          else add.mutate();
                        }}
                        className="h-10 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
                      >
                        {add.isPending || edit.isPending
                          ? "Saving…"
                          : editingMed
                            ? "Save changes"
                            : "Add medication"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </section>

        {isChildView && (
          <section className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-sky-700" />
            <div>
              <p className="font-semibold">Read-only family view</p>
              <p className="mt-1 leading-5 text-sky-800/80">
                You are viewing {activeParent?.full_name ?? "this profile"}&apos;s medication plan.
                You can send reminders or a call alert, but only the parent can edit the schedule.
              </p>
            </div>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Scheduled medicines"
            value={String(summary.total)}
            detail="Active in the current plan"
            icon={Pill}
            tone="teal"
          />
          <SummaryCard
            label="Taken today"
            value={String(summary.taken)}
            detail={`${summary.adherence}% daily adherence`}
            icon={CheckCircle2}
            tone="green"
          />
          <SummaryCard
            label="Still pending"
            value={String(summary.pending)}
            detail={summary.pending === 1 ? "1 dose needs attention" : `${summary.pending} doses need attention`}
            icon={AlertCircle}
            tone="orange"
          />
          <SummaryCard
            label="Next scheduled dose"
            value={
              summary.nextMedicine
                ? formatMedicineTime(summary.nextMedicine.schedule_time)
                : "All complete"
            }
            detail={summary.nextMedicine?.name ?? "No pending medicine"}
            icon={Clock3}
            tone="slate"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="overflow-hidden rounded-[26px] border border-[#dfe9e6] bg-white shadow-[0_16px_50px_-40px_rgba(15,35,57,0.3)]">
            <div className="flex flex-col gap-4 border-b border-[#e5ecea] px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-[-0.025em] text-[#18363c]">
                  Today&apos;s medication plan
                </h2>
                <p className="mt-1 text-sm text-[#74878c]">
                  Review every scheduled dose and update its status.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 sm:w-64">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#819397]" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search medicines"
                    className="h-10 rounded-xl border-[#d3dfdc] bg-[#f9fbfa] pl-10"
                  />
                </div>

                <Select
                  value={periodFilter}
                  onValueChange={(value) => setPeriodFilter(value as PeriodFilter)}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl border-[#d3dfdc] bg-[#f9fbfa] sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All periods</SelectItem>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="noon">Afternoon</SelectItem>
                    <SelectItem value="evening">Evening</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {medicinesLoading ? (
              <div className="space-y-3 p-5 sm:p-6">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-28 animate-pulse rounded-2xl border border-[#e5ecea] bg-[#f4f7f6]"
                  />
                ))}
              </div>
            ) : !meds || meds.length === 0 ? (
              <EmptyMedicines isChildView={isChildView} onAdd={openAdd} />
            ) : filteredMedicines.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Search className="mx-auto size-8 text-[#9babad]" />
                <h3 className="mt-4 text-base font-bold text-[#28484e]">No matching medicines</h3>
                <p className="mt-2 text-sm text-[#788b90]">
                  Try another medicine name or change the selected time period.
                </p>
              </div>
            ) : (
              <div className="space-y-3 p-4 sm:p-5">
                {filteredMedicines.map((medicine) => {
                  const taken = takenToday?.has(medicine.id) ?? false;
                  const meta = periodMeta[medicine.period] ?? periodMeta.night;

                  return (
                    <article
                      key={medicine.id}
                      className={`group rounded-2xl border p-4 transition sm:p-5 ${taken
                          ? "border-emerald-200 bg-emerald-50/35"
                          : "border-[#dfe8e5] bg-white hover:border-[#bdd2cc] hover:shadow-[0_14px_30px_-26px_rgba(15,35,57,0.45)]"
                        }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                        <div className="flex min-w-0 flex-1 items-start gap-4">
                          <span
                            className={`grid size-12 shrink-0 place-items-center rounded-2xl ${taken ? "bg-emerald-100 text-emerald-700" : meta.icon
                              }`}
                          >
                            {taken ? (
                              <CheckCircle2 className="size-5" />
                            ) : (
                              <Pill className="size-5" />
                            )}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <h3 className="truncate text-base font-bold text-[#18363c] sm:text-lg">
                                {medicine.name}
                              </h3>
                              <Badge
                                variant="outline"
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.badge}`}
                              >
                                <span className={`mr-1.5 size-1.5 rounded-full ${meta.dot}`} />
                                {meta.label}
                              </Badge>
                              {taken && (
                                <Badge className="rounded-full border-0 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100">
                                  <Check className="mr-1 size-3" />
                                  Taken
                                </Badge>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#657b80]">
                              <span className="font-semibold text-[#36575d]">{medicine.dosage}</span>
                              <span className="inline-flex items-center gap-1.5">
                                <Clock3 className="size-4 text-[#799095]" />
                                {formatMedicineTime(medicine.schedule_time)}
                              </span>
                              {medicine.duration && (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="size-1.5 rounded-full bg-[#9cb0ae]" />
                                  {medicine.duration}
                                </span>
                              )}
                            </div>

                            {medicine.notes && (
                              <p className="mt-3 max-w-3xl rounded-lg bg-[#f5f8f7] px-3 py-2 text-xs leading-5 text-[#6d8186]">
                                {medicine.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 border-t border-[#e6ecea] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                          {!isChildView && !taken && (
                            <Button
                              size="sm"
                              disabled={markTaken.isPending}
                              onClick={() => markTaken.mutate(medicine.id)}
                              className="h-9 rounded-xl bg-[#0d6665] px-4 text-xs font-semibold text-white hover:bg-[#0a5958]"
                            >
                              <Check className="mr-1.5 size-3.5" />
                              Mark as taken
                            </Button>
                          )}

                          {isChildView && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={sendReminder.isPending}
                              onClick={() => sendReminder.mutate(medicine.name)}
                              className="h-9 rounded-xl border-[#c8dad5] px-4 text-xs font-semibold text-[#31565c]"
                            >
                              <Bell className="mr-1.5 size-3.5" />
                              Remind
                            </Button>
                          )}

                          {!isChildView && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(medicine)}
                                className="grid size-9 place-items-center rounded-xl border border-[#dbe6e2] bg-white text-[#567076] transition hover:border-[#b9d0ca] hover:bg-[#f2f7f5] hover:text-[#0d6665]"
                                title="Edit medication"
                                aria-label={`Edit ${medicine.name}`}
                              >
                                <Edit3 className="size-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete medication “${medicine.name}”? This action cannot be undone.`,
                                    )
                                  ) {
                                    remove.mutate(medicine.id);
                                  }
                                }}
                                disabled={remove.isPending && remove.variables === medicine.id}
                                className="grid size-9 place-items-center rounded-xl border border-[#f0d6d6] bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                title="Delete medication"
                                aria-label={`Delete ${medicine.name}`}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="space-y-5">
            <section className="rounded-[24px] border border-[#dfe9e6] bg-white p-5 shadow-[0_16px_45px_-38px_rgba(15,35,57,0.35)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7a9095]">
                    Today&apos;s progress
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-[-0.045em] text-[#17343a]">
                    {summary.adherence}%
                  </p>
                </div>
                <span className="grid size-11 place-items-center rounded-2xl bg-[#e4f2ec] text-[#15705f]">
                  <CheckCircle2 className="size-5" />
                </span>
              </div>

              <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-[#e7eeec]">
                <div
                  className="h-full rounded-full bg-[#0d7774] transition-all duration-500"
                  style={{ width: `${summary.adherence}%` }}
                />
              </div>

              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="font-semibold text-[#5d7479]">
                  {summary.taken} completed
                </span>
                <span className="text-[#7b8f93]">{summary.pending} remaining</span>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dfe9e6] bg-[#0d3f45] p-5 text-white shadow-[0_18px_45px_-30px_rgba(13,63,69,0.6)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9dc6bd]">
                    Next dose
                  </p>
                  <h2 className="mt-3 text-xl font-bold tracking-[-0.03em]">
                    {summary.nextMedicine?.name ?? "Schedule complete"}
                  </h2>
                  <p className="mt-1 text-sm text-white/65">
                    {summary.nextMedicine?.dosage ?? "No pending medicine today"}
                  </p>
                </div>
                <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-[#a6d5c8]">
                  <Clock3 className="size-5" />
                </span>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/7 px-4 py-4">
                <p className="text-xs text-white/55">Scheduled time</p>
                <p className="mt-1 text-2xl font-bold tracking-[-0.035em]">
                  {summary.nextMedicine
                    ? formatMedicineTime(summary.nextMedicine.schedule_time)
                    : "—"}
                </p>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dfe9e6] bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-[#f7e9df] text-[#ba6538]">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-[#25454b]">Medication safety</h2>
                  <p className="mt-0.5 text-xs text-[#7a8e92]">Keep the schedule accurate</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  "Confirm dosage against the prescription.",
                  "Record each dose only after it is taken.",
                  "Contact a clinician before changing the plan.",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-xs leading-5 text-[#60777c]">
                    <span className="mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-[#e5f1ed] text-[#0d7774]">
                      <Check className="size-2.5" />
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

type SummaryCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: typeof Pill;
  tone: "teal" | "green" | "orange" | "slate";
};

function SummaryCard({ label, value, detail, icon: Icon, tone }: SummaryCardProps) {
  const toneClasses = {
    teal: "bg-[#e5f1ed] text-[#0d706d]",
    green: "bg-emerald-50 text-emerald-700",
    orange: "bg-orange-50 text-orange-700",
    slate: "bg-slate-100 text-slate-700",
  } as const;

  return (
    <article className="rounded-[22px] border border-[#dfe9e6] bg-white p-5 shadow-[0_14px_40px_-36px_rgba(15,35,57,0.4)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#74888c]">{label}</p>
          <p className="mt-3 truncate text-2xl font-bold tracking-[-0.04em] text-[#17343a]">
            {value}
          </p>
          <p className="mt-1 truncate text-xs text-[#819397]">{detail}</p>
        </div>
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClasses[tone]}`}>
          <Icon className="size-5" />
        </span>
      </div>
    </article>
  );
}

type EmptyMedicinesProps = {
  isChildView: boolean;
  onAdd: () => void;
};

function EmptyMedicines({ isChildView, onAdd }: EmptyMedicinesProps) {
  return (
    <div className="px-6 py-16 text-center sm:py-20">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e8f2ef] text-[#0d706d]">
        <Pill className="size-7" />
      </span>
      <h3 className="mt-5 text-lg font-bold tracking-[-0.025em] text-[#234248]">
        No medications scheduled
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#778b90]">
        {isChildView
          ? "There are no medicines in the selected parent’s active care plan."
          : "Add the first prescription to start building a clear daily medication routine."}
      </p>

      {!isChildView && (
        <Button
          onClick={onAdd}
          className="mt-6 h-10 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
        >
          <Plus className="mr-2 size-4" />
          Add first medication
        </Button>
      )}
    </div>
  );
}