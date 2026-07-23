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
  {
    label: string;
    bg: string;
    text: string;
    dot: string;
  }
> = {
  pending: {
    label: "Pending",
    bg: "bg-[#f7eddf]",
    text: "text-[#9b6638]",
    dot: "bg-[#c98b4d]",
  },
  confirmed: {
    label: "Confirmed",
    bg: "bg-[#e8eff5]",
    text: "text-[#4b6d8e]",
    dot: "bg-[#e8eff5]0",
  },
  driver_assigned: {
    label: "Driver Assigned",
    bg: "bg-[#eeebf4]",
    text: "text-[#6f6388]",
    dot: "bg-[#eeebf4]0",
  },
  en_route: {
    label: "En Route",
    bg: "bg-[#e6f2ed]",
    text: "text-[#1b725f]",
    dot: "bg-[#e6f2ed]0",
  },
  arrived: {
    label: "Arrived",
    bg: "bg-[#e2f1ed]",
    text: "text-[#176f69]",
    dot: "bg-[#e2f1ed]0",
  },
  completed: {
    label: "Completed",
    bg: "bg-[#edf2f0]",
    text: "text-[#60777b]",
    dot: "bg-[#8aa09f]",
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-[#f8e7e5]",
    text: "text-[#aa4e49]",
    dot: "bg-[#c8655f]",
  },
};
const PURPOSE_CONFIG: Record<
  TransportPurpose,
  {
    label: string;
    className: string;
  }
> = {
  hospital: { label: "Hospital Visit", className: "bg-[#f8e9e6] text-[#a95850] border-[#edceca]" },
  checkup: { label: "Medical Checkup", className: "bg-[#e8f1f4] text-[#4a7280] border-[#cddfe4]" },
  emergency: { label: "Emergency", className: "bg-[#f8e7e5] text-red-700 border-red-200" },
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
          : "border-stone-200 bg-stone-50 text-[#60777b]"
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
  const nextRide = activeRides[0] ?? null;
  const pendingCount = (rides ?? []).filter((ride) => ride.status === "pending").length;
  const assignedCount = (rides ?? []).filter((ride) =>
    ["driver_assigned", "en_route", "arrived"].includes(ride.status),
  ).length;
  const completedCount = (rides ?? []).filter((ride) => ride.status === "completed").length;
  return (
    <AppShell>
      <div className="space-y-6 pb-10">
        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)]">
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-7">
            <div className="max-w-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#e7f2ee] px-3 py-1.5 text-xs font-bold text-[#176f69]">
                  <Car className="size-3.5" />
                  Care transport
                </span>

                {isChildView && (
                  <span className="rounded-full border border-[#d8e5e1] bg-[#f7faf9] px-3 py-1.5 text-xs font-semibold text-[#647b80]">
                    Read-only family view
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#122f35] sm:text-4xl">
                Medical transport
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[#667d82] sm:text-base">
                Plan and coordinate safe medical travel for{" "}
                <span className="font-semibold text-[#294b50]">
                  {activeParent?.full_name ?? "the selected profile"}
                </span>
                , from pickup details through driver assignment and trip completion.
              </p>
            </div>

            {!isChildView && (
              <Button
                id="btn-new-transport"
                type="button"
                disabled={!activeParentId}
                onClick={() => openNew()}
                className="h-11 rounded-xl bg-[#0d6665] px-5 font-semibold text-white shadow-[0_14px_30px_-18px_rgba(13,102,101,0.9)] hover:bg-[#0a5958]"
              >
                <Plus className="size-4" />
                Book transport
              </Button>
            )}
          </div>

          <div className="grid border-t border-[#e2ece9] bg-[#f7faf9] sm:grid-cols-2 lg:grid-cols-4">
            <SummaryMetric
              label="Active bookings"
              value={String(activeRides.length)}
              detail="Current transport plans"
              icon={Car}
              iconBackground="bg-[#e5f2ed]"
              iconClass="text-[#19705f]"
            />

            <SummaryMetric
              label="Awaiting confirmation"
              value={String(pendingCount)}
              detail="Requests requiring action"
              icon={Clock}
              iconBackground="bg-[#f7eddf]"
              iconClass="text-[#996337]"
            />

            <SummaryMetric
              label="Assigned or travelling"
              value={String(assignedCount)}
              detail="Trips currently coordinated"
              icon={Navigation}
              iconBackground="bg-[#e8eff5]"
              iconClass="text-[#4d6f8e]"
            />

            <SummaryMetric
              label="Completed"
              value={String(completedCount)}
              detail="Finished transport journeys"
              icon={CheckCircle2}
              iconBackground="bg-[#edf2f0]"
              iconClass="text-[#60777b]"
              last
            />
          </div>
        </section>

        {isChildView && (
          <section className="flex items-start gap-3 rounded-2xl border border-[#ead8c5] bg-[#fbf6f0] p-4 text-sm text-[#806247]">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              You can review transport details, route links and driver information, but only the
              parent account can create or manage bookings.
            </p>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[1.5rem] border border-[#dce8e4] bg-white p-5 shadow-[0_18px_45px_-38px_rgba(18,49,54,0.45)] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#758b8f]">
                  Next scheduled journey
                </p>

                {nextRide ? (
                  <>
                    <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-[#17343a]">
                      {nextRide.pickup_address} to {nextRide.destination}
                    </h2>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <PurposeBadge purpose={nextRide.purpose ?? "checkup"} />
                      <TripTypeBadge tripType={nextRide.trip_type ?? "one_way"} />
                      <StatusBadge status={nextRide.status} />
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-[#17343a]">
                      No journey scheduled
                    </h2>
                    <p className="mt-2 text-sm text-[#71868a]">
                      Create a booking when medical travel is required.
                    </p>
                  </>
                )}
              </div>

              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7f2ee] text-[#176f69]">
                <Navigation className="size-5" />
              </span>
            </div>

            {nextRide && (
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <JourneyDetail
                  icon={CalendarDays}
                  label="Date"
                  value={formatDisplayDate(nextRide.transport_date)}
                />
                <JourneyDetail
                  icon={Clock}
                  label="Pickup time"
                  value={formatDisplayTime(nextRide.transport_time)}
                />
                <JourneyDetail
                  icon={UserCheck}
                  label="Driver"
                  value={
                    driverMap.get(nextRide.driver_id ?? "") ??
                    nextRide.driver_name ??
                    "Not assigned"
                  }
                />
              </div>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-[#dce8e4] bg-[#0c3f45] p-5 text-white shadow-[0_18px_45px_-38px_rgba(18,49,54,0.55)] sm:p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-[#a8d7cb]">
                <ShieldAlert className="size-5" />
              </span>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#a9cbc5]">
                  Coordination notice
                </p>
                <h2 className="mt-2 text-lg font-bold">Manual booking workflow</h2>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  This module records and coordinates travel. It does not automatically reserve an
                  Uber, Ola, ambulance or commercial medical cab. The family coordinator updates
                  driver details and ride progress manually.
                </p>
              </div>
            </div>
          </div>
        </section>

        {!isChildView && (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                Quick booking
              </h2>
              <p className="mt-1 text-sm text-[#71868a]">
                Start with the journey type and complete the travel details in the booking form.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <button
                id="btn-book-one-way"
                type="button"
                disabled={!activeParentId}
                onClick={() => openNew("one_way")}
                className="group rounded-2xl border border-[#dce7e3] bg-white p-5 text-left shadow-[0_16px_38px_-32px_rgba(16,49,54,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-[#b8d1c9] hover:shadow-[0_22px_42px_-30px_rgba(16,49,54,0.35)] disabled:cursor-not-allowed disabled:opacity-50 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#edf2f0] text-[#587277]">
                    <ArrowRight className="size-5" />
                  </span>
                  <span className="text-xs font-bold text-[#7c9094] transition-colors group-hover:text-[#0d7774]">
                    New booking
                  </span>
                </div>

                <h3 className="mt-5 text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                  One-way journey
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#71868a]">
                  Coordinate a single pickup and drop-off for an appointment or hospital visit.
                </p>
              </button>

              <button
                id="btn-book-round-trip"
                type="button"
                disabled={!activeParentId}
                onClick={() => openNew("round_trip")}
                className="group rounded-2xl border border-[#dce7e3] bg-white p-5 text-left shadow-[0_16px_38px_-32px_rgba(16,49,54,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-[#b8d1c9] hover:shadow-[0_22px_42px_-30px_rgba(16,49,54,0.35)] disabled:cursor-not-allowed disabled:opacity-50 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#e7f0f4] text-[#4c7180]">
                    <ArrowLeftRight className="size-5" />
                  </span>
                  <span className="text-xs font-bold text-[#7c9094] transition-colors group-hover:text-[#0d7774]">
                    New booking
                  </span>
                </div>

                <h3 className="mt-5 text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                  Round-trip journey
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#71868a]">
                  Schedule both outbound and return travel in one coordinated booking.
                </p>
              </button>
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
          <div className="flex flex-col gap-2 border-b border-[#e3ece9] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                Active transport schedule
              </h2>
              <p className="mt-1 text-sm text-[#72868a]">
                Follow each request from approval through arrival and completion.
              </p>
            </div>

            <span className="rounded-full bg-[#edf3f1] px-3 py-1.5 text-xs font-semibold text-[#60787c]">
              {activeRides.length} active
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5 sm:p-6">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex animate-pulse items-center gap-4 rounded-xl py-3">
                  <div className="size-12 rounded-xl bg-[#edf2f0]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-48 rounded bg-[#e7eeec]" />
                    <div className="h-3 w-64 max-w-full rounded bg-[#eff3f2]" />
                  </div>
                </div>
              ))}
            </div>
          ) : activeRides.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-[#e7f2ee] text-[#176f69]">
                <Car className="size-6" />
              </span>
              <h3 className="mt-5 text-lg font-bold text-[#1c3b41]">
                No active transport bookings
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#71868a]">
                Upcoming and in-progress journeys will appear here.
              </p>
              {!isChildView && (
                <Button
                  type="button"
                  className="mt-6 h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
                  onClick={() => openNew()}
                >
                  <Plus className="size-4" />
                  Book transport
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#e7eeec]">
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
        </section>

        {historyRides.length > 0 && (
          <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e3ece9] px-5 py-5 sm:px-6">
              <div>
                <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                  Transport history
                </h2>
                <p className="mt-1 text-sm text-[#72868a]">
                  Completed and cancelled journeys remain available for reference.
                </p>
              </div>

              <span className="rounded-full bg-[#edf3f1] px-3 py-1.5 text-xs font-semibold text-[#60787c]">
                {historyRides.length} records
              </span>
            </div>

            <div className="divide-y divide-[#e7eeec]">
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
          </section>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) closeDialog();
          else setOpen(true);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] border-[#dce7e3] p-0 sm:max-w-[620px]">
          <DialogHeader className="border-b border-[#e3ece9] px-6 py-5 text-left">
            <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">
              {editingRide ? "Edit Transport Booking" : "Book Medical Transport"}
            </DialogTitle>
            <DialogDescription>
              Enter the actual journey details. The ride status changes only when you use the
              workflow buttons.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
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
                      { enableHighAccuracy: true, timeout: 10000 },
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

          <DialogFooter className="border-t border-[#e3ece9] px-6 py-5">
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
        <DialogContent className="rounded-[1.5rem] border-[#dce7e3] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">Assign driver</DialogTitle>
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
        <DialogContent className="rounded-[1.5rem] border-[#dce7e3] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">Cancel transport request</DialogTitle>
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
    <article
      className={`relative px-5 py-5 transition-colors hover:bg-[#fbfdfc] sm:px-6 ${isUpdated ? "animate-flash" : ""
        }`}
    >
      {(ride.status === "en_route" || ride.status === "driver_assigned") && (
        <span className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-[#4b9b7d]" />
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div
          className={`grid size-12 shrink-0 place-items-center rounded-xl ${ride.trip_type === "round_trip"
              ? "bg-[#e7f0f4] text-[#4c7180]"
              : "bg-[#edf2f0] text-[#587277]"
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
              <span className="inline-flex items-center rounded-full border border-[#dce6e3] bg-[#f7faf9] px-2.5 py-1 text-[10px] font-semibold text-[#61777b]">
                {ride.provider}
              </span>
            )}

            {isPastDue && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#ebc8c4] bg-[#f8e5e3] px-2.5 py-1 text-[10px] font-semibold text-[#a84742]">
                <AlertTriangle className="size-3" />
                Past due
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-3 rounded-2xl border border-[#e2ebe8] bg-[#f8fbfa] p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#849599]">
                Pickup
              </p>
              <p className="mt-1 truncate text-sm font-bold text-[#24454a]">
                {ride.pickup_address}
              </p>
            </div>

            <span className="hidden size-8 place-items-center rounded-full bg-white text-[#6c8286] shadow-sm sm:grid">
              <ArrowRight className="size-3.5" />
            </span>

            <div className="min-w-0 sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#849599]">
                Destination
              </p>
              <p className="mt-1 truncate text-sm font-bold text-[#24454a]">
                {ride.destination}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-[#687f83]">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5 text-[#0d7774]" />
              {formatDisplayDate(ride.transport_date)}
            </span>

            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-[#0d7774]" />
              {formatDisplayTime(ride.transport_time)}
            </span>

            {formatLifecycleTime(lifecycleTime) && (
              <span className="text-[#819397]">
                {STATUS_CONFIG[ride.status].label}: {formatLifecycleTime(lifecycleTime)}
              </span>
            )}
          </div>

          {ride.trip_type === "round_trip" && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[#d2e2e7] bg-[#edf5f7] px-3 py-2.5 text-xs text-[#4c7180]">
              <ArrowLeftRight className="size-3.5" />
              <span className="font-bold">Return journey</span>
              <span>{formatDisplayDate(ride.return_date)}</span>
              <span>{formatDisplayTime(ride.return_time)}</span>
            </div>
          )}

          {(ride.notes || ride.special_assistance) && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ride.notes && (
                <div className="rounded-xl border border-[#e4ebe9] bg-white px-3 py-2.5 text-xs leading-5 text-[#657b7f]">
                  <span className="font-bold text-[#3c5a5f]">Notes: </span>
                  {ride.notes}
                </div>
              )}

              {ride.special_assistance && (
                <div className="flex items-start gap-2 rounded-xl border border-[#ead8c5] bg-[#fbf6f0] px-3 py-2.5 text-xs leading-5 text-[#806247]">
                  <UserCheck className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <span className="font-bold">Assistance: </span>
                    {ride.special_assistance}
                  </span>
                </div>
              )}
            </div>
          )}

          {driverKnown && (ride.driver_name || driverName) && (
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[#ddd9e7] bg-[#f4f2f8] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e4dfea] text-[#6f6388]">
                  <UserCheck className="size-4" />
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#403c4a]">
                    {driverName || ride.driver_name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[#766e84]">
                    {[ride.provider, ride.driver_vehicle].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>

              {ride.driver_phone && (
                <a
                  href={`tel:${ride.driver_phone}`}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#d3cede] bg-white px-3 text-xs font-bold text-[#655b78] transition hover:bg-[#faf9fc]"
                >
                  <Phone className="size-3.5" />
                  Call driver
                </a>
              )}
            </div>
          )}

          {ride.status === "cancelled" && ride.cancellation_reason && (
            <div className="mt-3 rounded-xl border border-[#ebc8c4] bg-[#fff6f5] px-3 py-2.5 text-xs leading-5 text-[#9a4d48]">
              <span className="font-bold">Cancellation reason: </span>
              {ride.cancellation_reason}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#cbded8] bg-[#f0f7f4] px-3 text-xs font-bold text-[#1e7168] transition hover:bg-[#e6f2ee]"
            >
              <Navigation className="size-3.5" />
              View route
            </a>

            {ride.status !== "cancelled" && ride.status !== "completed" && (
              <>
                {showUber && (
                  <a
                    href={`https://m.uber.com/ul/?action=setPickup&pickup[formatted_address]=${encodeURIComponent(ride.pickup_address)}&dropoff[formatted_address]=${encodeURIComponent(ride.destination)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center rounded-lg bg-[#1f2628] px-3 text-xs font-bold text-white transition hover:bg-black"
                  >
                    Open Uber
                  </a>
                )}

                {showOla && (
                  <a
                    href="https://book.olacabs.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center rounded-lg border border-[#ddd7b8] bg-[#f5f1d9] px-3 text-xs font-bold text-[#5d5632] transition hover:bg-[#eee8c7]"
                  >
                    Open Ola
                  </a>
                )}

                {workflow && (
                  <button
                    type="button"
                    onClick={onWorkflow}
                    disabled={isActionPending}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0d6665] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#0a5958] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {workflow.icon}
                    {workflow.label}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {!isChildView && (
          <div className="flex shrink-0 items-center gap-1 lg:flex-col">
            {canEdit && (
              <button
                id={`btn-edit-${ride.id}`}
                type="button"
                onClick={onEdit}
                disabled={isActionPending}
                className="grid size-9 place-items-center rounded-lg text-[#71868a] transition hover:bg-[#edf3f1] hover:text-[#23494d] disabled:opacity-40"
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
                className="grid size-9 place-items-center rounded-lg text-[#8c7774] transition hover:bg-[#fff1ef] hover:text-[#9d4843] disabled:opacity-40"
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
                className="grid size-9 place-items-center rounded-lg text-[#8c7774] transition hover:bg-[#fff1ef] hover:text-[#9d4843] disabled:opacity-40"
                title="Delete booking permanently"
                aria-label="Delete booking permanently"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
  icon: Icon,
  iconBackground,
  iconClass,
  last = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Car;
  iconBackground: string;
  iconClass: string;
  last?: boolean;
}) {
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

function JourneyDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[#e2ebe8] bg-[#f8fbfa] p-3.5">
      <div className="flex items-center gap-2 text-[#6d8387]">
        <Icon className="size-3.5 text-[#0d7774]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.11em]">
          {label}
        </span>
      </div>
      <p className="mt-2 truncate text-sm font-bold text-[#29494e]">{value}</p>
    </div>
  );
}