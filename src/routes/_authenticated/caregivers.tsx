import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock,
  HeartPulse,
  ListChecks,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { TrustedCaregiverDirectory } from "@/components/TrustedCaregiverDirectory";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveParent } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/caregivers")({
  ssr: false,
  component: CaregiversPage,
});

type BookingStatus =
  | "pending"
  | "confirmed"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";

type ServiceType = "nurse" | "physiotherapist" | "companion" | "caretaker";

type Booking = {
  id: string;
  parent_id: string;
  caregiver_type: ServiceType;
  booking_date: string | null;
  booking_time: string | null;
  scheduled_at: string;
  duration_hours: number;
  notes: string | null;
  status: BookingStatus;
  caregiver_id: string | null;
  caregiver_name: string | null;
  created_at: string;
  updated_at: string;
};

type ServiceDefinition = {
  id: ServiceType;
  label: string;
  icon: LucideIcon;
  description: string;
  detail: string;
  iconClass: string;
  iconBackground: string;
};

const SERVICE_TYPES: ServiceDefinition[] = [
  {
    id: "nurse",
    label: "Home nurse",
    icon: Stethoscope,
    description: "Qualified clinical support at home",
    detail: "Medication, monitoring and post-care assistance",
    iconClass: "text-[#3d6685]",
    iconBackground: "bg-[#e7eef4]",
  },
  {
    id: "physiotherapist",
    label: "Physiotherapist",
    icon: Activity,
    description: "Mobility and rehabilitation support",
    detail: "Recovery exercises, movement and pain management",
    iconClass: "text-[#197063]",
    iconBackground: "bg-[#e4f1ed]",
  },
  {
    id: "companion",
    label: "Companion",
    icon: Users,
    description: "Social presence and daily engagement",
    detail: "Conversation, activities and accompanied outings",
    iconClass: "text-[#695f82]",
    iconBackground: "bg-[#eeeaf3]",
  },
  {
    id: "caretaker",
    label: "Daily caretaker",
    icon: HeartPulse,
    description: "Practical help with everyday routines",
    detail: "Personal care, meals and household assistance",
    iconClass: "text-[#9d5d48]",
    iconBackground: "bg-[#f5e9e3]",
  },
];

const SERVICE_LABELS: Record<ServiceType, string> = {
  nurse: "Home nurse",
  physiotherapist: "Physiotherapist",
  companion: "Companion",
  caretaker: "Daily caretaker",
};

const STATUS_CONFIG: Record<
  BookingStatus,
  {
    label: string;
    badge: string;
    dot: string;
  }
> = {
  pending: {
    label: "Pending",
    badge: "bg-[#f7ecdf] text-[#986235]",
    dot: "bg-[#c9874d]",
  },
  confirmed: {
    label: "Confirmed",
    badge: "bg-[#e7eef4] text-[#426985]",
    dot: "bg-[#5b7f9a]",
  },
  assigned: {
    label: "Assigned",
    badge: "bg-[#eeeaf3] text-[#685d82]",
    dot: "bg-[#776b91]",
  },
  in_progress: {
    label: "In progress",
    badge: "bg-[#e3f1eb] text-[#1c735e]",
    dot: "bg-[#3b9b7d]",
  },
  completed: {
    label: "Completed",
    badge: "bg-[#edf2f0] text-[#5d7478]",
    dot: "bg-[#7c9092]",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-[#f8e7e5] text-[#a14e48]",
    dot: "bg-[#bf625b]",
  },
};

const CANCELLABLE_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "assigned",
  "in_progress",
];

const EDITABLE_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "assigned",
];

function todayString() {
  return format(new Date(), "yyyy-MM-dd");
}

function bookingDateTime(date: string, time: string) {
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isPastBooking(booking: Booking) {
  const scheduled = new Date(booking.scheduled_at);

  return (
    !Number.isNaN(scheduled.getTime()) &&
    scheduled.getTime() < Date.now() &&
    booking.status !== "completed" &&
    booking.status !== "cancelled"
  );
}

function formatDisplayDate(dateStr: string | null, scheduledAt?: string) {
  try {
    if (dateStr) {
      return format(new Date(`${dateStr}T00:00:00`), "EEE, MMM d, yyyy");
    }

    if (scheduledAt) {
      return format(new Date(scheduledAt), "EEE, MMM d, yyyy");
    }
  } catch {
    return dateStr ?? "—";
  }

  return "—";
}

function formatDisplayTime(timeStr: string | null, scheduledAt?: string) {
  try {
    if (timeStr) {
      const [hours, minutes] = timeStr.split(":");
      const value = new Date();
      value.setHours(Number(hours), Number(minutes), 0, 0);
      return format(value, "h:mm a");
    }

    if (scheduledAt) {
      return format(new Date(scheduledAt), "h:mm a");
    }
  } catch {
    return timeStr ?? "—";
  }

  return "—";
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${config.badge}`}
    >
      <span className={`size-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function CaregiversPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>("nurse");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [duration, setDuration] = useState<number | "">(2);
  const [notes, setNotes] = useState("");

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["caregiver_bookings", activeParentId],
    enabled: Boolean(activeParentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caregiver_bookings")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("scheduled_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as unknown as Booking[];
    },
  });

  useEffect(() => {
    if (!activeParentId) {
      return;
    }

    const channel = supabase
      .channel(`caregiver-bookings-${activeParentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "caregiver_bookings",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["caregiver_bookings", activeParentId],
          });
          queryClient.invalidateQueries({ queryKey: ["nextBooking"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeParentId, queryClient]);

  function resetForm() {
    setServiceType("nurse");
    setBookingDate("");
    setBookingTime("");
    setDuration(2);
    setNotes("");
  }

  function openNew(type: ServiceType = "nurse") {
    if (isChildView) {
      toast.error("You do not have permission to manage caregiver services.");
      return;
    }

    setEditingBooking(null);
    resetForm();
    setServiceType(type);
    setOpen(true);
  }

  function openEdit(booking: Booking) {
    if (isChildView) {
      toast.error("You do not have permission to manage caregiver services.");
      return;
    }

    setEditingBooking(booking);
    setServiceType(booking.caregiver_type);
    setBookingDate(booking.booking_date ?? "");
    setBookingTime(booking.booking_time ? booking.booking_time.slice(0, 5) : "");
    setDuration(booking.duration_hours ?? 2);
    setNotes(booking.notes ?? "");
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditingBooking(null);
    resetForm();
  }

  function validate(): boolean {
    if (!activeParentId) {
      toast.error("No parent profile is selected.");
      return false;
    }

    if (!serviceType) {
      toast.error("Please select a service.");
      return false;
    }

    if (!bookingDate) {
      toast.error("Please select a preferred date.");
      return false;
    }

    if (!bookingTime) {
      toast.error("Please select a preferred time.");
      return false;
    }

    const scheduled = bookingDateTime(bookingDate, bookingTime);

    if (!scheduled) {
      toast.error("Please enter a valid booking date and time.");
      return false;
    }

    if (scheduled.getTime() <= Date.now()) {
      toast.error("The caregiver booking must be scheduled for a future time.");
      return false;
    }

    if (
      duration !== "" &&
      (!Number.isInteger(duration) || duration < 1 || duration > 24)
    ) {
      toast.error("Duration must be a whole number between 1 and 24 hours.");
      return false;
    }

    return true;
  }

  const book = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error(
          "You do not have permission to manage caregiver services.",
        );
      }

      if (!activeParentId) {
        throw new Error("No parent profile is selected.");
      }

      const scheduled = bookingDateTime(bookingDate, bookingTime);

      if (!scheduled) {
        throw new Error("Invalid booking date or time.");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const { data, error } = await supabase
        .from("caregiver_bookings")
        .insert({
          parent_id: activeParentId,
          requested_by: user.id,
          caregiver_type: serviceType,
          scheduled_at: scheduled.toISOString(),
          booking_date: bookingDate,
          booking_time: bookingTime,
          duration_hours: duration === "" ? 2 : duration,
          notes: notes.trim() || null,
          status: "pending",
        } as any)
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("The booking could not be created.");
      }
    },
    onSuccess: () => {
      toast.success("Caregiver service booked successfully.");
      closeDialog();
      queryClient.invalidateQueries({
        queryKey: ["caregiver_bookings", activeParentId],
      });
      queryClient.invalidateQueries({ queryKey: ["nextBooking"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Unable to create booking. Please try again.");
    },
  });

  const edit = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView) {
        throw new Error(
          "You do not have permission to manage caregiver services.",
        );
      }

      if (!activeParentId) {
        throw new Error("No parent profile is selected.");
      }

      const scheduled = bookingDateTime(bookingDate, bookingTime);

      if (!scheduled) {
        throw new Error("Invalid booking date or time.");
      }

      const { data, error } = await supabase
        .from("caregiver_bookings")
        .update({
          caregiver_type: serviceType,
          scheduled_at: scheduled.toISOString(),
          booking_date: bookingDate,
          booking_time: bookingTime,
          duration_hours: duration === "" ? 2 : duration,
          notes: notes.trim() || null,
        } as any)
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .in("status", EDITABLE_STATUSES)
        .select("id")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "This booking could not be updated. It may have changed or no longer be editable.",
        );
      }
    },
    onSuccess: () => {
      toast.success("Booking updated successfully.");
      closeDialog();
      queryClient.invalidateQueries({
        queryKey: ["caregiver_bookings", activeParentId],
      });
      queryClient.invalidateQueries({ queryKey: ["nextBooking"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Unable to update booking. Please try again.");
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView) {
        throw new Error(
          "You do not have permission to manage caregiver services.",
        );
      }

      if (!activeParentId) {
        throw new Error("No parent profile is selected.");
      }

      const { data, error } = await supabase
        .from("caregiver_bookings")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .in("status", CANCELLABLE_STATUSES)
        .select("id")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "This booking could not be cancelled. It may already be completed or cancelled.",
        );
      }
    },
    onSuccess: () => {
      toast.success("Booking cancelled and moved to history.");
      queryClient.invalidateQueries({
        queryKey: ["caregiver_bookings", activeParentId],
      });
      queryClient.invalidateQueries({ queryKey: ["nextBooking"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Unable to cancel booking. Please try again.");
    },
  });

  const removeOne = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView) {
        throw new Error(
          "You do not have permission to manage caregiver services.",
        );
      }

      if (!activeParentId) {
        throw new Error("No parent profile is selected.");
      }

      const { data, error } = await supabase
        .from("caregiver_bookings")
        .delete()
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "This booking was not deleted. It may have already been removed or deletion is blocked.",
        );
      }

      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData<Booking[]>(
        ["caregiver_bookings", activeParentId],
        (current) =>
          current?.filter((booking) => booking.id !== deletedId) ?? [],
      );
      toast.success("Booking deleted permanently.");
      queryClient.invalidateQueries({
        queryKey: ["caregiver_bookings", activeParentId],
      });
      queryClient.invalidateQueries({ queryKey: ["nextBooking"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Unable to delete booking. Please try again.");
    },
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error(
          "You do not have permission to manage caregiver services.",
        );
      }

      if (!activeParentId) {
        throw new Error("No parent profile is selected.");
      }

      const { data, error } = await supabase
        .from("caregiver_bookings")
        .delete()
        .eq("parent_id", activeParentId)
        .select("id");

      if (error) {
        throw error;
      }

      return data?.length ?? 0;
    },
    onSuccess: (deletedCount) => {
      queryClient.setQueryData<Booking[]>(
        ["caregiver_bookings", activeParentId],
        [],
      );
      toast.success(
        deletedCount === 1
          ? "1 caregiver booking deleted."
          : `${deletedCount} caregiver bookings deleted.`,
      );
      queryClient.invalidateQueries({
        queryKey: ["caregiver_bookings", activeParentId],
      });
      queryClient.invalidateQueries({ queryKey: ["nextBooking"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Unable to delete the bookings.");
    },
  });

  function handleSubmit() {
    if (!validate()) {
      return;
    }

    if (editingBooking) {
      edit.mutate(editingBooking.id);
    } else {
      book.mutate();
    }
  }

  function handleCancel(booking: Booking) {
    if (isChildView) {
      toast.error("You do not have permission to manage caregiver services.");
      return;
    }

    if (
      window.confirm(
        `Cancel this ${SERVICE_LABELS[booking.caregiver_type]} booking? It will remain in your history.`,
      )
    ) {
      cancel.mutate(booking.id);
    }
  }

  function handleDelete(booking: Booking) {
    if (isChildView) {
      toast.error("You do not have permission to manage caregiver services.");
      return;
    }

    if (
      window.confirm(
        `Permanently delete this ${SERVICE_LABELS[booking.caregiver_type]} booking? This action cannot be undone.`,
      )
    ) {
      removeOne.mutate(booking.id);
    }
  }

  const activeBookings = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            booking.status !== "cancelled" && booking.status !== "completed",
        )
        .sort(
          (first, second) =>
            new Date(first.scheduled_at).getTime() -
            new Date(second.scheduled_at).getTime(),
        ),
    [bookings],
  );

  const historyBookings = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            booking.status === "cancelled" || booking.status === "completed",
        )
        .sort(
          (first, second) =>
            new Date(second.scheduled_at).getTime() -
            new Date(first.scheduled_at).getTime(),
        ),
    [bookings],
  );

  const nextBooking = activeBookings[0] ?? null;
  const completedCount = bookings.filter(
    (booking) => booking.status === "completed",
  ).length;
  const assignedCaregiverCount = new Set(
    bookings
      .filter((booking) => Boolean(booking.caregiver_name))
      .map((booking) => booking.caregiver_name),
  ).size;
  const pendingCount = bookings.filter(
    (booking) => booking.status === "pending",
  ).length;

  const isPending = editingBooking ? edit.isPending : book.isPending;

  return (
    <AppShell>
      <div className="space-y-6 pb-10">
        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)]">
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-7">
            <div className="max-w-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#e7f2ee] px-3 py-1.5 text-xs font-bold text-[#176f69]">
                  <UserCheck className="size-3.5" />
                  Care coordination
                </span>

                {isChildView && (
                  <span className="rounded-full border border-[#d8e5e1] bg-[#f7faf9] px-3 py-1.5 text-xs font-semibold text-[#647b80]">
                    Family view
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#122f35] sm:text-4xl">
                Caregiver services
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[#667d82] sm:text-base">
                Book trusted care support for{" "}
                <span className="font-semibold text-[#294b50]">
                  {activeParent?.full_name ?? "the selected profile"}
                </span>
                , track every request and keep the family care plan organised.
              </p>
            </div>

            {!isChildView && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-xl border-[#cfdfda] bg-white px-5 font-semibold text-[#34595e] hover:bg-[#f2f7f5]"
                >
                  <Link to="/caregiver-management">
                    <ListChecks className="size-4" />
                    Manage workflow
                  </Link>
                </Button>

                <Button
                  type="button"
                  disabled={!activeParentId}
                  onClick={() => openNew()}
                  className="h-11 rounded-xl bg-[#0d6665] px-5 font-semibold text-white shadow-[0_14px_30px_-18px_rgba(13,102,101,0.9)] hover:bg-[#0a5958]"
                >
                  <Plus className="size-4" />
                  New booking
                </Button>
              </div>
            )}
          </div>

          <div className="grid border-t border-[#e2ece9] bg-[#f7faf9] sm:grid-cols-2 lg:grid-cols-4">
            <SummaryMetric
              icon={CalendarCheck2}
              label="Active bookings"
              value={String(activeBookings.length)}
              detail="Current care requests"
              iconBackground="bg-[#e5f2ed]"
              iconClass="text-[#19705f]"
            />

            <SummaryMetric
              icon={Clock}
              label="Awaiting confirmation"
              value={String(pendingCount)}
              detail="Pending service requests"
              iconBackground="bg-[#f5eadf]"
              iconClass="text-[#986237]"
            />

            <SummaryMetric
              icon={UserCheck}
              label="Assigned caregivers"
              value={String(assignedCaregiverCount)}
              detail="Named caregivers on bookings"
              iconBackground="bg-[#eeeaf3]"
              iconClass="text-[#685d82]"
            />

            <SummaryMetric
              icon={CheckCircle2}
              label="Completed sessions"
              value={String(completedCount)}
              detail="Care visits completed"
              iconBackground="bg-[#e9eff5]"
              iconClass="text-[#506f8e]"
              last
            />
          </div>
        </section>

        {isChildView && (
          <section className="flex items-start gap-3 rounded-2xl border border-[#e5d5bd] bg-[#fbf6ed] px-5 py-4 text-sm text-[#7a603b]">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" />

            <div>
              <p className="font-bold">Read-only access</p>
              <p className="mt-1 leading-6 text-[#806d51]">
                You can review caregiver profiles and bookings, but only the
                parent account can create, edit, cancel or delete services.
              </p>
            </div>
          </section>
        )}

        {nextBooking && (
          <section className="grid overflow-hidden rounded-[1.5rem] border border-[#d7e5e0] bg-[#0c3f45] text-white lg:grid-cols-[1fr_auto]">
            <div className="p-6 sm:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#a7d3ca]">
                Next scheduled care visit
              </p>

              <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10 text-[#b5ddd4]">
                  {(() => {
                    const service = SERVICE_TYPES.find(
                      (item) => item.id === nextBooking.caregiver_type,
                    );
                    const Icon = service?.icon ?? Stethoscope;
                    return <Icon className="size-5" />;
                  })()}
                </span>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold tracking-[-0.03em]">
                      {SERVICE_LABELS[nextBooking.caregiver_type]}
                    </h2>
                    <StatusBadge status={nextBooking.status} />
                  </div>

                  <p className="mt-2 text-sm text-white/70">
                    {formatDisplayDate(
                      nextBooking.booking_date,
                      nextBooking.scheduled_at,
                    )}
                    {" · "}
                    {formatDisplayTime(
                      nextBooking.booking_time,
                      nextBooking.scheduled_at,
                    )}
                    {" · "}
                    {nextBooking.duration_hours} hour
                    {nextBooking.duration_hours === 1 ? "" : "s"}
                  </p>

                  {nextBooking.caregiver_name && (
                    <p className="mt-2 text-sm font-semibold text-[#b7ddd5]">
                      Assigned to {nextBooking.caregiver_name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center border-t border-white/10 bg-white/5 px-6 py-5 lg:border-l lg:border-t-0">
              <Button
                asChild
                variant="ghost"
                className="h-11 w-full rounded-xl border border-white/15 bg-white/10 px-5 text-white hover:bg-white/15 hover:text-white lg:w-auto"
              >
                <Link to="/caregiver-management">
                  View workflow
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </section>
        )}

        {!isChildView && (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                Book a care service
              </h2>
              <p className="mt-1 text-sm text-[#71868a]">
                Choose the support required, then select a preferred date and
                time.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {SERVICE_TYPES.map((service) => {
                const Icon = service.icon;

                return (
                  <button
                    key={service.id}
                    type="button"
                    disabled={!activeParentId}
                    onClick={() => openNew(service.id)}
                    className="group rounded-2xl border border-[#dce7e3] bg-white p-5 text-left shadow-[0_16px_38px_-32px_rgba(16,49,54,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-[#b8d1c9] hover:shadow-[0_22px_42px_-30px_rgba(16,49,54,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7774] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span
                        className={`grid size-11 place-items-center rounded-xl ${service.iconBackground} ${service.iconClass}`}
                      >
                        <Icon className="size-5" />
                      </span>

                      <span className="grid size-8 place-items-center rounded-lg border border-[#e0e9e6] text-[#6f8589] transition group-hover:border-[#b8d1c9] group-hover:bg-[#eef6f3] group-hover:text-[#0d7774]">
                        <Plus className="size-4" />
                      </span>
                    </div>

                    <h3 className="mt-5 text-base font-bold tracking-[-0.02em] text-[#1b3a40]">
                      {service.label}
                    </h3>

                    <p className="mt-2 text-sm leading-5 text-[#647b80]">
                      {service.description}
                    </p>

                    <p className="mt-3 border-t border-[#e7eeec] pt-3 text-xs leading-5 text-[#809195]">
                      {service.detail}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {activeParentId && (
          <div className="[&>section]:rounded-[1.5rem] [&>section]:border-[#dce8e4] [&>section]:shadow-[0_18px_48px_-40px_rgba(18,49,54,0.45)]">
            <TrustedCaregiverDirectory
              parentId={activeParentId}
              readOnly={isChildView}
            />
          </div>
        )}

        <section className="overflow-hidden rounded-[1.5rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
          <div className="flex flex-col gap-4 border-b border-[#e3ece9] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                Active bookings
              </h2>
              <p className="mt-1 text-sm text-[#72868a]">
                Track upcoming, assigned and in-progress caregiver services.
              </p>
            </div>

            {!isChildView && activeParentId && bookings.length > 0 && (
              <Button
                type="button"
                variant="outline"
                disabled={clearAll.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Delete every caregiver booking? This action cannot be undone.",
                    )
                  ) {
                    clearAll.mutate();
                  }
                }}
                className="h-10 rounded-xl border-[#e1c9c5] bg-white px-4 font-semibold text-[#9d4b46] hover:bg-[#fff4f3] hover:text-[#8d3f3b]"
              >
                <Trash2 className="size-4" />
                {clearAll.isPending ? "Deleting…" : "Delete all"}
              </Button>
            )}
          </div>

          {isLoading ? (
            <BookingLoadingState />
          ) : activeBookings.length === 0 ? (
            <BookingEmptyState
              isChildView={isChildView}
              canBook={Boolean(activeParentId)}
              onBook={() => openNew()}
            />
          ) : (
            <div className="divide-y divide-[#e7eeec]">
              {activeBookings.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  isChildView={isChildView}
                  onEdit={() => openEdit(booking)}
                  onCancel={() => handleCancel(booking)}
                  onDelete={() => handleDelete(booking)}
                  isCancelling={
                    cancel.isPending && cancel.variables === booking.id
                  }
                  isDeleting={
                    removeOne.isPending && removeOne.variables === booking.id
                  }
                />
              ))}
            </div>
          )}
        </section>

        {historyBookings.length > 0 && (
          <section className="overflow-hidden rounded-[1.5rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
            <div className="border-b border-[#e3ece9] px-5 py-5 sm:px-6">
              <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                Booking history
              </h2>
              <p className="mt-1 text-sm text-[#72868a]">
                Completed and cancelled caregiver requests.
              </p>
            </div>

            <div className="divide-y divide-[#e7eeec]">
              {historyBookings.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  isChildView={isChildView}
                  onEdit={() => openEdit(booking)}
                  onCancel={() => handleCancel(booking)}
                  onDelete={() => handleDelete(booking)}
                  isCancelling={
                    cancel.isPending && cancel.variables === booking.id
                  }
                  isDeleting={
                    removeOne.isPending && removeOne.variables === booking.id
                  }
                  history
                />
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#dce8e4] bg-[#f8fbfa] p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e4f1ed] text-[#197063]">
                <ShieldCheck className="size-5" />
              </span>

              <div>
                <h2 className="text-base font-bold text-[#24444a]">
                  Confirm caregiver identity before each visit
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#687e82]">
                  Verify the assigned caregiver, visit purpose and expected
                  duration before allowing home access.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e5d8cc] bg-[#fbf7f2] p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f3e5d8] text-[#9c6338]">
                <CalendarDays className="size-5" />
              </span>

              <div>
                <h2 className="text-base font-bold text-[#443f39]">
                  Keep the care schedule accurate
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#766e66]">
                  Update or cancel requests early so family members and
                  caregivers always see the correct plan.
                </p>
              </div>
            </div>
          </div>
        </section>

        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              closeDialog();
            } else {
              setOpen(true);
            }
          }}
        >
          <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] border-[#dce7e3] p-0 sm:max-w-[560px]">
            <DialogHeader className="border-b border-[#e3ece9] px-6 py-5 text-left">
              <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">
                {editingBooking ? "Edit caregiver booking" : "Book a caregiver service"}
              </DialogTitle>

              <DialogDescription className="mt-1.5 leading-6 text-[#71858a]">
                {editingBooking
                  ? "Update the service, schedule or care instructions for this booking."
                  : "Choose the support required and provide the preferred visit schedule."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 px-6 py-5">
              <div className="space-y-2">
                <Label htmlFor="cg-service-type" className="font-semibold text-[#29484e]">
                  Service type <span className="text-[#a14e48]">*</span>
                </Label>

                <Select
                  value={serviceType}
                  onValueChange={(value) => setServiceType(value as ServiceType)}
                  disabled={editingBooking?.status === "assigned"}
                >
                  <SelectTrigger
                    id="cg-service-type"
                    className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                  >
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>

                  <SelectContent>
                    {SERVICE_TYPES.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {editingBooking?.status === "assigned" && (
                  <p className="text-xs leading-5 text-[#7b8d91]">
                    The service type cannot be changed after a caregiver has
                    been assigned.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cg-date" className="font-semibold text-[#29484e]">
                    Preferred date <span className="text-[#a14e48]">*</span>
                  </Label>

                  <DateInput
                    id="cg-date"
                    value={bookingDate}
                    min={todayString()}
                    onChange={setBookingDate}
                    placeholder="YYYY-MM-DD"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cg-time" className="font-semibold text-[#29484e]">
                    Preferred time <span className="text-[#a14e48]">*</span>
                  </Label>

                  <TimeInput
                    id="cg-time"
                    value={bookingTime}
                    onChange={setBookingTime}
                    placeholder="HH:MM"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cg-duration" className="font-semibold text-[#29484e]">
                  Duration in hours
                  <span className="ml-1 font-normal text-[#849599]">(optional)</span>
                </Label>

                <Input
                  id="cg-duration"
                  type="number"
                  min={1}
                  max={24}
                  value={duration}
                  onChange={(event) =>
                    setDuration(
                      event.target.value === ""
                        ? ""
                        : Number.parseInt(event.target.value, 10) || 1,
                    )
                  }
                  placeholder="e.g. 2"
                  className="h-11 rounded-xl border-[#d8e4e0] bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cg-notes" className="font-semibold text-[#29484e]">
                  Care instructions
                  <span className="ml-1 font-normal text-[#849599]">(optional)</span>
                </Label>

                <Textarea
                  id="cg-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add mobility needs, medication tasks or other visit instructions"
                  rows={4}
                  maxLength={300}
                  className="min-h-28 resize-none rounded-xl border-[#d8e4e0] bg-white"
                />

                <p className="text-right text-xs text-[#849599]">
                  {notes.length}/300
                </p>
              </div>
            </div>

            <DialogFooter className="border-t border-[#e5ecea] px-6 py-5 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={closeDialog}
                disabled={isPending}
                className="h-11 rounded-xl text-[#5f767a] hover:bg-[#f0f5f3]"
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || !activeParentId}
                className="h-11 rounded-xl bg-[#0d6665] px-6 text-white hover:bg-[#0a5958]"
              >
                {isPending
                  ? editingBooking
                    ? "Saving…"
                    : "Booking…"
                  : editingBooking
                    ? "Save changes"
                    : "Book service"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

type SummaryMetricProps = {
  icon: LucideIcon;
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
      className={`flex items-center gap-4 px-5 py-5 sm:px-6 ${last ? "" : "border-b border-[#e2ebe8] sm:border-r lg:border-b-0"
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

function BookingLoadingState() {
  return (
    <div className="space-y-1 p-5 sm:p-6">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flex animate-pulse items-center gap-4 rounded-xl px-1 py-4"
        >
          <div className="size-11 rounded-xl bg-[#edf2f0]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-[#e8efed]" />
            <div className="h-3 w-56 max-w-full rounded bg-[#f0f4f3]" />
          </div>
          <div className="h-7 w-20 rounded-full bg-[#e8efed]" />
        </div>
      ))}
    </div>
  );
}

function BookingEmptyState({
  isChildView,
  canBook,
  onBook,
}: {
  isChildView: boolean;
  canBook: boolean;
  onBook: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-[#e7f2ee] text-[#176f69]">
        <CalendarDays className="size-6" />
      </span>

      <h3 className="mt-5 text-lg font-bold text-[#1c3b41]">
        No active caregiver bookings
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-[#71868a]">
        {isChildView
          ? "There are no upcoming caregiver services for the selected profile."
          : "Book a service when home nursing, rehabilitation, companionship or daily support is required."}
      </p>

      {!isChildView && canBook && (
        <Button
          type="button"
          onClick={onBook}
          className="mt-6 h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
        >
          <Plus className="size-4" />
          Create booking
        </Button>
      )}
    </div>
  );
}

function BookingRow({
  booking,
  isChildView,
  onEdit,
  onCancel,
  onDelete,
  isCancelling,
  isDeleting,
  history = false,
}: {
  booking: Booking;
  isChildView: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  isCancelling: boolean;
  isDeleting: boolean;
  history?: boolean;
}) {
  const service = SERVICE_TYPES.find(
    (item) => item.id === booking.caregiver_type,
  );
  const Icon = service?.icon ?? Stethoscope;
  const canEdit = !isChildView && EDITABLE_STATUSES.includes(booking.status);
  const canCancel =
    !isChildView && CANCELLABLE_STATUSES.includes(booking.status);
  const pastDue = isPastBooking(booking);
  const actionPending = isCancelling || isDeleting;

  return (
    <article
      className={`flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-[#fbfdfc] sm:flex-row sm:items-start sm:px-6 ${history ? "opacity-85" : ""
        }`}
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${service?.iconBackground ?? "bg-[#edf2f0]"
          } ${service?.iconClass ?? "text-[#5f777a]"}`}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold tracking-[-0.02em] text-[#203f45]">
            {SERVICE_LABELS[booking.caregiver_type]}
          </h3>
          <StatusBadge status={booking.status} />

          {pastDue && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#f8e5e3] px-2.5 py-1 text-[11px] font-bold text-[#a74742]">
              <Clock className="size-3" />
              Past due
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-[#71868a]">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {formatDisplayDate(booking.booking_date, booking.scheduled_at)}
          </span>

          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {formatDisplayTime(booking.booking_time, booking.scheduled_at)}
          </span>

          {booking.duration_hours > 0 && (
            <span>
              {booking.duration_hours} hour
              {booking.duration_hours === 1 ? "" : "s"}
            </span>
          )}

          {booking.caregiver_name && (
            <span className="flex items-center gap-1.5 font-bold text-[#5f5b7a]">
              <UserCheck className="size-3.5" />
              {booking.caregiver_name}
            </span>
          )}
        </div>

        {booking.notes && (
          <p className="mt-3 max-w-3xl rounded-xl border border-[#e5ece9] bg-[#f8fbfa] px-3.5 py-3 text-sm leading-5 text-[#60777b]">
            {booking.notes}
          </p>
        )}
      </div>

      {!isChildView && (
        <div className="flex shrink-0 items-center gap-1 sm:mt-0.5">
          {canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              disabled={actionPending}
              className="size-10 rounded-xl text-[#62797d] hover:bg-[#eef4f2] hover:text-[#284d52]"
              title="Edit booking"
              aria-label={`Edit ${SERVICE_LABELS[booking.caregiver_type]} booking`}
            >
              <Pencil className="size-4" />
            </Button>
          )}

          {canCancel && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCancel}
              disabled={actionPending}
              className="size-10 rounded-xl text-[#a46d39] hover:bg-[#fbf2e8] hover:text-[#8f5b2d]"
              title="Cancel booking"
              aria-label={`Cancel ${SERVICE_LABELS[booking.caregiver_type]} booking`}
            >
              <XCircle className="size-4" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={actionPending}
            className="size-10 rounded-xl text-[#9f514c] hover:bg-[#fff1ef] hover:text-[#8c3f3b]"
            title="Delete booking permanently"
            aria-label={`Delete ${SERVICE_LABELS[booking.caregiver_type]} booking permanently`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </article>
  );
}