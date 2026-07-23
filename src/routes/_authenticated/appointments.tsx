import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bell,
  BellOff,
  Calendar as CalendarIcon,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  Clock,
  Info,
  List,
  MapPin,
  Pencil,
  Plus,
  ShieldAlert,
  Stethoscope,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Calendar as UI_Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateInput, TimeInput } from "@/components/ui/datetime-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActiveParent } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/appointments")({
  ssr: false,
  component: AppointmentsPage,
});

type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "scheduled"
  | "completed"
  | "cancelled";

type AppointmentRow = {
  id: string;
  parent_id: string;
  title: string;
  doctor_name: string;
  specialty: string | null;
  location: string | null;
  scheduled_at: string;
  status: AppointmentStatus;
  notes: string | null;
  appointment_date: string;
  appointment_time: string | null;
  reminder_enabled: boolean;
  created_at: string;
  updated_at: string;
};

function AppointmentsPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] =
    useState<AppointmentRow | null>(null);
  const [title, setTitle] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [location, setLocation] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [notes, setNotes] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(),
  );

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["appointments", activeParentId],
    enabled: Boolean(activeParentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []) as AppointmentRow[];
    },
  });

  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.appointment_date >= today)
        .sort(compareAppointmentsAscending),
    [appointments, today],
  );

  const pastAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.appointment_date < today)
        .sort(compareAppointmentsDescending),
    [appointments, today],
  );

  const activeUpcomingAppointments = useMemo(
    () =>
      upcomingAppointments.filter(
        (appointment) => appointment.status !== "cancelled",
      ),
    [upcomingAppointments],
  );

  const upcomingCount = activeUpcomingAppointments.length;

  const todayCount = activeUpcomingAppointments.filter(
    (appointment) => appointment.appointment_date === today,
  ).length;

  const remindersCount = activeUpcomingAppointments.filter(
    (appointment) => appointment.reminder_enabled,
  ).length;

  const nextAppointment = activeUpcomingAppointments[0] ?? null;

  const appointmentDates = appointments
    .filter((appointment) => appointment.status !== "cancelled")
    .map((appointment) => appointment.appointment_date);

  const selectedDateValue = selectedDate
    ? format(selectedDate, "yyyy-MM-dd")
    : "";

  const selectedDayAppointments = appointments
    .filter(
      (appointment) => appointment.appointment_date === selectedDateValue,
    )
    .sort(compareAppointmentsAscending);

  const calendarModifiers = {
    hasAppointment: (date: Date) =>
      appointmentDates.includes(format(date, "yyyy-MM-dd")),
  };

  const calendarModifierClasses = {
    hasAppointment:
      "relative font-bold text-[#0d6665] after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-[#0d7774]",
  };

  const addAppointment = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error("You do not have permission to modify appointments.");
      }

      const scheduledAt = createScheduledAt(
        appointmentDate,
        appointmentTime,
      );

      const { error } = await supabase.from("appointments").insert({
        parent_id: activeParentId!,
        title: title.trim(),
        doctor_name: doctorName.trim(),
        specialty: specialty.trim() || null,
        location: location.trim() || null,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime || null,
        scheduled_at: scheduledAt,
        notes: notes.trim() || null,
        reminder_enabled: reminderEnabled,
        status: "pending",
      });

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Appointment added");
      closeDialog();
      invalidateAppointmentQueries(queryClient);
    },
    onError: (error: Error) => {
      if (error.message === "Invalid date/time") {
        toast.error("Please enter a valid date and time");
        return;
      }

      toast.error("Unable to save the appointment. Please try again.");
    },
  });

  const updateAppointment = useMutation({
    mutationFn: async (appointmentId: string) => {
      if (isChildView) {
        throw new Error("You do not have permission to modify appointments.");
      }

      const exists = appointments.some(
        (appointment) => appointment.id === appointmentId,
      );

      if (!exists) {
        throw new Error("Appointment not found");
      }

      const scheduledAt = createScheduledAt(
        appointmentDate,
        appointmentTime,
      );

      const { error } = await supabase
        .from("appointments")
        .update({
          title: title.trim(),
          doctor_name: doctorName.trim(),
          specialty: specialty.trim() || null,
          location: location.trim() || null,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime || null,
          scheduled_at: scheduledAt,
          notes: notes.trim() || null,
          reminder_enabled: reminderEnabled,
        })
        .eq("id", appointmentId);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Appointment updated");
      closeDialog();
      invalidateAppointmentQueries(queryClient);
    },
    onError: (error: Error) => {
      if (error.message === "Appointment not found") {
        toast.error("Appointment not found");
        return;
      }

      if (error.message === "Invalid date/time") {
        toast.error("Please enter a valid date and time");
        return;
      }

      toast.error("Unable to save the appointment. Please try again.");
    },
  });

  const deleteAppointment = useMutation({
    mutationFn: async (appointmentId: string) => {
      if (isChildView) {
        throw new Error("You do not have permission to modify appointments.");
      }

      if (!activeParentId) {
        throw new Error("No active parent selected.");
      }

      const { data, error } = await supabase
        .from("appointments")
        .delete()
        .eq("id", appointmentId)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "The appointment could not be deleted or was already removed.",
        );
      }

      return appointmentId;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData<AppointmentRow[]>(
        ["appointments", activeParentId],
        (currentAppointments) =>
          currentAppointments?.filter(
            (appointment) => appointment.id !== deletedId,
          ) ?? [],
      );

      toast.success("Appointment deleted");
      invalidateAppointmentQueries(queryClient);
    },
    onError: (error: Error) => {
      toast.error(
        error.message || "Unable to delete the appointment. Please try again.",
      );
    },
  });

  const deleteAllAppointments = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error("You do not have permission to modify appointments.");
      }

      const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("parent_id", activeParentId!);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("All appointments deleted");
      invalidateAppointmentQueries(queryClient);
    },
    onError: () => {
      toast.error("Unable to clear appointments. Please try again.");
    },
  });

  function resetForm() {
    setTitle("");
    setDoctorName("");
    setSpecialty("");
    setLocation("");
    setAppointmentDate("");
    setAppointmentTime("");
    setNotes("");
    setReminderEnabled(false);
  }

  function closeDialog() {
    setOpen(false);
    setEditingAppointment(null);
    resetForm();
  }

  function openCreateDialog() {
    if (isChildView) {
      toast.error("You do not have permission to modify appointments.");
      return;
    }

    setEditingAppointment(null);
    resetForm();
    setOpen(true);
  }

  function openEditDialog(appointment: AppointmentRow) {
    if (isChildView) {
      toast.error("You do not have permission to modify appointments.");
      return;
    }

    const exists = appointments.some(
      (currentAppointment) => currentAppointment.id === appointment.id,
    );

    if (!exists) {
      toast.error("Appointment not found");
      return;
    }

    setEditingAppointment(appointment);
    setTitle(appointment.title);
    setDoctorName(appointment.doctor_name);
    setSpecialty(appointment.specialty ?? "");
    setLocation(appointment.location ?? "");
    setAppointmentDate(appointment.appointment_date);
    setAppointmentTime(appointment.appointment_time?.slice(0, 5) ?? "");
    setNotes(appointment.notes ?? "");
    setReminderEnabled(appointment.reminder_enabled);
    setOpen(true);
  }

  function confirmDeleteAppointment(appointment: AppointmentRow) {
    if (isChildView) {
      toast.error("You do not have permission to modify appointments.");
      return;
    }

    const confirmed = window.confirm(
      `Delete appointment "${appointment.title}"? This action cannot be undone.`,
    );

    if (confirmed) {
      deleteAppointment.mutate(appointment.id);
    }
  }

  function validateForm() {
    if (isChildView) {
      toast.error("You do not have permission to modify appointments.");
      return false;
    }

    if (!title.trim()) {
      toast.error("Appointment title is required");
      return false;
    }

    if (!doctorName.trim()) {
      toast.error("Doctor or hospital name is required");
      return false;
    }

    if (!appointmentDate) {
      toast.error("Appointment date is required");
      return false;
    }

    if (!appointmentTime) {
      toast.error("Appointment time is required for the alarm");
      return false;
    }

    return true;
  }

  function submitAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (editingAppointment) {
      updateAppointment.mutate(editingAppointment.id);
      return;
    }

    addAppointment.mutate();
  }

  async function handleReminderChange(enabled: boolean) {
    setReminderEnabled(enabled);

    if (
      !enabled ||
      typeof window === "undefined" ||
      !("Notification" in window)
    ) {
      return;
    }

    if (window.Notification.permission === "default") {
      const permission = await window.Notification.requestPermission();

      if (permission === "granted") {
        toast.success("Browser appointment notifications enabled");
      } else {
        toast.info(
          "Browser notifications are blocked. The in-app appointment alarm will still work.",
        );
      }

      return;
    }

    if (window.Notification.permission === "denied") {
      toast.info(
        "Browser notifications are blocked. The in-app appointment alarm will still work.",
      );
    }
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-10">
        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)]">
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-7">
            <div className="max-w-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#e8f3ef] px-3 py-1.5 text-xs font-bold text-[#176f69]">
                  <CalendarCheck2 className="size-3.5" />
                  Care schedule
                </span>

                {isChildView && (
                  <span className="rounded-full border border-[#d8e5e1] bg-[#f7faf9] px-3 py-1.5 text-xs font-semibold text-[#647b80]">
                    Read-only family view
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#122f35] sm:text-4xl">
                Appointments
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[#667d82] sm:text-base">
                Plan clinical visits, keep important details together and stay
                prepared for upcoming care for{" "}
                <span className="font-semibold text-[#294b50]">
                  {activeParent?.full_name ?? "the selected profile"}
                </span>
                .
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {!isChildView &&
                activeParentId &&
                appointments.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={deleteAllAppointments.isPending}
                    className="h-11 rounded-xl border-[#e0cbc7] bg-white px-5 font-semibold text-[#a44f49] hover:border-[#dcb9b4] hover:bg-[#fff6f5] hover:text-[#923f3a]"
                    onClick={() => {
                      const confirmed = window.confirm(
                        "Delete all appointments for this profile? This action cannot be undone.",
                      );

                      if (confirmed) {
                        deleteAllAppointments.mutate();
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                    {deleteAllAppointments.isPending
                      ? "Deleting…"
                      : "Delete all"}
                  </Button>
                )}

              <Button
                type="button"
                disabled={!activeParentId || isChildView}
                onClick={openCreateDialog}
                className="h-11 rounded-xl bg-[#0d6665] px-5 font-semibold text-white shadow-[0_14px_30px_-18px_rgba(13,102,101,0.9)] hover:bg-[#0a5958]"
              >
                <Plus className="size-4" />
                New appointment
              </Button>
            </div>
          </div>

          <div className="grid border-t border-[#e2ece9] bg-[#f7faf9] sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric
              icon={CalendarDays}
              label="Upcoming visits"
              value={String(upcomingCount)}
              detail="Active appointments"
              iconBackground="bg-[#e5f2ed]"
              iconClass="text-[#19705f]"
            />

            <SummaryMetric
              icon={CalendarClock}
              label="Today's schedule"
              value={String(todayCount)}
              detail={
                todayCount === 1
                  ? "1 appointment today"
                  : `${todayCount} appointments today`
              }
              iconBackground="bg-[#e9eff5]"
              iconClass="text-[#506f8e]"
            />

            <SummaryMetric
              icon={Bell}
              label="Active reminders"
              value={String(remindersCount)}
              detail="Upcoming reminders enabled"
              iconBackground="bg-[#f5eadf]"
              iconClass="text-[#9b663a]"
            />

            <SummaryMetric
              icon={Stethoscope}
              label="Next visit"
              value={
                nextAppointment
                  ? formatAppointmentTime(nextAppointment)
                  : "Not scheduled"
              }
              detail={
                nextAppointment
                  ? formatAppointmentDate(nextAppointment.appointment_date)
                  : "Add an appointment"
              }
              iconBackground="bg-[#edf1f0]"
              iconClass="text-[#4e6d71]"
              last
            />
          </div>
        </section>

        {isChildView && (
          <section className="flex items-start gap-3 rounded-2xl border border-[#e7d8bd] bg-[#fffaf0] px-5 py-4 text-sm text-[#775f38]">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p className="leading-6">
              You are viewing {activeParent?.full_name}&apos;s appointment
              schedule in read-only mode. Creating, editing and deleting
              appointments is restricted to the parent account.
            </p>
          </section>
        )}

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
          <div className="flex flex-col gap-4 border-b border-[#e3ece9] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                Appointment schedule
              </h2>

              <p className="mt-1 text-sm text-[#72868a]">
                Review the complete schedule as a list or by calendar date.
              </p>
            </div>

            <div className="inline-flex w-full rounded-xl border border-[#d8e4e0] bg-[#f7faf9] p-1 sm:w-auto">
              <ViewButton
                active={viewMode === "list"}
                icon={List}
                label="List"
                onClick={() => setViewMode("list")}
              />

              <ViewButton
                active={viewMode === "calendar"}
                icon={CalendarIcon}
                label="Calendar"
                onClick={() => setViewMode("calendar")}
              />
            </div>
          </div>

          {isLoading ? (
            <AppointmentsLoadingState />
          ) : appointments.length === 0 ? (
            <EmptyAppointments
              isChildView={isChildView}
              canCreate={Boolean(activeParentId)}
              onCreate={openCreateDialog}
            />
          ) : viewMode === "list" ? (
            <div className="space-y-8 p-5 sm:p-6">
              <AppointmentGroup
                title="Upcoming"
                description="Scheduled visits from today onward"
                appointments={upcomingAppointments}
                today={today}
                isChildView={isChildView}
                pendingDeleteId={
                  deleteAppointment.isPending
                    ? deleteAppointment.variables
                    : undefined
                }
                onEdit={openEditDialog}
                onDelete={confirmDeleteAppointment}
                emptyMessage="No upcoming appointments are scheduled."
              />

              {pastAppointments.length > 0 && (
                <AppointmentGroup
                  title="Past appointments"
                  description="Previous visits and completed care events"
                  appointments={pastAppointments}
                  today={today}
                  isChildView={isChildView}
                  pendingDeleteId={
                    deleteAppointment.isPending
                      ? deleteAppointment.variables
                      : undefined
                  }
                  onEdit={openEditDialog}
                  onDelete={confirmDeleteAppointment}
                />
              )}
            </div>
          ) : (
            <CalendarSchedule
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              modifiers={calendarModifiers}
              modifiersClassNames={calendarModifierClasses}
              appointments={selectedDayAppointments}
              today={today}
              isChildView={isChildView}
              pendingDeleteId={
                deleteAppointment.isPending
                  ? deleteAppointment.variables
                  : undefined
              }
              onEdit={openEditDialog}
              onDelete={confirmDeleteAppointment}
            />
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-[#dce8e4] bg-[#0c3f45] p-6 text-white">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-[#a8d7cb]">
                <Bell className="size-5" />
              </span>

              <div>
                <h2 className="text-base font-bold">
                  Keep reminders enabled for important visits
                </h2>

                <p className="mt-2 text-sm leading-6 text-white/70">
                  Appointment alarms use the scheduled date and time. Browser
                  notifications are optional—the in-app alarm remains available
                  when browser permission is blocked.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e4d8ce] bg-[#fbf7f2] p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f3e4d7] text-[#9c6338]">
                <Info className="size-5" />
              </span>

              <div>
                <h2 className="text-base font-bold text-[#3d3c35]">
                  Prepare before leaving
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#756d64]">
                  Add the hospital location, specialty and required documents
                  to the notes so family members and caregivers have the same
                  information.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);

          if (!nextOpen) {
            setEditingAppointment(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] border-[#dce7e3] p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-[#e3ece9] px-6 py-5 text-left">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e5f2ed] text-[#176f69]">
                {editingAppointment ? (
                  <Pencil className="size-5" />
                ) : (
                  <CalendarDays className="size-5" />
                )}
              </span>

              <div>
                <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">
                  {editingAppointment
                    ? "Edit appointment"
                    : "Create appointment"}
                </DialogTitle>

                <DialogDescription className="mt-1.5 leading-6 text-[#71858a]">
                  Save the visit details and optionally activate an alarm for
                  the scheduled date and time.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={submitAppointment} className="space-y-5 px-6 py-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="appointment-title" className="font-semibold text-[#29484e]">
                  Appointment title <span className="text-[#b64f49]">*</span>
                </Label>

                <Input
                  id="appointment-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Diabetes follow-up"
                  maxLength={80}
                  autoFocus
                  className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-doctor" className="font-semibold text-[#29484e]">
                  Doctor or hospital <span className="text-[#b64f49]">*</span>
                </Label>

                <Input
                  id="appointment-doctor"
                  value={doctorName}
                  onChange={(event) => setDoctorName(event.target.value)}
                  placeholder="e.g. Dr. Sharma"
                  maxLength={100}
                  className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-specialty" className="font-semibold text-[#29484e]">
                  Specialty <span className="font-normal text-[#849599]">(optional)</span>
                </Label>

                <Input
                  id="appointment-specialty"
                  value={specialty}
                  onChange={(event) => setSpecialty(event.target.value)}
                  placeholder="e.g. Cardiologist"
                  maxLength={80}
                  className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="appointment-location" className="font-semibold text-[#29484e]">
                  Location <span className="font-normal text-[#849599]">(optional)</span>
                </Label>

                <Input
                  id="appointment-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g. City Hospital, Building B"
                  maxLength={150}
                  className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-date" className="font-semibold text-[#29484e]">
                  Date <span className="text-[#b64f49]">*</span>
                </Label>

                <DateInput
                  id="appointment-date"
                  value={appointmentDate}
                  onChange={setAppointmentDate}
                  placeholder="YYYY-MM-DD"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appointment-time" className="font-semibold text-[#29484e]">
                  Time <span className="text-[#b64f49]">*</span>
                </Label>

                <TimeInput
                  id="appointment-time"
                  value={appointmentTime}
                  onChange={setAppointmentTime}
                  placeholder="HH:MM"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="appointment-notes" className="font-semibold text-[#29484e]">
                  Notes <span className="font-normal text-[#849599]">(optional)</span>
                </Label>

                <Textarea
                  id="appointment-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add reports to bring, preparation instructions or other useful details"
                  maxLength={300}
                  className="min-h-24 rounded-xl border-[#d8e4e0] bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#dfe9e6] bg-[#f8fbfa] p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e5f2ed] text-[#176f69]">
                  <Bell className="size-4.5" />
                </span>

                <div>
                  <Label
                    htmlFor="appointment-reminder"
                    className="cursor-pointer font-semibold text-[#29484e]"
                  >
                    Appointment alarm
                  </Label>

                  <p className="mt-1 text-xs leading-5 text-[#74898d]">
                    Trigger the in-app alarm and browser notification at the
                    selected time.
                  </p>
                </div>
              </div>

              <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                <input
                  id="appointment-reminder"
                  type="checkbox"
                  checked={reminderEnabled}
                  onChange={(event) => {
                    void handleReminderChange(event.target.checked);
                  }}
                  className="peer sr-only"
                />

                <span className="h-6 w-11 rounded-full bg-[#cbd8d4] transition-colors peer-checked:bg-[#0d7774] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#0d7774] after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
              </label>
            </div>

            <DialogFooter className="flex-col-reverse gap-3 border-t border-[#e5ecea] pt-5 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={closeDialog}
                disabled={
                  addAppointment.isPending || updateAppointment.isPending
                }
                className="h-11 rounded-xl text-[#5e7579] hover:bg-[#f0f5f3]"
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={
                  addAppointment.isPending || updateAppointment.isPending
                }
                className="h-11 rounded-xl bg-[#0d6665] px-6 text-white hover:bg-[#0a5958]"
              >
                <CalendarCheck2 className="size-4" />
                {addAppointment.isPending || updateAppointment.isPending
                  ? "Saving…"
                  : editingAppointment
                    ? "Save changes"
                    : "Create appointment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

type SummaryMetricProps = {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  detail: string;
  iconBackground: string;
  iconClass: string;
  last?: boolean;
};

function SummaryMetric({
  icon: Icon,
  label,
  value,
  detail,
  iconBackground,
  iconClass,
  last = false,
}: SummaryMetricProps) {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-5 sm:px-6 ${last
          ? ""
          : "border-b border-[#e2ebe8] sm:border-r xl:border-b-0"
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

        <p className="mt-1 truncate text-xl font-bold tracking-[-0.035em] text-[#17343a]">
          {value}
        </p>

        <p className="mt-0.5 truncate text-xs text-[#768a8e]">{detail}</p>
      </div>
    </div>
  );
}

function ViewButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof List;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition sm:flex-none ${active
          ? "bg-white text-[#17444a] shadow-sm"
          : "text-[#70858a] hover:text-[#294d52]"
        }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function AppointmentGroup({
  title,
  description,
  appointments,
  today,
  isChildView,
  pendingDeleteId,
  onEdit,
  onDelete,
  emptyMessage,
}: {
  title: string;
  description: string;
  appointments: AppointmentRow[];
  today: string;
  isChildView: boolean;
  pendingDeleteId?: string;
  onEdit: (appointment: AppointmentRow) => void;
  onDelete: (appointment: AppointmentRow) => void;
  emptyMessage?: string;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#47676b]">
            {title}
          </h3>

          <p className="mt-1 text-xs text-[#839497]">{description}</p>
        </div>

        <span className="rounded-full bg-[#f0f5f3] px-3 py-1 text-xs font-bold text-[#60787c]">
          {appointments.length}
        </span>
      </div>

      {appointments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#ceddd8] bg-[#fafcfb] px-6 py-10 text-center text-sm text-[#74898d]">
          {emptyMessage ?? "No appointments are available in this section."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#dfe8e5]">
          <div className="divide-y divide-[#e7eeec]">
            {appointments.map((appointment) => (
              <AppointmentRowItem
                key={appointment.id}
                appointment={appointment}
                isToday={appointment.appointment_date === today}
                isChildView={isChildView}
                deleting={pendingDeleteId === appointment.id}
                onEdit={() => onEdit(appointment)}
                onDelete={() => onDelete(appointment)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function AppointmentRowItem({
  appointment,
  isToday,
  isChildView,
  deleting,
  onEdit,
  onDelete,
}: {
  appointment: AppointmentRow;
  isToday: boolean;
  isChildView: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const appointmentDate = new Date(
    `${appointment.appointment_date}T00:00:00`,
  );

  return (
    <article
      className={`flex flex-col gap-4 bg-white px-4 py-5 transition-colors hover:bg-[#fbfdfc] sm:flex-row sm:items-start sm:gap-5 sm:px-5 ${isToday ? "border-l-4 border-l-[#0d7774] bg-[#f8fbfa]" : ""
        }`}
    >
      <div className="flex items-start gap-4 sm:contents">
        <div className="grid size-14 shrink-0 place-items-center rounded-xl border border-[#dce7e3] bg-[#f5f8f7] text-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#74898d]">
              {format(appointmentDate, "MMM")}
            </p>

            <p className="mt-0.5 text-xl font-bold leading-none text-[#1d4147]">
              {format(appointmentDate, "d")}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-base font-bold text-[#1e3e44]">
              {appointment.title}
            </h4>

            {isToday && (
              <span className="rounded-full bg-[#0d6665] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white">
                Today
              </span>
            )}

            <StatusBadge status={appointment.status} />

            <ReminderBadge enabled={appointment.reminder_enabled} />
          </div>

          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#3d5e63]">
            <UserRound className="size-4 text-[#71868a]" />
            <span className="truncate">
              {formatDoctorName(appointment.doctor_name)}
              {appointment.specialty && (
                <span className="font-normal text-[#7a8e92]">
                  {` · ${appointment.specialty}`}
                </span>
              )}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-[#6f8488]">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {appointment.appointment_time?.slice(0, 5) ?? "Time not set"}
            </span>

            {appointment.location && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{appointment.location}</span>
              </span>
            )}
          </div>

          {appointment.notes && (
            <p className="mt-3 rounded-xl bg-[#f6f9f8] px-3.5 py-3 text-xs leading-5 text-[#647a7e]">
              {appointment.notes}
            </p>
          )}
        </div>
      </div>

      {!isChildView && (
        <div className="ml-auto flex shrink-0 items-center gap-1 self-end sm:self-start">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onEdit}
            className="size-9 rounded-lg text-[#60787c] hover:bg-[#edf4f1] hover:text-[#174f54]"
            title="Edit appointment"
            aria-label={`Edit ${appointment.title}`}
          >
            <Pencil className="size-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={deleting}
            className="size-9 rounded-lg text-[#9a5a55] hover:bg-[#fff0ee] hover:text-[#8e403b]"
            title="Delete appointment"
            aria-label={`Delete ${appointment.title}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </article>
  );
}

function CalendarSchedule({
  selectedDate,
  onSelectDate,
  modifiers,
  modifiersClassNames,
  appointments,
  today,
  isChildView,
  pendingDeleteId,
  onEdit,
  onDelete,
}: {
  selectedDate: Date | undefined;
  onSelectDate: (date: Date | undefined) => void;
  modifiers: { hasAppointment: (date: Date) => boolean };
  modifiersClassNames: { hasAppointment: string };
  appointments: AppointmentRow[];
  today: string;
  isChildView: boolean;
  pendingDeleteId?: string;
  onEdit: (appointment: AppointmentRow) => void;
  onDelete: (appointment: AppointmentRow) => void;
}) {
  return (
    <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[0.78fr_1.22fr]">
      <div className="rounded-2xl border border-[#dfe8e5] bg-[#fbfdfc] p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-[#26484e]">Select a date</h3>
          <p className="mt-1 text-xs text-[#809296]">
            Dates with appointments are marked below.
          </p>
        </div>

        <UI_Calendar
          mode="single"
          selected={selectedDate}
          onSelect={onSelectDate}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
          className="mx-auto w-full rounded-xl bg-white"
        />
      </div>

      <div className="min-w-0">
        <div className="flex flex-col gap-3 border-b border-[#e3ece9] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#74898d]">
              Selected schedule
            </p>

            <h3 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[#1c3c42]">
              {selectedDate
                ? format(selectedDate, "MMMM d, yyyy")
                : "Select a date"}
            </h3>
          </div>

          <span className="w-fit rounded-full bg-[#edf4f1] px-3 py-1.5 text-xs font-bold text-[#5e777b]">
            {appointments.length} {appointments.length === 1 ? "visit" : "visits"}
          </span>
        </div>

        {appointments.length === 0 ? (
          <div className="mt-5 flex flex-col items-center rounded-2xl border border-dashed border-[#ceddd8] bg-[#fafcfb] px-6 py-14 text-center">
            <CalendarDays className="size-7 text-[#9bb0ac]" />
            <p className="mt-4 text-sm font-bold text-[#34555a]">
              No appointments on this date
            </p>
            <p className="mt-1 text-xs text-[#809296]">
              Select another date to review its schedule.
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-[#dfe8e5]">
            <div className="divide-y divide-[#e7eeec]">
              {appointments.map((appointment) => (
                <AppointmentRowItem
                  key={appointment.id}
                  appointment={appointment}
                  isToday={appointment.appointment_date === today}
                  isChildView={isChildView}
                  deleting={pendingDeleteId === appointment.id}
                  onEdit={() => onEdit(appointment)}
                  onDelete={() => onDelete(appointment)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const statusClasses: Record<AppointmentStatus, string> = {
    pending: "bg-[#f6ecdf] text-[#8f6339]",
    confirmed: "bg-[#e4f2ed] text-[#1b725f]",
    scheduled: "bg-[#e8eef5] text-[#4b6888]",
    completed: "bg-[#edf1f0] text-[#527075]",
    cancelled: "bg-[#f8e5e3] text-[#a74742]",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusClasses[status]}`}
    >
      {status}
    </span>
  );
}

function ReminderBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#cfe0db] bg-[#f1f7f5] px-2.5 py-1 text-[10px] font-bold text-[#267269]">
      <Bell className="size-3" />
      Reminder on
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#e1e7e5] bg-[#fafbfb] px-2.5 py-1 text-[10px] font-bold text-[#7a8c90]">
      <BellOff className="size-3" />
      Reminder off
    </span>
  );
}

function EmptyAppointments({
  isChildView,
  canCreate,
  onCreate,
}: {
  isChildView: boolean;
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-[#e7f2ee] text-[#176f69]">
        <CalendarDays className="size-6" />
      </span>

      <h3 className="mt-5 text-lg font-bold text-[#1c3b41]">
        No appointments scheduled
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-[#71868a]">
        {isChildView
          ? "This profile does not currently have any appointment records."
          : "Create the first appointment to keep the care schedule organised."}
      </p>

      {!isChildView && canCreate && (
        <Button
          type="button"
          onClick={onCreate}
          className="mt-6 h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
        >
          <Plus className="size-4" />
          Create appointment
        </Button>
      )}
    </div>
  );
}

function AppointmentsLoadingState() {
  return (
    <div className="space-y-4 p-5 sm:p-6">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flex animate-pulse items-center gap-4 rounded-2xl border border-[#e5ecea] p-5"
        >
          <div className="size-14 rounded-xl bg-[#eaf0ee]" />

          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-48 rounded bg-[#e7eeec]" />
            <div className="h-3 w-32 rounded bg-[#eff3f2]" />
            <div className="h-3 w-56 rounded bg-[#eff3f2]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function compareAppointmentsAscending(
  first: AppointmentRow,
  second: AppointmentRow,
) {
  return getAppointmentTimestamp(first) - getAppointmentTimestamp(second);
}

function compareAppointmentsDescending(
  first: AppointmentRow,
  second: AppointmentRow,
) {
  return getAppointmentTimestamp(second) - getAppointmentTimestamp(first);
}

function getAppointmentTimestamp(appointment: AppointmentRow) {
  return new Date(
    `${appointment.appointment_date}T${appointment.appointment_time || "00:00"}`,
  ).getTime();
}

function formatAppointmentDate(date: string) {
  return format(new Date(`${date}T00:00:00`), "MMM d, yyyy");
}

function formatAppointmentTime(appointment: AppointmentRow) {
  if (!appointment.appointment_time) {
    return "Time pending";
  }

  return format(
    new Date(
      `${appointment.appointment_date}T${appointment.appointment_time.slice(0, 5)}`,
    ),
    "h:mm a",
  );
}

function formatDoctorName(name: string) {
  const trimmedName = name.trim();

  if (/^dr\.?\s/i.test(trimmedName)) {
    return trimmedName;
  }

  return `Dr. ${trimmedName}`;
}

function createScheduledAt(date: string, time: string) {
  const timeValue = time || "12:00";
  const dateValue = new Date(`${date}T${timeValue}`);

  if (Number.isNaN(dateValue.getTime())) {
    throw new Error("Invalid date/time");
  }

  return dateValue.toISOString();
}

function invalidateAppointmentQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["appointments"] });
  queryClient.invalidateQueries({ queryKey: ["nextBooking"] });
  queryClient.invalidateQueries({ queryKey: ["global_appointment_alarms"] });
}