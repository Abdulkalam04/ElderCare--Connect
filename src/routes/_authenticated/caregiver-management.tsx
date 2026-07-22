import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock,
  HeartPulse,
  ListChecks,
  Mail,
  Phone,
  Play,
  Search,
  ShieldAlert,
  Star,
  Stethoscope,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useActiveParent } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
export const Route = createFileRoute("/_authenticated/caregiver-management")({
  ssr: false,
  component: CaregiverManagementPage,
});
type BookingStatus =
  | "pending"
  | "confirmed"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";
type ServiceType = "nurse" | "physiotherapist" | "companion" | "caretaker";
type CaregiverType = ServiceType | "other";
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
  trusted_caregiver_id: string | null;
  confirmed_at: string | null;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  review_rating: number | null;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};
type TrustedCaregiver = {
  id: string;
  parent_id: string;
  name: string;
  caregiver_type: CaregiverType;
  phone: string | null;
  email: string | null;
  qualification: string | null;
  experience_years: number;
  available: boolean;
  available_days: number[];
  available_from: string | null;
  available_until: string | null;
};
type StatusFilter = "all" | BookingStatus;
const SERVICE_CONFIG: Record<
  ServiceType,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    background: string;
  }
> = {
  nurse: {
    label: "Nurse",
    icon: Stethoscope,
    color: "text-blue-600",
    background: "bg-blue-50",
  },
  physiotherapist: {
    label: "Physiotherapist",
    icon: Activity,
    color: "text-emerald-600",
    background: "bg-emerald-50",
  },
  companion: {
    label: "Companion",
    icon: Users,
    color: "text-violet-600",
    background: "bg-violet-50",
  },
  caretaker: {
    label: "Caretaker",
    icon: HeartPulse,
    color: "text-rose-600",
    background: "bg-rose-50",
  },
};
const STATUS_CONFIG: Record<
  BookingStatus,
  {
    label: string;
    className: string;
    dot: string;
  }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-400",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  assigned: {
    label: "Assigned",
    className: "bg-violet-50 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  completed: {
    label: "Completed",
    className: "bg-stone-100 text-stone-600 border-stone-200",
    dot: "bg-stone-400",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-50 text-red-600 border-red-200",
    dot: "bg-red-400",
  },
};
const WORKFLOW_STEPS: BookingStatus[] = [
  "pending",
  "confirmed",
  "assigned",
  "in_progress",
  "completed",
];
function formatBookingDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(new Date(`${value}T00:00:00`), "EEE, MMM d, yyyy");
  } catch {
    return value;
  }
}
function formatBookingTime(value: string | null) {
  if (!value) return "—";
  try {
    const [hours, minutes] = value.split(":");
    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);
    return format(date, "h:mm a");
  } catch {
    return value;
  }
}
function formatTimestamp(value: string | null) {
  if (!value) return null;
  try {
    return format(new Date(value), "MMM d, h:mm a");
  } catch {
    return value;
  }
}
function timeValue(value: string | null) {
  return value ? value.slice(0, 5) : null;
}
function caregiverMatchesBooking(caregiver: TrustedCaregiver, booking: Booking) {
  if (!caregiver.available) return false;
  if (caregiver.caregiver_type !== "other" && caregiver.caregiver_type !== booking.caregiver_type) {
    return false;
  }
  const dateValue = booking.booking_date ?? booking.scheduled_at.slice(0, 10);
  const bookingDate = new Date(`${dateValue}T00:00:00`);
  const day = bookingDate.getDay();
  const availableDays = caregiver.available_days?.length
    ? caregiver.available_days
    : [0, 1, 2, 3, 4, 5, 6];
  if (!availableDays.includes(day)) return false;
  const bookingTime = timeValue(booking.booking_time);
  const availableFrom = timeValue(caregiver.available_from);
  const availableUntil = timeValue(caregiver.available_until);
  if (
    bookingTime &&
    availableFrom &&
    availableUntil &&
    !(bookingTime >= availableFrom && bookingTime < availableUntil)
  ) {
    return false;
  }
  return true;
}
function StatusBadge({ status }: { status: BookingStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.className}`}
    >
      <span className={`size-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={`size-4 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-stone-300"}`}
        />
      ))}
    </span>
  );
}
function CaregiverManagementPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [assigningBooking, setAssigningBooking] = useState<Booking | null>(null);
  const [selectedCaregiverId, setSelectedCaregiverId] = useState("");
  const [reviewingBooking, setReviewingBooking] = useState<Booking | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["caregiver_bookings", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caregiver_bookings")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });
  const { data: caregivers = [], isLoading: caregiversLoading } = useQuery({
    queryKey: ["trusted-caregivers", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trusted_caregivers")
        .select(
          "id,parent_id,name,caregiver_type,phone,email,qualification,experience_years,available,available_days,available_from,available_until",
        )
        .eq("parent_id", activeParentId!)
        .order("available", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TrustedCaregiver[];
    },
  });
  useEffect(() => {
    if (!activeParentId) return;
    const bookingChannel = supabase
      .channel(`caregiver-workflow-${activeParentId}`)
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
    const caregiverChannel = supabase
      .channel(`caregiver-assignment-directory-${activeParentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trusted_caregivers",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["trusted-caregivers", activeParentId],
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(bookingChannel);
      void supabase.removeChannel(caregiverChannel);
    };
  }, [activeParentId, queryClient]);
  const caregiverById = useMemo(
    () => new Map(caregivers.map((caregiver) => [caregiver.id, caregiver])),
    [caregivers],
  );
  const eligibleCaregivers = useMemo(() => {
    if (!assigningBooking) return [];
    return caregivers.filter((caregiver) => caregiverMatchesBooking(caregiver, assigningBooking));
  }, [assigningBooking, caregivers]);
  const selectedCaregiver = selectedCaregiverId
    ? (caregiverById.get(selectedCaregiverId) ?? null)
    : null;
  const updateStatus = useMutation({
    mutationFn: async ({
      booking,
      nextStatus,
      trustedCaregiverId,
    }: {
      booking: Booking;
      nextStatus: BookingStatus;
      trustedCaregiverId?: string;
    }) => {
      if (isChildView) {
        throw new Error("You do not have permission to manage caregiver bookings.");
      }
      if (!activeParentId) {
        throw new Error("No parent profile is selected.");
      }
      const changes: TablesUpdate<"caregiver_bookings"> = {
        status: nextStatus,
      };
      if (nextStatus === "assigned") {
        if (!trustedCaregiverId) {
          throw new Error("Select an available caregiver before assigning the booking.");
        }
        const caregiver = caregiverById.get(trustedCaregiverId);
        if (!caregiver || !caregiverMatchesBooking(caregiver, booking)) {
          throw new Error("The selected caregiver is unavailable for this service, day, or time.");
        }
        changes.trusted_caregiver_id = trustedCaregiverId;
        changes.caregiver_name = caregiver.name;
      }
      const { data, error } = await supabase
        .from("caregiver_bookings")
        .update(changes)
        .eq("id", booking.id)
        .eq("parent_id", activeParentId)
        .eq("status", booking.status)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(
          "The booking was not updated. Its status may already have changed in another session.",
        );
      }
      return data as Booking;
    },
    onSuccess: (updatedBooking) => {
      queryClient.setQueryData<Booking[]>(["caregiver_bookings", activeParentId], (current) =>
        (current ?? []).map((booking) =>
          booking.id === updatedBooking.id ? updatedBooking : booking,
        ),
      );
      toast.success(`Booking moved to ${STATUS_CONFIG[updatedBooking.status].label}.`);
      setAssigningBooking(null);
      setSelectedCaregiverId("");
      queryClient.invalidateQueries({
        queryKey: ["caregiver_bookings", activeParentId],
      });
      queryClient.invalidateQueries({ queryKey: ["nextBooking"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Unable to update the booking status.");
    },
  });
  const saveReview = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error("Only the parent can review a caregiver service.");
      }
      if (!activeParentId || !reviewingBooking) {
        throw new Error("No completed caregiver booking is selected.");
      }
      if (reviewingBooking.status !== "completed") {
        throw new Error("Only a completed caregiver service can be reviewed.");
      }
      if (reviewRating < 1 || reviewRating > 5) {
        throw new Error("Select a rating from 1 to 5 stars.");
      }
      const { data, error } = await supabase
        .from("caregiver_bookings")
        .update({
          review_rating: reviewRating,
          review_comment: reviewComment.trim() || null,
        })
        .eq("id", reviewingBooking.id)
        .eq("parent_id", activeParentId)
        .eq("status", "completed")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The review could not be saved.");
      return data as Booking;
    },
    onSuccess: (updatedBooking) => {
      queryClient.setQueryData<Booking[]>(["caregiver_bookings", activeParentId], (current) =>
        (current ?? []).map((booking) =>
          booking.id === updatedBooking.id ? updatedBooking : booking,
        ),
      );
      setReviewingBooking(null);
      setReviewRating(0);
      setReviewComment("");
      toast.success("Caregiver review saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const filteredBookings = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bookings.filter((booking) => {
      const matchesStatus = statusFilter === "all" || booking.status === statusFilter;
      const assignedCaregiver = booking.trusted_caregiver_id
        ? caregiverById.get(booking.trusted_caregiver_id)
        : null;
      const serviceName = SERVICE_CONFIG[booking.caregiver_type].label;
      const matchesSearch =
        !query ||
        serviceName.toLowerCase().includes(query) ||
        booking.caregiver_name?.toLowerCase().includes(query) ||
        assignedCaregiver?.phone?.toLowerCase().includes(query) ||
        assignedCaregiver?.email?.toLowerCase().includes(query) ||
        booking.notes?.toLowerCase().includes(query) ||
        booking.review_comment?.toLowerCase().includes(query) ||
        booking.booking_date?.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [bookings, caregiverById, search, statusFilter]);
  function confirmBooking(booking: Booking) {
    if (window.confirm(`Confirm this ${SERVICE_CONFIG[booking.caregiver_type].label} booking?`)) {
      updateStatus.mutate({ booking, nextStatus: "confirmed" });
    }
  }
  function openAssignDialog(booking: Booking) {
    const matching = caregivers.filter((caregiver) => caregiverMatchesBooking(caregiver, booking));
    setAssigningBooking(booking);
    setSelectedCaregiverId(
      booking.trusted_caregiver_id &&
        matching.some((caregiver) => caregiver.id === booking.trusted_caregiver_id)
        ? booking.trusted_caregiver_id
        : (matching[0]?.id ?? ""),
    );
  }
  function assignCaregiver() {
    if (!assigningBooking) return;
    updateStatus.mutate({
      booking: assigningBooking,
      nextStatus: "assigned",
      trustedCaregiverId: selectedCaregiverId,
    });
  }
  function startService(booking: Booking) {
    if (window.confirm(`Start the ${SERVICE_CONFIG[booking.caregiver_type].label} service now?`)) {
      updateStatus.mutate({ booking, nextStatus: "in_progress" });
    }
  }
  function completeService(booking: Booking) {
    if (
      window.confirm(
        `Mark this ${SERVICE_CONFIG[booking.caregiver_type].label} service as completed?`,
      )
    ) {
      updateStatus.mutate({ booking, nextStatus: "completed" });
    }
  }
  function cancelBooking(booking: Booking) {
    if (window.confirm(`Cancel this ${SERVICE_CONFIG[booking.caregiver_type].label} booking?`)) {
      updateStatus.mutate({ booking, nextStatus: "cancelled" });
    }
  }
  function openReviewDialog(booking: Booking) {
    setReviewingBooking(booking);
    setReviewRating(booking.review_rating ?? 0);
    setReviewComment(booking.review_comment ?? "");
  }
  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
            <ListChecks className="size-4" />
            Internal service workflow
          </div>
          <h1 className="font-display text-3xl font-bold italic sm:text-4xl">
            Caregiver Booking Management
          </h1>
          <p className="mt-1 text-muted-foreground">
            Confirm, assign, track, and review caregiver services for{" "}
            {activeParent?.full_name ?? "the selected parent"}.
          </p>
        </div>

        <Button variant="outline" asChild className="rounded-xl">
          <Link to="/caregivers">
            <ArrowLeft className="mr-2 size-4" />
            Back to Caregivers
          </Link>
        </Button>
      </div>

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        This free workflow coordinates caregivers saved in your own trusted directory. It does not
        automatically contact a commercial agency, verify qualifications, or process payments.
      </div>

      {isChildView && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert className="size-4 shrink-0" />
          Children can view the workflow and reviews, but only the parent can make changes.
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        {WORKFLOW_STEPS.map((status) => {
          const config = STATUS_CONFIG[status];
          const count = bookings.filter((booking) => booking.status === status).length;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${statusFilter === status ? config.className : "border-border bg-card"}`}
            >
              <span className="text-[10px] font-mono uppercase tracking-widest">
                {config.label}
              </span>
              <p className="mt-1 text-2xl font-bold">{count}</p>
            </button>
          );
        })}
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search service, caregiver, contact, date, notes, or review..."
            className="h-11 rounded-xl pl-9"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <SelectTrigger className="h-11 w-full rounded-xl sm:w-52">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <SelectItem key={status} value={status}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== "all" || search) && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 rounded-xl"
            onClick={() => {
              setStatusFilter("all");
              setSearch("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {isLoading || caregiversLoading ? (
        <div className="rounded-3xl border border-border bg-card p-12 text-center text-muted-foreground animate-pulse">
          Loading caregiver workflow…
        </div>
      ) : !activeParentId ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
          No parent profile is selected.
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
          <ListChecks className="mx-auto mb-3 size-10 opacity-30" />
          <p className="font-semibold">No bookings match the selected filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => (
            <WorkflowCard
              key={booking.id}
              booking={booking}
              caregiver={
                booking.trusted_caregiver_id
                  ? (caregiverById.get(booking.trusted_caregiver_id) ?? null)
                  : null
              }
              isChildView={isChildView}
              isUpdating={
                updateStatus.isPending && updateStatus.variables?.booking.id === booking.id
              }
              onConfirm={() => confirmBooking(booking)}
              onAssign={() => openAssignDialog(booking)}
              onStart={() => startService(booking)}
              onComplete={() => completeService(booking)}
              onCancel={() => cancelBooking(booking)}
              onReview={() => openReviewDialog(booking)}
            />
          ))}
        </div>
      )}

      <Dialog
        open={!!assigningBooking}
        onOpenChange={(open) => {
          if (!open && !updateStatus.isPending) {
            setAssigningBooking(null);
            setSelectedCaregiverId("");
          }
        }}
      >
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-bold">
              Assign Saved Caregiver
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {assigningBooking && (
              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-800">
                Select an available caregiver for the{" "}
                {SERVICE_CONFIG[assigningBooking.caregiver_type].label.toLowerCase()} booking on{" "}
                {formatBookingDate(assigningBooking.booking_date)} at{" "}
                {formatBookingTime(assigningBooking.booking_time)}.
              </div>
            )}

            {eligibleCaregivers.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">No matching caregiver is available.</p>
                <p className="mt-1">
                  Add a caregiver of the correct type or update their available days and times in
                  the trusted caregiver directory.
                </p>
                <Button variant="outline" asChild className="mt-3 rounded-xl bg-white">
                  <Link to="/caregivers">Open caregiver directory</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="trusted-caregiver-select">
                    Available caregiver <span className="text-destructive">*</span>
                  </Label>
                  <Select value={selectedCaregiverId} onValueChange={setSelectedCaregiverId}>
                    <SelectTrigger id="trusted-caregiver-select">
                      <SelectValue placeholder="Select caregiver" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleCaregivers.map((caregiver) => (
                        <SelectItem key={caregiver.id} value={caregiver.id}>
                          {caregiver.name}
                          {caregiver.experience_years > 0
                            ? ` · ${caregiver.experience_years}y experience`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedCaregiver && (
                  <div className="space-y-2 rounded-2xl border border-border bg-stone-50 p-4 text-sm">
                    <p className="font-semibold">{selectedCaregiver.name}</p>

                    {selectedCaregiver.qualification && (
                      <p className="flex items-start gap-2 text-muted-foreground">
                        <Award className="mt-0.5 size-4 shrink-0" />
                        {selectedCaregiver.qualification}
                      </p>
                    )}

                    {selectedCaregiver.phone && (
                      <a
                        href={`tel:${selectedCaregiver.phone}`}
                        className="flex items-center gap-2 hover:text-primary"
                      >
                        <Phone className="size-4" />
                        {selectedCaregiver.phone}
                      </a>
                    )}

                    {selectedCaregiver.email && (
                      <a
                        href={`mailto:${selectedCaregiver.email}`}
                        className="flex items-center gap-2 hover:text-primary"
                      >
                        <Mail className="size-4" />
                        {selectedCaregiver.email}
                      </a>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={updateStatus.isPending}
              onClick={() => {
                setAssigningBooking(null);
                setSelectedCaregiverId("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                updateStatus.isPending || eligibleCaregivers.length === 0 || !selectedCaregiverId
              }
              onClick={assignCaregiver}
            >
              <UserCheck className="mr-2 size-4" />
              {updateStatus.isPending ? "Assigning…" : "Assign Caregiver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!reviewingBooking}
        onOpenChange={(open) => {
          if (!open && !saveReview.isPending) {
            setReviewingBooking(null);
            setReviewRating(0);
            setReviewComment("");
          }
        }}
      >
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-bold">
              Review Completed Service
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {reviewingBooking && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                Review {reviewingBooking.caregiver_name ?? "the caregiver"} for the{" "}
                {SERVICE_CONFIG[reviewingBooking.caregiver_type].label.toLowerCase()} service.
              </div>
            )}

            <div className="space-y-2">
              <Label>Rating *</Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setReviewRating(value)}
                    className="rounded-lg p-1 transition-transform hover:scale-110"
                    aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
                  >
                    <Star
                      className={`size-8 ${value <= reviewRating ? "fill-amber-400 text-amber-400" : "text-stone-300"}`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="caregiver-review-comment">Comment</Label>
              <Textarea
                id="caregiver-review-comment"
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                placeholder="Describe punctuality, care quality, communication, or other feedback"
                maxLength={500}
                rows={4}
              />
              <p className="text-right text-xs text-muted-foreground">{reviewComment.length}/500</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saveReview.isPending}
              onClick={() => {
                setReviewingBooking(null);
                setReviewRating(0);
                setReviewComment("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveReview.isPending || reviewRating === 0}
              onClick={() => saveReview.mutate()}
            >
              {saveReview.isPending ? "Saving…" : "Save Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
function WorkflowCard({
  booking,
  caregiver,
  isChildView,
  isUpdating,
  onConfirm,
  onAssign,
  onStart,
  onComplete,
  onCancel,
  onReview,
}: {
  booking: Booking;
  caregiver: TrustedCaregiver | null;
  isChildView: boolean;
  isUpdating: boolean;
  onConfirm: () => void;
  onAssign: () => void;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onReview: () => void;
}) {
  const service = SERVICE_CONFIG[booking.caregiver_type];
  const ServiceIcon = service.icon;
  const currentStep = WORKFLOW_STEPS.indexOf(booking.status);
  const isFinished = booking.status === "completed" || booking.status === "cancelled";
  const lifecycle = [
    { label: "Confirmed", value: booking.confirmed_at },
    { label: "Assigned", value: booking.assigned_at },
    { label: "Started", value: booking.started_at },
    { label: "Completed", value: booking.completed_at },
    { label: "Cancelled", value: booking.cancelled_at },
  ].filter((item) => item.value);
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div
            className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${service.background} ${service.color}`}
          >
            <ServiceIcon className="size-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold">{service.label}</h2>
              <StatusBadge status={booking.status} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                {formatBookingDate(booking.booking_date)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {formatBookingTime(booking.booking_time)}
              </span>
              <span>{booking.duration_hours}h session</span>
              {booking.caregiver_name && (
                <span className="flex items-center gap-1.5 font-medium text-violet-600">
                  <UserCheck className="size-3.5" />
                  {booking.caregiver_name}
                </span>
              )}
            </div>

            {caregiver && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                {caregiver.qualification && (
                  <span className="flex items-center gap-1.5">
                    <Award className="size-3.5" />
                    {caregiver.qualification}
                  </span>
                )}
                {caregiver.phone && (
                  <a
                    href={`tel:${caregiver.phone}`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
                    <Phone className="size-3.5" />
                    {caregiver.phone}
                  </a>
                )}
                {caregiver.email && (
                  <a
                    href={`mailto:${caregiver.email}`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
                    <Mail className="size-3.5" />
                    {caregiver.email}
                  </a>
                )}
              </div>
            )}

            {booking.notes && (
              <p className="mt-3 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-xs italic text-stone-600">
                {booking.notes}
              </p>
            )}

            {lifecycle.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                {lifecycle.map((item) => (
                  <span key={item.label} className="rounded-full bg-muted px-2 py-1">
                    {item.label}: {formatTimestamp(item.value)}
                  </span>
                ))}
              </div>
            )}

            {booking.review_rating && (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <RatingStars rating={booking.review_rating} />
                  <span className="text-xs font-semibold text-amber-800">
                    {booking.review_rating}/5
                  </span>
                </div>
                {booking.review_comment && (
                  <p className="mt-2 text-xs text-amber-900">{booking.review_comment}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {!isChildView && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:max-w-xs lg:justify-end">
            {!isFinished && booking.status === "pending" && (
              <Button
                type="button"
                disabled={isUpdating}
                onClick={onConfirm}
                className="rounded-xl"
              >
                <CheckCircle2 className="mr-2 size-4" />
                {isUpdating ? "Confirming…" : "Confirm Booking"}
              </Button>
            )}

            {!isFinished && booking.status === "confirmed" && (
              <Button type="button" disabled={isUpdating} onClick={onAssign} className="rounded-xl">
                <UserCheck className="mr-2 size-4" />
                Assign Caregiver
              </Button>
            )}

            {!isFinished && booking.status === "assigned" && (
              <Button type="button" disabled={isUpdating} onClick={onStart} className="rounded-xl">
                <Play className="mr-2 size-4" />
                {isUpdating ? "Starting…" : "Start Service"}
              </Button>
            )}

            {!isFinished && booking.status === "in_progress" && (
              <Button
                type="button"
                disabled={isUpdating}
                onClick={onComplete}
                className="rounded-xl"
              >
                <CheckCircle2 className="mr-2 size-4" />
                {isUpdating ? "Completing…" : "Complete Service"}
              </Button>
            )}

            {!isFinished && (
              <Button
                type="button"
                variant="outline"
                disabled={isUpdating}
                onClick={onCancel}
                className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <XCircle className="mr-2 size-4" />
                Cancel
              </Button>
            )}

            {booking.status === "completed" && (
              <Button
                type="button"
                variant="outline"
                onClick={onReview}
                className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"
              >
                <Star className="mr-2 size-4" />
                {booking.review_rating ? "Edit Review" : "Review Service"}
              </Button>
            )}
          </div>
        )}
      </div>

      {booking.status !== "cancelled" && (
        <div className="mt-6 border-t border-border pt-5">
          <div className="grid grid-cols-5 gap-1 sm:gap-2">
            {WORKFLOW_STEPS.map((step, index) => {
              const reached = currentStep >= index;
              const active = booking.status === step;
              return (
                <div key={step} className="min-w-0 text-center">
                  <div className="mb-2 flex items-center">
                    {index > 0 && (
                      <span className={`h-0.5 flex-1 ${reached ? "bg-primary" : "bg-stone-200"}`} />
                    )}
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                        reached
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-stone-300 bg-white text-stone-400"
                      } ${active ? "ring-4 ring-primary/10" : ""}`}
                    >
                      {reached && index < currentStep ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    {index < WORKFLOW_STEPS.length - 1 && (
                      <span
                        className={`h-0.5 flex-1 ${currentStep > index ? "bg-primary" : "bg-stone-200"}`}
                      />
                    )}
                  </div>
                  <p
                    className={`truncate text-[9px] font-medium sm:text-[10px] ${reached ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {STATUS_CONFIG[step].label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}
