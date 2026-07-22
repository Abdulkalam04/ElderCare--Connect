import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useActiveParent } from "@/hooks/useProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import {
  useRealtimeTransportBookings,
  type TransportRealtimePayload,
} from "@/hooks/useRealtimeTransportBookings";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  Clock,
  Locate,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Play,
  Plus,
  ShieldAlert,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";
import { DateInput, TimeInput } from "@/components/ui/datetime-input";

export const Route = createFileRoute("/_authenticated/transport")({
  ssr: false,
  component: TransportPage,
});

type TripType = "one_way" | "round_trip";
type TransportPurpose = "hospital" | "checkup" | "emergency";
type ProviderChoice = "auto" | "uber" | "ola" | "medical_cab";
type DriverProvider = "Medical Cab" | "Uber" | "Ola";

type TransportStatus =
  | "pending"
  | "confirmed"
  | "driver_assigned"
  | "en_route"
  | "arrived"
  | "completed"
  | "cancelled";

type TransportBooking = {
  id: string;
  parent_id: string;
  requested_by: string;
  purpose: TransportPurpose;
  trip_type: TripType;
  pickup_address: string;
  destination: string;
  transport_date: string | null;
  transport_time: string | null;
  return_date: string | null;
  return_time: string | null;
  scheduled_at: string;
  notes: string | null;
  special_assistance: string | null;
  status: TransportStatus;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_vehicle: string | null;
  provider: string | null;
  next_status_at: string | null;
  cancellation_reason: string | null;
  confirmed_at: string | null;
  assigned_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_CONFIG: Record<
  TransportStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: {
    label: "Pending",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  confirmed: {
    label: "Confirmed",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  driver_assigned: {
    label: "Driver Assigned",
    bg: "bg-violet-50",
    text: "text-violet-700",
    dot: "bg-violet-500",
  },
  en_route: {
    label: "En Route",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  arrived: {
    label: "Arrived",
    bg: "bg-teal-50",
    text: "text-teal-700",
    dot: "bg-teal-500",
  },
  completed: {
    label: "Completed",
    bg: "bg-stone-100",
    text: "text-stone-600",
    dot: "bg-stone-400",
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-red-50",
    text: "text-red-600",
    dot: "bg-red-400",
  },
};

const PURPOSE_CONFIG: Record<TransportPurpose, { label: string; className: string }> = {
  hospital: { label: "Hospital Visit", className: "bg-rose-50 text-rose-700 border-rose-200" },
  checkup: { label: "Medical Checkup", className: "bg-sky-50 text-sky-700 border-sky-200" },
  emergency: { label: "Emergency", className: "bg-red-50 text-red-700 border-red-200" },
};

const CANCELLABLE_STATUSES: TransportStatus[] = [
  "pending",
  "confirmed",
  "driver_assigned",
  "en_route",
];
const EDITABLE_STATUSES: TransportStatus[] = ["pending", "confirmed"];
const HISTORY_STATUSES: TransportStatus[] = ["completed", "cancelled"];

function todayString() {
  return format(new Date(), "yyyy-MM-dd");
}

function combineLocalDateTime(date: string, time: string) {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function bookingTimestamp(booking: TransportBooking) {
  const dateTime = combineLocalDateTime(
    booking.transport_date ?? "",
    booking.transport_time?.slice(0, 5) ?? "",
  );
  if (dateTime) return dateTime.getTime();

  const scheduled = new Date(booking.scheduled_at).getTime();
  return Number.isNaN(scheduled) ? 0 : scheduled;
}

function formatDisplayDate(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return format(new Date(`${dateStr}T00:00:00`), "EEE, MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function formatDisplayTime(timeStr: string | null) {
  if (!timeStr) return "—";
  try {
    const [hours, minutes] = timeStr.split(":");
    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);
    return format(date, "h:mm a");
  } catch {
    return timeStr;
  }
}

function formatLifecycleTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, "MMM d, yyyy · h:mm a");
}

function mapsDirectionsUrl(pickup: string, destination: string) {
  const params = new URLSearchParams({
    api: "1",
    origin: pickup,
    destination,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function providerToChoice(provider: string | null): ProviderChoice {
  if (provider === "Uber") return "uber";
  if (provider === "Ola") return "ola";
  if (provider === "Medical Cab") return "medical_cab";
  return "auto";
}

function choiceToProvider(provider: ProviderChoice) {
  if (provider === "uber") return "Uber";
  if (provider === "ola") return "Ola";
  if (provider === "medical_cab") return "Medical Cab";
  return "Auto Match";
}

function StatusBadge({ status }: { status: TransportStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${config.bg} ${config.text}`}
    >
      <span className={`size-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function TripTypeBadge({ tripType }: { tripType: TripType }) {
  const isRoundTrip = tripType === "round_trip";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${isRoundTrip
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-stone-200 bg-stone-50 text-stone-600"
        }`}
    >
      {isRoundTrip ? <ArrowLeftRight className="size-2.5" /> : <ArrowRight className="size-2.5" />}
      {isRoundTrip ? "Round-Trip" : "One-Way"}
    </span>
  );
}

function PurposeBadge({ purpose }: { purpose: TransportPurpose }) {
  const config = PURPOSE_CONFIG[purpose] ?? PURPOSE_CONFIG.checkup;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function TransportPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingRide, setEditingRide] = useState<TransportBooking | null>(null);
  const [assigningRide, setAssigningRide] = useState<TransportBooking | null>(null);
  const [cancellingRide, setCancellingRide] = useState<TransportBooking | null>(null);

  const [tripType, setTripType] = useState<TripType>("one_way");
  const [purpose, setPurpose] = useState<TransportPurpose>("checkup");
  const [provider, setProvider] = useState<ProviderChoice>("auto");
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [transportDate, setTransportDate] = useState("");
  const [transportTime, setTransportTime] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [notes, setNotes] = useState("");
  const [specialAssistance, setSpecialAssistance] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverVehicle, setDriverVehicle] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [driverProvider, setDriverProvider] = useState<DriverProvider>("Medical Cab");
  const [lastUpdatedRideId, setLastUpdatedRideId] = useState<string | null>(null);

  useRealtimeTransportBookings(activeParentId, (payload: TransportRealtimePayload) => {
    const changedRide = (payload.eventType === "DELETE" ? payload.old : payload.new) as
      | TransportBooking
      | undefined;

    if (changedRide?.id) {
      setLastUpdatedRideId(changedRide.id);
      window.setTimeout(() => setLastUpdatedRideId(null), 1800);
    }
  });

  const { data: rides, isLoading } = useQuery({
    queryKey: ["transport", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transport_bookings")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as TransportBooking[];
    },
  });

  const driverIds = useMemo(
    () =>
      Array.from(
        new Set((rides ?? []).map((ride) => ride.driver_id).filter((id): id is string => !!id)),
      ),
    [rides],
  );

  const { data: driverProfiles } = useQuery({
    queryKey: ["driver-profiles", driverIds],
    enabled: driverIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", driverIds);

      if (error) throw error;
      return data ?? [];
    },
  });

  const driverMap = useMemo(
    () => new Map(driverProfiles?.map((profile) => [profile.id, profile.full_name]) ?? []),
    [driverProfiles],
  );

  function invalidateTransport() {
    queryClient.invalidateQueries({ queryKey: ["transport"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  function resetForm() {
    setTripType("one_way");
    setPurpose("checkup");
    setProvider("auto");
    setPickup("");
    setDestination("");
    setTransportDate("");
    setTransportTime("");
    setReturnDate("");
    setReturnTime("");
    setNotes("");
    setSpecialAssistance("");
  }

  function openNew(type: TripType = "one_way") {
    if (isChildView) {
      toast.error("You do not have permission to manage transport bookings.");
      return;
    }

    setEditingRide(null);
    resetForm();
    setTripType(type);
    setOpen(true);
  }

  function openEdit(ride: TransportBooking) {
    if (isChildView) {
      toast.error("You do not have permission to manage transport bookings.");
      return;
    }

    setEditingRide(ride);
    setTripType(ride.trip_type ?? "one_way");
    setPurpose(ride.purpose ?? "checkup");
    setProvider(providerToChoice(ride.provider));
    setPickup(ride.pickup_address);
    setDestination(ride.destination);
    setTransportDate(ride.transport_date ?? "");
    setTransportTime(ride.transport_time?.slice(0, 5) ?? "");
    setReturnDate(ride.return_date ?? "");
    setReturnTime(ride.return_time?.slice(0, 5) ?? "");
    setNotes(ride.notes ?? "");
    setSpecialAssistance(ride.special_assistance ?? "");
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditingRide(null);
    resetForm();
  }

  function openDriverAssignment(ride: TransportBooking) {
    setAssigningRide(ride);
    setDriverName(ride.driver_name ?? "");
    setDriverPhone(ride.driver_phone ?? "");
    setDriverVehicle(ride.driver_vehicle ?? "");
    setDriverProvider(
      ride.provider === "Uber" || ride.provider === "Ola" ? ride.provider : "Medical Cab",
    );
  }

  function closeDriverAssignment() {
    setAssigningRide(null);
    setDriverName("");
    setDriverPhone("");
    setDriverVehicle("");
    setDriverProvider("Medical Cab");
  }

  function openCancellation(ride: TransportBooking) {
    setCancellingRide(ride);
    setCancellationReason(ride.cancellation_reason ?? "");
  }

  function closeCancellation() {
    setCancellingRide(null);
    setCancellationReason("");
  }

  function validate() {
    const cleanPickup = pickup.trim();
    const cleanDestination = destination.trim();

    if (!cleanPickup) {
      toast.error("Pickup address is required.");
      return false;
    }
    if (!cleanDestination) {
      toast.error("Destination is required.");
      return false;
    }
    if (cleanPickup.toLowerCase() === cleanDestination.toLowerCase()) {
      toast.error("Pickup and destination cannot be the same.");
      return false;
    }
    if (!transportDate || !transportTime) {
      toast.error("Please select the transport date and time.");
      return false;
    }

    const outbound = combineLocalDateTime(transportDate, transportTime);
    if (!outbound) {
      toast.error("The selected transport date or time is invalid.");
      return false;
    }
    if (outbound.getTime() <= Date.now()) {
      toast.error("Transport must be scheduled for a future date and time.");
      return false;
    }

    if (tripType === "round_trip") {
      if (!returnDate || !returnTime) {
        toast.error("Please select the return date and time for a round trip.");
        return false;
      }

      const returnJourney = combineLocalDateTime(returnDate, returnTime);
      if (!returnJourney) {
        toast.error("The selected return date or time is invalid.");
        return false;
      }
      if (returnJourney.getTime() <= outbound.getTime()) {
        toast.error("Return time must be later than the outbound trip.");
        return false;
      }
    }

    return true;
  }

  const bookRide = useMutation({
    mutationFn: async () => {
      if (isChildView || !activeParentId) {
        throw new Error("You do not have permission to manage transport bookings.");
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Your session has expired. Please sign in again.");

      const outbound = combineLocalDateTime(transportDate, transportTime);
      if (!outbound) throw new Error("Invalid transport date or time.");

      const { data, error } = await supabase
        .from("transport_bookings")
        .insert({
          parent_id: activeParentId,
          requested_by: authData.user.id,
          purpose,
          trip_type: tripType,
          pickup_address: pickup.trim(),
          destination: destination.trim(),
          scheduled_at: outbound.toISOString(),
          transport_date: transportDate,
          transport_time: transportTime,
          return_date: tripType === "round_trip" ? returnDate : null,
          return_time: tripType === "round_trip" ? returnTime : null,
          notes: notes.trim() || null,
          special_assistance: specialAssistance.trim() || null,
          status: "pending",
          provider: choiceToProvider(provider),
          driver_name: null,
          driver_vehicle: null,
          next_status_at: null,
        } as never)
        .select("id")
        .single();

      if (error) throw error;
      if (!data) throw new Error("The booking was not created.");
    },
    onSuccess: () => {
      toast.success("Transport booking created.", {
        description: "The booking is pending. Confirm it when the ride is approved.",
      });
      closeDialog();
      invalidateTransport();
    },
    onError: (error: Error) => toast.error(error.message || "Unable to create the booking."),
  });

  const editRide = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView || !activeParentId) {
        throw new Error("You do not have permission to manage transport bookings.");
      }

      const outbound = combineLocalDateTime(transportDate, transportTime);
      if (!outbound) throw new Error("Invalid transport date or time.");

      const { data, error } = await supabase
        .from("transport_bookings")
        .update({
          purpose,
          trip_type: tripType,
          pickup_address: pickup.trim(),
          destination: destination.trim(),
          scheduled_at: outbound.toISOString(),
          transport_date: transportDate,
          transport_time: transportTime,
          return_date: tripType === "round_trip" ? returnDate : null,
          return_time: tripType === "round_trip" ? returnTime : null,
          notes: notes.trim() || null,
          special_assistance: specialAssistance.trim() || null,
          provider: choiceToProvider(provider),
        } as never)
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id");

      if (error) throw error;
      if (!data?.length) throw new Error("The booking was not updated or permission was denied.");
    },
    onSuccess: () => {
      toast.success("Transport booking updated.");
      closeDialog();
      invalidateTransport();
    },
    onError: (error: Error) => toast.error(error.message || "Unable to update the booking."),
  });

  const cancelRide = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (isChildView || !activeParentId) {
        throw new Error("You do not have permission to manage transport bookings.");
      }

      const cleanReason = reason.trim();
      if (cleanReason.length < 3) {
        throw new Error("Please enter a cancellation reason of at least 3 characters.");
      }

      const { data, error } = await supabase
        .from("transport_bookings")
        .update({
          status: "cancelled",
          cancellation_reason: cleanReason,
          next_status_at: null,
        } as never)
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id");

      if (error) throw error;
      if (!data?.length) throw new Error("The booking was not cancelled or permission was denied.");
    },
    onSuccess: () => {
      toast.success("Transport booking cancelled.");
      closeCancellation();
      invalidateTransport();
    },
    onError: (error: Error) => toast.error(error.message || "Unable to cancel the booking."),
  });

  const deleteRide = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView || !activeParentId) {
        throw new Error("You do not have permission to delete transport bookings.");
      }

      const { data, error } = await supabase
        .from("transport_bookings")
        .delete()
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id");

      if (error) throw error;
      if (!data?.length) throw new Error("The booking was not deleted or permission was denied.");
      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData<TransportBooking[]>(
        ["transport", activeParentId],
        (current) => current?.filter((ride) => ride.id !== deletedId) ?? [],
      );
      toast.success("Transport booking deleted.");
      invalidateTransport();
    },
    onError: (error: Error) => toast.error(error.message || "Unable to delete the booking."),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TransportStatus }) => {
      if (isChildView || !activeParentId) {
        throw new Error("You do not have permission to update transport bookings.");
      }

      const { data, error } = await supabase
        .from("transport_bookings")
        .update({ status, next_status_at: null } as never)
        .eq("id", id)
        .eq("parent_id", activeParentId)
        .select("id");

      if (error) throw error;
      if (!data?.length) throw new Error("The status was not changed or permission was denied.");
    },
    onSuccess: (_data, variables) => {
      toast.success(`Ride status changed to ${STATUS_CONFIG[variables.status].label}.`);
      invalidateTransport();
    },
    onError: (error: Error) => toast.error(error.message || "Unable to update ride status."),
  });

  const assignDriver = useMutation({
    mutationFn: async () => {
      if (!assigningRide || !activeParentId || isChildView) {
        throw new Error("No booking is selected for driver assignment.");
      }
      if (!driverName.trim()) throw new Error("Driver name is required.");
      if (driverPhone.trim().length < 7)
        throw new Error("A valid driver phone number is required.");
      if (!driverVehicle.trim()) throw new Error("Vehicle details are required.");

      const { data, error } = await supabase
        .from("transport_bookings")
        .update({
          status: "driver_assigned",
          driver_name: driverName.trim(),
          driver_phone: driverPhone.trim(),
          driver_vehicle: driverVehicle.trim(),
          provider: driverProvider,
          next_status_at: null,
        } as never)
        .eq("id", assigningRide.id)
        .eq("parent_id", activeParentId)
        .select("id");

      if (error) throw error;
      if (!data?.length) throw new Error("The driver was not assigned or permission was denied.");
    },
    onSuccess: () => {
      toast.success("Driver assigned successfully.");
      closeDriverAssignment();
      invalidateTransport();
    },
    onError: (error: Error) => toast.error(error.message || "Unable to assign the driver."),
  });

  function handleSubmit() {
    if (!validate()) return;
    if (editingRide) editRide.mutate(editingRide.id);
    else bookRide.mutate();
  }

  function handleCancel(ride: TransportBooking) {
    openCancellation(ride);
  }

  function handleDelete(ride: TransportBooking) {
    if (
      window.confirm(
        `Permanently delete the ${formatDisplayDate(ride.transport_date)} transport booking? This cannot be undone.`,
      )
    ) {
      deleteRide.mutate(ride.id);
    }
  }

  function handleWorkflow(ride: TransportBooking) {
    switch (ride.status) {
      case "pending":
        updateStatus.mutate({ id: ride.id, status: "confirmed" });
        break;
      case "confirmed":
        openDriverAssignment(ride);
        break;
      case "driver_assigned":
        updateStatus.mutate({ id: ride.id, status: "en_route" });
        break;
      case "en_route":
        updateStatus.mutate({ id: ride.id, status: "arrived" });
        break;
      case "arrived":
        updateStatus.mutate({ id: ride.id, status: "completed" });
        break;
      default:
        break;
    }
  }

  const activeRides = useMemo(
    () =>
      [...(rides ?? [])]
        .filter((ride) => !HISTORY_STATUSES.includes(ride.status))
        .sort((a, b) => bookingTimestamp(a) - bookingTimestamp(b)),
    [rides],
  );

  const historyRides = useMemo(
    () =>
      [...(rides ?? [])]
        .filter((ride) => HISTORY_STATUSES.includes(ride.status))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [rides],
  );

  const kpiStatuses: TransportStatus[] = ["pending", "confirmed", "driver_assigned", "en_route"];

  const formPending = editingRide ? editRide.isPending : bookRide.isPending;
  const actionPending =
    cancelRide.isPending ||
    deleteRide.isPending ||
    updateStatus.isPending ||
    assignDriver.isPending;

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold italic sm:text-4xl">
            Transport Request & Coordination
          </h1>
          <p className="mt-1 text-muted-foreground">
            Request and manually coordinate medical travel for {activeParent?.full_name ?? "—"}
          </p>
        </div>

        {!isChildView && (
          <Button
            id="btn-new-transport"
            disabled={!activeParentId}
            onClick={() => openNew()}
            className="cursor-pointer rounded-xl"
          >
            <Plus className="mr-2 size-4" />
            Book Transport
          </Button>
        )}
      </div>

      {isChildView && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert className="size-4 shrink-0" />
          You do not have permission to manage transport bookings. Viewing in read-only mode.
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
        This free module records and coordinates a transport request. It does not automatically book
        Uber, Ola, an ambulance, or a commercial medical cab. Driver details and ride statuses must
        be updated manually by the family or coordinator.
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpiStatuses.map((status) => {
          const count = (rides ?? []).filter((ride) => ride.status === status).length;
          const config = STATUS_CONFIG[status];
          return (
            <div
              key={status}
              className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4"
            >
              <span className={`font-mono text-[10px] uppercase tracking-widest ${config.text}`}>
                {config.label}
              </span>
              <p className="text-2xl font-bold">{count}</p>
            </div>
          );
        })}
      </div>

      {!isChildView && (
        <div className="mb-8">
          <h2 className="mb-4 font-display text-xl font-bold">Quick Book</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              id="btn-book-one-way"
              type="button"
              disabled={!activeParentId}
              onClick={() => openNew("one_way")}
              className="group cursor-pointer rounded-3xl border border-border bg-card p-6 text-left transition-all duration-200 hover:border-primary hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-stone-50 text-stone-600 transition-transform group-hover:scale-110">
                <ArrowRight className="size-5" />
              </div>
              <p className="font-display text-lg font-bold">One-Way Trip</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Single journey to your destination
              </p>
            </button>

            <button
              id="btn-book-round-trip"
              type="button"
              disabled={!activeParentId}
              onClick={() => openNew("round_trip")}
              className="group cursor-pointer rounded-3xl border border-border bg-card p-6 text-left transition-all duration-200 hover:border-primary hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 transition-transform group-hover:scale-110">
                <ArrowLeftRight className="size-5" />
              </div>
              <p className="font-display text-lg font-bold">Round-Trip</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Schedule the outbound and return journey
              </p>
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h2 className="mb-4 font-display text-xl font-bold">Transport Schedule</h2>

          {isLoading ? (
            <div className="animate-pulse rounded-3xl border border-border bg-card p-12 text-center text-muted-foreground">
              Loading transport bookings…
            </div>
          ) : activeRides.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card p-14 text-center text-muted-foreground">
              <Car className="mx-auto mb-3 size-10 opacity-30" />
              <p className="text-base font-semibold">No active transport bookings.</p>
              {!isChildView && (
                <p className="mt-1 text-sm">Use the cards above to schedule a ride.</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
              {activeRides.map((ride) => (
                <RideRow
                  key={ride.id}
                  ride={ride}
                  isChildView={isChildView}
                  onEdit={() => openEdit(ride)}
                  onCancel={() => handleCancel(ride)}
                  onDelete={() => handleDelete(ride)}
                  onWorkflow={() => handleWorkflow(ride)}
                  isActionPending={actionPending}
                  driverName={driverMap.get(ride.driver_id ?? "") ?? ride.driver_name ?? undefined}
                  isUpdated={lastUpdatedRideId === ride.id}
                />
              ))}
            </div>
          )}
        </div>

        {historyRides.length > 0 && (
          <div>
            <h2 className="mb-4 font-display text-xl font-bold text-muted-foreground">History</h2>
            <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
              {historyRides.map((ride) => (
                <RideRow
                  key={ride.id}
                  ride={ride}
                  isChildView={isChildView}
                  onEdit={() => openEdit(ride)}
                  onCancel={() => handleCancel(ride)}
                  onDelete={() => handleDelete(ride)}
                  onWorkflow={() => handleWorkflow(ride)}
                  isActionPending={actionPending}
                  driverName={driverMap.get(ride.driver_id ?? "") ?? ride.driver_name ?? undefined}
                  isUpdated={lastUpdatedRideId === ride.id}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) closeDialog();
          else setOpen(true);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-bold">
              {editingRide ? "Edit Transport Booking" : "Book Medical Transport"}
            </DialogTitle>
            <DialogDescription>
              Enter the actual journey details. The ride status changes only when you use the
              workflow buttons.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tr-trip-type">Trip Type</Label>
                <Select value={tripType} onValueChange={(value) => setTripType(value as TripType)}>
                  <SelectTrigger id="tr-trip-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_way">One-Way Trip</SelectItem>
                    <SelectItem value="round_trip">Round-Trip</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tr-purpose">Purpose</Label>
                <Select
                  value={purpose}
                  onValueChange={(value) => setPurpose(value as TransportPurpose)}
                >
                  <SelectTrigger id="tr-purpose">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checkup">Medical Checkup</SelectItem>
                    <SelectItem value="hospital">Hospital Visit</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tr-provider">Preferred Provider</Label>
              <Select
                value={provider}
                onValueChange={(value) => setProvider(value as ProviderChoice)}
              >
                <SelectTrigger id="tr-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Any Available Provider</SelectItem>
                  <SelectItem value="medical_cab">Medical Cab</SelectItem>
                  <SelectItem value="uber">Uber</SelectItem>
                  <SelectItem value="ola">Ola</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                This saves your preference. It does not automatically place a booking with Uber or
                Ola.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tr-pickup">
                Pickup Address <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="tr-pickup"
                  value={pickup}
                  onChange={(event) => setPickup(event.target.value)}
                  placeholder="e.g. 12 Park Lane, Home"
                  maxLength={200}
                  className="pr-11"
                />
                <button
                  type="button"
                  disabled={isLocating}
                  title="Use current GPS coordinates"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      toast.error("Geolocation is not supported by this browser.");
                      return;
                    }

                    setIsLocating(true);
                    navigator.geolocation.getCurrentPosition(
                      (position) => {
                        setIsLocating(false);
                        setPickup(
                          `GPS coordinates: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`,
                        );
                        toast.success("Current GPS coordinates added.");
                      },
                      (error) => {
                        setIsLocating(false);
                        toast.error(
                          error.code === error.PERMISSION_DENIED
                            ? "Location permission was denied. Enter the address manually."
                            : "Unable to detect your location. Enter the address manually.",
                        );
                      },
                      { enableHighAccuracy: true, timeout: 10_000 },
                    );
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-lg p-1 text-stone-400 transition-colors hover:text-emerald-600 disabled:opacity-50"
                >
                  <Locate
                    className={`size-4 ${isLocating ? "animate-pulse text-emerald-600" : ""}`}
                  />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {["Home", "City Hospital", "Apollo Clinic", "Central Metro Station"].map(
                  (location) => (
                    <button
                      key={location}
                      type="button"
                      onClick={() => setPickup(location)}
                      className="cursor-pointer rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      {location}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tr-destination">
                Destination <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tr-destination"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="e.g. City Hospital, Sector 5"
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tr-date">
                  Outbound Date <span className="text-destructive">*</span>
                </Label>
                <DateInput
                  id="tr-date"
                  value={transportDate}
                  min={todayString()}
                  onChange={setTransportDate}
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-time">
                  Outbound Time <span className="text-destructive">*</span>
                </Label>
                <TimeInput
                  id="tr-time"
                  value={transportTime}
                  onChange={setTransportTime}
                  placeholder="HH:MM"
                />
              </div>
            </div>

            {tripType === "round_trip" && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                <p className="mb-3 text-sm font-semibold text-sky-800">Return Journey</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tr-return-date">
                      Return Date <span className="text-destructive">*</span>
                    </Label>
                    <DateInput
                      id="tr-return-date"
                      value={returnDate}
                      min={transportDate || todayString()}
                      onChange={setReturnDate}
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tr-return-time">
                      Return Time <span className="text-destructive">*</span>
                    </Label>
                    <TimeInput
                      id="tr-return-time"
                      value={returnTime}
                      onChange={setReturnTime}
                      placeholder="HH:MM"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tr-notes">
                Patient Notes <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="tr-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. Diabetic patient, handle with care"
                rows={2}
                maxLength={300}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tr-special">
                Special Assistance Required{" "}
                <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="tr-special"
                value={specialAssistance}
                onChange={(event) => setSpecialAssistance(event.target.value)}
                placeholder="e.g. Wheelchair, stretcher, oxygen"
                maxLength={200}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={formPending}>
              Cancel
            </Button>
            <Button
              id="btn-submit-transport"
              onClick={handleSubmit}
              disabled={formPending || !activeParentId}
            >
              {formPending
                ? editingRide
                  ? "Saving…"
                  : "Booking…"
                : editingRide
                  ? "Save Changes"
                  : "Book Transport"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!assigningRide}
        onOpenChange={(value) => {
          if (!value) closeDriverAssignment();
        }}
      >
        <DialogContent className="rounded-3xl sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Assign Driver</DialogTitle>
            <DialogDescription>
              Enter the actual driver and vehicle details. These details will be visible in the ride
              card.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="driver-provider">Provider</Label>
              <Select
                value={driverProvider}
                onValueChange={(value) => setDriverProvider(value as DriverProvider)}
              >
                <SelectTrigger id="driver-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Medical Cab">Medical Cab</SelectItem>
                  <SelectItem value="Uber">Uber</SelectItem>
                  <SelectItem value="Ola">Ola</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="driver-name">Driver Name</Label>
              <Input
                id="driver-name"
                value={driverName}
                onChange={(event) => setDriverName(event.target.value)}
                placeholder="e.g. Rahul Sharma"
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="driver-phone">Driver Phone</Label>
              <Input
                id="driver-phone"
                type="tel"
                value={driverPhone}
                onChange={(event) => setDriverPhone(event.target.value)}
                placeholder="e.g. +91 98765 43210"
                maxLength={30}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="driver-vehicle">Vehicle Details</Label>
              <Input
                id="driver-vehicle"
                value={driverVehicle}
                onChange={(event) => setDriverVehicle(event.target.value)}
                placeholder="e.g. White Swift Dzire, MH 01 AB 1234"
                maxLength={150}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeDriverAssignment}
              disabled={assignDriver.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => assignDriver.mutate()} disabled={assignDriver.isPending}>
              {assignDriver.isPending ? "Assigning…" : "Assign Driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!cancellingRide}
        onOpenChange={(value) => {
          if (!value) closeCancellation();
        }}
      >
        <DialogContent className="rounded-3xl sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Cancel Transport Request</DialogTitle>
            <DialogDescription>
              The request will remain in history, and linked family members will receive the
              cancellation update.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="transport-cancellation-reason">Cancellation Reason</Label>
            <Textarea
              id="transport-cancellation-reason"
              value={cancellationReason}
              onChange={(event) => setCancellationReason(event.target.value)}
              placeholder="e.g. Appointment rescheduled or transport arranged separately"
              rows={3}
              maxLength={300}
              className="resize-none"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeCancellation} disabled={cancelRide.isPending}>
              Keep Booking
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!cancellingRide) return;
                cancelRide.mutate({ id: cancellingRide.id, reason: cancellationReason });
              }}
              disabled={cancelRide.isPending || cancellationReason.trim().length < 3}
            >
              {cancelRide.isPending ? "Cancelling…" : "Cancel Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function workflowButton(status: TransportStatus) {
  switch (status) {
    case "pending":
      return { label: "Confirm Booking", icon: <Check className="size-3.5" /> };
    case "confirmed":
      return { label: "Assign Driver", icon: <UserCheck className="size-3.5" /> };
    case "driver_assigned":
      return { label: "Mark En Route", icon: <Play className="size-3.5" /> };
    case "en_route":
      return { label: "Mark Arrived", icon: <MapPin className="size-3.5" /> };
    case "arrived":
      return { label: "Complete Ride", icon: <CheckCircle2 className="size-3.5" /> };
    default:
      return null;
  }
}

function RideRow({
  ride,
  isChildView,
  onEdit,
  onCancel,
  onDelete,
  onWorkflow,
  isActionPending,
  driverName,
  isUpdated,
}: {
  ride: TransportBooking;
  isChildView: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onWorkflow: () => void;
  isActionPending: boolean;
  driverName?: string;
  isUpdated?: boolean;
}) {
  const canEdit = !isChildView && EDITABLE_STATUSES.includes(ride.status);
  const canCancel = !isChildView && CANCELLABLE_STATUSES.includes(ride.status);
  const canDelete = !isChildView && HISTORY_STATUSES.includes(ride.status);
  const workflow = !isChildView ? workflowButton(ride.status) : null;
  const driverKnown = ["driver_assigned", "en_route", "arrived", "completed"].includes(ride.status);
  const isPastDue =
    !HISTORY_STATUSES.includes(ride.status) &&
    bookingTimestamp(ride) > 0 &&
    bookingTimestamp(ride) < Date.now();

  const showUber = !ride.provider || ["Auto Match", "Uber"].includes(ride.provider);
  const showOla = !ride.provider || ["Auto Match", "Ola"].includes(ride.provider);
  const directionsUrl = mapsDirectionsUrl(ride.pickup_address, ride.destination);
  const lifecycleTime =
    ride.status === "confirmed"
      ? ride.confirmed_at
      : ride.status === "driver_assigned"
        ? ride.assigned_at
        : ride.status === "en_route"
          ? ride.en_route_at
          : ride.status === "arrived"
            ? ride.arrived_at
            : ride.status === "completed"
              ? ride.completed_at
              : ride.status === "cancelled"
                ? ride.cancelled_at
                : ride.created_at;

  return (
    <div
      className={`flex items-start gap-4 p-4 transition-colors hover:bg-stone-50/50 sm:gap-5 sm:p-5 ${ride.status === "en_route" || ride.status === "driver_assigned"
          ? "border-l-4 border-emerald-400"
          : ""
        } ${isUpdated ? "animate-flash" : ""}`}
    >
      <div
        className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${ride.trip_type === "round_trip" ? "bg-sky-50 text-sky-600" : "bg-stone-100 text-stone-600"
          }`}
      >
        {ride.trip_type === "round_trip" ? (
          <ArrowLeftRight className="size-5" />
        ) : (
          <Navigation className="size-5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <TripTypeBadge tripType={ride.trip_type ?? "one_way"} />
          <PurposeBadge purpose={ride.purpose ?? "checkup"} />
          <StatusBadge status={ride.status} />
          {ride.provider && ride.provider !== "Auto Match" && (
            <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
              {ride.provider}
            </span>
          )}
          {isPastDue && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              <AlertTriangle className="size-3" /> Past due
            </span>
          )}
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-2 text-sm font-medium text-stone-800">
          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{ride.pickup_address}</span>
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{ride.destination}</span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatDisplayDate(ride.transport_date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {formatDisplayTime(ride.transport_time)}
          </span>
        </div>

        {formatLifecycleTime(lifecycleTime) && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {STATUS_CONFIG[ride.status].label}: {formatLifecycleTime(lifecycleTime)}
          </p>
        )}

        {ride.trip_type === "round_trip" && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-700">
            <span className="font-semibold">Return:</span>
            <span>{formatDisplayDate(ride.return_date)}</span>
            <span>{formatDisplayTime(ride.return_time)}</span>
          </div>
        )}

        {ride.notes && (
          <div className="mt-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-600">
            {ride.notes}
          </div>
        )}

        {ride.special_assistance && (
          <div className="mt-1.5 flex w-fit items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
            <UserCheck className="size-3" />
            Special assistance: {ride.special_assistance}
          </div>
        )}

        {driverKnown && (ride.driver_name || driverName) && (
          <div className="mt-1.5 flex w-fit flex-wrap items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-1 text-xs text-violet-700">
            <UserCheck className="size-3" />
            <span>Driver: {driverName || ride.driver_name}</span>
            {ride.driver_vehicle && (
              <span className="font-mono text-[10px] text-violet-500">({ride.driver_vehicle})</span>
            )}
            {ride.driver_phone && (
              <a
                href={`tel:${ride.driver_phone}`}
                className="inline-flex items-center gap-1 font-semibold text-violet-700 underline-offset-2 hover:underline"
              >
                <Phone className="size-3" />
                {ride.driver_phone}
              </a>
            )}
          </div>
        )}

        {ride.status === "cancelled" && ride.cancellation_reason && (
          <div className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            Cancellation reason: {ride.cancellation_reason}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <Navigation className="size-3.5" />
            Google Maps Route
          </a>
        </div>

        {ride.status !== "cancelled" && ride.status !== "completed" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {showUber && (
              <a
                href={`https://m.uber.com/ul/?action=setPickup&pickup[formatted_address]=${encodeURIComponent(
                  ride.pickup_address,
                )}&dropoff[formatted_address]=${encodeURIComponent(ride.destination)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-black px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-stone-800"
              >
                Open Uber
              </a>
            )}
            {showOla && (
              <a
                href="https://book.olacabs.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-black shadow-sm transition-colors hover:bg-amber-500"
              >
                Open Ola
              </a>
            )}

            {workflow && (
              <button
                type="button"
                onClick={onWorkflow}
                disabled={isActionPending}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {workflow.icon}
                {workflow.label}
              </button>
            )}
          </div>
        )}
      </div>

      {!isChildView && (
        <div className="mt-0.5 flex shrink-0 items-center gap-1">
          {canEdit && (
            <button
              id={`btn-edit-${ride.id}`}
              type="button"
              onClick={onEdit}
              disabled={isActionPending}
              className="cursor-pointer rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
              title="Edit booking"
              aria-label="Edit booking"
            >
              <Pencil className="size-4" />
            </button>
          )}

          {canCancel && (
            <button
              id={`btn-cancel-${ride.id}`}
              type="button"
              onClick={onCancel}
              disabled={isActionPending}
              className="cursor-pointer rounded-lg p-2 text-stone-400 transition-colors hover:bg-red-50 hover:text-destructive disabled:opacity-40"
              title="Cancel booking"
              aria-label="Cancel booking"
            >
              <XCircle className="size-4" />
            </button>
          )}

          {canDelete && (
            <button
              id={`btn-delete-${ride.id}`}
              type="button"
              onClick={onDelete}
              disabled={isActionPending}
              className="cursor-pointer rounded-lg p-2 text-stone-400 transition-colors hover:bg-red-50 hover:text-destructive disabled:opacity-40"
              title="Delete booking permanently"
              aria-label="Delete booking permanently"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}