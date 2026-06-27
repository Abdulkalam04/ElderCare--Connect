import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useActiveParent } from "@/hooks/useProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Car,
  ArrowRight,
  ArrowLeftRight,
  MapPin,
  Clock,
  CalendarDays,
  Pencil,
  XCircle,
  ShieldAlert,
  Plus,
  Navigation,
  UserCheck,
  Locate,
  Compass,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/transport")({
  ssr: false,
  component: TransportPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type TripType = "one_way" | "round_trip";

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
  trip_type: TripType;
  pickup_address: string;
  destination: string;
  transport_date: string | null;
  transport_time: string | null;
  scheduled_at: string;
  notes: string | null;
  special_assistance: string | null;
  status: TransportStatus;
  driver_id: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

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

const CANCELLABLE_STATUSES: TransportStatus[] = [
  "pending",
  "confirmed",
  "driver_assigned",
  "en_route",
];
const EDITABLE_STATUSES: TransportStatus[] = [
  "pending",
  "confirmed",
  "driver_assigned",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayString() {
  return format(new Date(), "yyyy-MM-dd");
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
    const [h, m] = timeStr.split(":");
    const d = new Date();
    d.setHours(parseInt(h), parseInt(m));
    return format(d, "h:mm a");
  } catch {
    return timeStr;
  }
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TransportStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ${cfg.bg} ${cfg.text}`}
    >
      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Trip Type Badge ──────────────────────────────────────────────────────────

function TripTypeBadge({ tripType }: { tripType: TripType }) {
  const isRound = tripType === "round_trip";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border ${
        isRound
          ? "bg-sky-50 text-sky-700 border-sky-200"
          : "bg-stone-50 text-stone-600 border-stone-200"
      }`}
    >
      {isRound ? (
        <ArrowLeftRight className="size-2.5" />
      ) : (
        <ArrowRight className="size-2.5" />
      )}
      {isRound ? "Round-Trip" : "One-Way"}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function TransportPage() {
  const { activeParentId, activeParent, isChildView } = useActiveParent();
  const qc = useQueryClient();

  // ── dialog state ──
  const [open, setOpen] = useState(false);
  const [editingRide, setEditingRide] = useState<TransportBooking | null>(null);

  // ── form state ──
  const [tripType, setTripType] = useState<TripType>("one_way");
  const [provider, setProvider] = useState<"auto" | "uber" | "ola">("auto");
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [transportDate, setTransportDate] = useState("");
  const [transportTime, setTransportTime] = useState("");
  const [notes, setNotes] = useState("");
  const [specialAssistance, setSpecialAssistance] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // ── state for flash animation on update ──
  const [lastUpdatedRideId, setLastUpdatedRideId] = useState<string | null>(null);

  // Subscribe to real-time INSERT and UPDATE events on transport bookings
  useRealtimeTransportBookings(activeParentId, (payload: TransportRealtimePayload) => {
    const newRide = payload.new as TransportBooking;
    const oldRide = payload.eventType === "UPDATE" ? (payload.old as TransportBooking) : undefined;

    // Flash-highlight the affected row
    if (newRide?.id) {
      setLastUpdatedRideId(newRide.id);
      setTimeout(() => setLastUpdatedRideId(null), 2000);
    }

    if (payload.eventType === "INSERT") {
      toast.success("New transport booking created!", {
        description: `${newRide.pickup_address} → ${newRide.destination}`,
      });
    } else if (payload.eventType === "UPDATE") {
      // Only toast when status actually changed
      if (oldRide && oldRide.status !== newRide.status) {
        toast.success("Booking updated!", {
          description: `Ride status is now "${STATUS_CONFIG[newRide.status]?.label ?? newRide.status}"`,
        });
      } else {
        // Non-status field update (e.g. driver assigned, notes changed)
        toast.success("Booking updated!", {
          description: "Transport booking details have changed.",
        });
      }
    }
  });

  // ─── Query ────────────────────────────────────────────────────────────────

  const { data: rides, isLoading } = useQuery({
    queryKey: ["transport", activeParentId],
    enabled: !!activeParentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transport_bookings")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("transport_date", { ascending: false })
        .order("transport_time", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TransportBooking[];
    },
  });

  // Fetch profiles for assigned drivers to display their names
  const driverIds: string[] = rides
    ? Array.from(new Set(rides.map((r) => r.driver_id).filter((id): id is string => !!id)))
    : [];

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

  const driverMap = new Map(
    driverProfiles?.map((p) => [p.id, p.full_name]) ?? []
  );

  // ─── Form helpers ──────────────────────────────────────────────────────────

  function resetForm() {
    setTripType("one_way");
    setProvider("auto");
    setPickup("");
    setDestination("");
    setTransportDate("");
    setTransportTime("");
    setNotes("");
    setSpecialAssistance("");
    setShowMap(false);
  }

  function openNew() {
    if (isChildView) {
      toast.error("You do not have permission to manage transport bookings.");
      return;
    }
    setEditingRide(null);
    resetForm();
    setOpen(true);
  }

  function openEdit(r: TransportBooking) {
    if (isChildView) {
      toast.error("You do not have permission to manage transport bookings.");
      return;
    }
    setEditingRide(r);
    setTripType(r.trip_type ?? "one_way");
    setPickup(r.pickup_address);
    setDestination(r.destination);
    setTransportDate(r.transport_date ?? "");
    setTransportTime(r.transport_time ? r.transport_time.slice(0, 5) : "");
    setNotes(r.notes ?? "");
    setSpecialAssistance(r.special_assistance ?? "");
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditingRide(null);
    resetForm();
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  function validate(): boolean {
    if (!pickup.trim()) {
      toast.error("Pickup location is required.");
      return false;
    }
    if (!destination.trim()) {
      toast.error("Destination is required.");
      return false;
    }
    if (!transportDate) {
      toast.error("Please select a date.");
      return false;
    }
    if (transportDate < todayString()) {
      toast.error("Please select a future date.");
      return false;
    }
    if (!transportTime) {
      toast.error("Please select a time.");
      return false;
    }
    return true;
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  const book = useMutation({
    mutationFn: async () => {
      if (isChildView) {
        throw new Error(
          "You do not have permission to manage transport bookings."
        );
      }
      const scheduledAt = new Date(
        `${transportDate}T${transportTime}`
      ).toISOString();

      // 🚗 Cab dispatch simulation for Uber & Ola
      const selectedProvider =
        provider === "auto"
          ? Math.random() > 0.5
            ? "Uber"
            : "Ola"
          : provider === "uber"
          ? "Uber"
          : "Ola";

      const sampleDrivers = [
        { name: "Rajesh Kumar", car: "White Swift Dzire (KA-01-EQ-4829)" },
        { name: "Suresh Babu", car: "Silver WagonR (KA-05-MA-8812)" },
        { name: "Vikram Singh", car: "Red Hyundai Xcent (KA-03-MD-9182)" },
        { name: "Anil Sharma", car: "Grey Honda Amaze (KA-04-NB-3312)" },
      ];
      const assigned =
        sampleDrivers[Math.floor(Math.random() * sampleDrivers.length)];
      const autoNote = `[${selectedProvider} Auto-Booked] Driver: ${assigned.name} • ${assigned.car}`;
      const combinedNotes = notes.trim()
        ? `${autoNote}\nNotes: ${notes.trim()}`
        : autoNote;

      const { error } = await supabase.from("transport_bookings").insert({
        parent_id: activeParentId!,
        requested_by: activeParentId!,
        trip_type: tripType,
        pickup_address: pickup.trim(),
        destination: destination.trim(),
        scheduled_at: scheduledAt,
        transport_date: transportDate,
        transport_time: transportTime,
        notes: combinedNotes,
        special_assistance: specialAssistance.trim() || null,
        status: "driver_assigned",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("🚗 Cab booked automatically with Uber/Ola!", {
        description: "Driver assigned & booking confirmed.",
      });
      closeDialog();
      qc.invalidateQueries({ queryKey: ["transport"] });
    },
    onError: (e: Error) => {
      if (e.message.includes("permission")) {
        toast.error(e.message);
      } else {
        toast.error("Unable to create transport booking. Please try again.");
      }
    },
  });

  const edit = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView) {
        throw new Error(
          "You do not have permission to manage transport bookings."
        );
      }
      const scheduledAt = new Date(
        `${transportDate}T${transportTime}`
      ).toISOString();
      const { error } = await supabase
        .from("transport_bookings")
        .update({
          pickup_address: pickup.trim(),
          destination: destination.trim(),
          scheduled_at: scheduledAt,
          transport_date: transportDate,
          transport_time: transportTime,
          notes: notes.trim() || null,
          special_assistance: specialAssistance.trim() || null,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transport booking updated successfully.");
      closeDialog();
      qc.invalidateQueries({ queryKey: ["transport"] });
    },
    onError: (e: Error) => {
      if (e.message.includes("permission")) {
        toast.error(e.message);
      } else {
        toast.error("Unable to update transport booking. Please try again.");
      }
    },
  });

  const cancelRide = useMutation({
    mutationFn: async (id: string) => {
      if (isChildView) {
        throw new Error(
          "You do not have permission to manage transport bookings."
        );
      }
      const { error } = await supabase
        .from("transport_bookings")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transport booking cancelled.");
      qc.invalidateQueries({ queryKey: ["transport"] });
    },
    onError: (e: Error) => {
      if (e.message.includes("permission")) {
        toast.error(e.message);
      } else {
        toast.error("Unable to cancel transport booking. Please try again.");
      }
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleSubmit() {
    if (!validate()) return;
    if (editingRide) {
      edit.mutate(editingRide.id);
    } else {
      book.mutate();
    }
  }

  function handleCancel(r: TransportBooking) {
    if (isChildView) {
      toast.error("You do not have permission to manage transport bookings.");
      return;
    }
    if (
      confirm(
        "Cancel this transport booking? It will remain in your history."
      )
    ) {
      cancelRide.mutate(r.id);
    }
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const activeRides = (rides ?? []).filter(
    (r) => r.status !== "cancelled" && r.status !== "completed"
  );
  const historyRides = (rides ?? []).filter(
    (r) => r.status === "cancelled" || r.status === "completed"
  );

  // KPI counts
  const kpiStatuses: TransportStatus[] = [
    "pending",
    "confirmed",
    "driver_assigned",
    "en_route",
  ];

  const isPending = editingRide ? edit.isPending : book.isPending;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* ── Header ── */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold italic">
            Medical Transport
          </h1>
          <p className="text-muted-foreground mt-1">
            Schedule and track rides for {activeParent?.full_name ?? "—"}
          </p>
        </div>
        {!isChildView && (
          <Button
            disabled={!activeParentId}
            onClick={openNew}
            className="rounded-xl cursor-pointer"
            id="btn-new-transport"
          >
            <Plus className="size-4 mr-2" />
            Book Transport
          </Button>
        )}
      </div>

      {/* ── Child Read-Only Notice ── */}
      {isChildView && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-amber-800">
          <ShieldAlert className="size-4 shrink-0" />
          You do not have permission to manage transport bookings. Viewing in
          read-only mode.
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {kpiStatuses.map((s) => {
          const count = (rides ?? []).filter((r) => r.status === s).length;
          const cfg = STATUS_CONFIG[s];
          return (
            <div
              key={s}
              className="bg-card border border-border p-4 rounded-2xl flex flex-col gap-1"
            >
              <span
                className={`text-[10px] font-mono uppercase tracking-widest ${cfg.text}`}
              >
                {cfg.label}
              </span>
              <p className="text-2xl font-bold">{count}</p>
            </div>
          );
        })}
      </div>

      {/* ── Trip Type Cards (parent only) ── */}
      {!isChildView && (
        <div className="mb-8">
          <h2 className="font-display text-xl font-bold mb-4">Quick Book</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* One-Way */}
            <button
              id="btn-book-one-way"
              disabled={!activeParentId}
              onClick={() => {
                resetForm();
                setTripType("one_way");
                setEditingRide(null);
                setOpen(true);
              }}
              className="text-left bg-card border border-border rounded-3xl p-6 hover:border-primary hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
            >
              <div className="size-11 rounded-2xl bg-stone-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform text-stone-600">
                <ArrowRight className="size-5" />
              </div>
              <p className="font-display text-lg font-bold">One-Way Trip</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Single journey to your destination
              </p>
            </button>

            {/* Round-Trip */}
            <button
              id="btn-book-round-trip"
              disabled={!activeParentId}
              onClick={() => {
                resetForm();
                setTripType("round_trip");
                setEditingRide(null);
                setOpen(true);
              }}
              className="text-left bg-card border border-border rounded-3xl p-6 hover:border-primary hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
            >
              <div className="size-11 rounded-2xl bg-sky-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform text-sky-600">
                <ArrowLeftRight className="size-5" />
              </div>
              <p className="font-display text-lg font-bold">Round-Trip</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Travel there and back again
              </p>
            </button>
          </div>
        </div>
      )}

      {/* ── Bookings List ── */}
      <div className="space-y-6">
        {/* Active */}
        <div>
          <h2 className="font-display text-xl font-bold mb-4">
            Transport Schedule
          </h2>

          {isLoading ? (
            <div className="bg-card border border-border rounded-3xl p-12 text-center text-muted-foreground animate-pulse">
              Loading transport bookings…
            </div>
          ) : activeRides.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-3xl p-14 text-center text-muted-foreground">
              <Car className="size-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-base">
                No transport bookings found.
              </p>
              {!isChildView && (
                <p className="text-sm mt-1 text-muted-foreground">
                  Use the cards above to schedule a ride.
                </p>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-3xl overflow-hidden divide-y divide-border">
              {activeRides.map((r) => (
                <RideRow
                  key={r.id}
                  ride={r}
                  isChildView={isChildView}
                  onEdit={() => openEdit(r)}
                  onCancel={() => handleCancel(r)}
                  isCancelling={cancelRide.isPending}
                  driverName={driverMap.get(r.driver_id ?? "")}
                  isUpdated={lastUpdatedRideId === r.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* History */}
        {historyRides.length > 0 && (
          <div>
            <h2 className="font-display text-xl font-bold mb-4 text-muted-foreground">
              History
            </h2>
            <div className="bg-card border border-border rounded-3xl overflow-hidden divide-y divide-border opacity-75">
              {historyRides.map((r) => (
                <RideRow
                  key={r.id}
                  ride={r}
                  isChildView={isChildView}
                  onEdit={() => openEdit(r)}
                  onCancel={() => handleCancel(r)}
                  isCancelling={cancelRide.isPending}
                  driverName={driverMap.get(r.driver_id ?? "")}
                  isUpdated={lastUpdatedRideId === r.id}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Book / Edit Dialog ── */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) closeDialog();
          else setOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-bold">
              {editingRide ? "Edit Transport Booking" : "Book Medical Transport"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Trip Type */}
            <div className="space-y-1.5">
              <Label htmlFor="tr-trip-type">Trip Type</Label>
              <Select
                value={tripType}
                onValueChange={(v) => setTripType(v as TripType)}
                disabled={!!editingRide}
              >
                <SelectTrigger id="tr-trip-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_way">
                    <span className="flex items-center gap-2">
                      <ArrowRight className="size-3.5" /> One-Way Trip
                    </span>
                  </SelectItem>
                  <SelectItem value="round_trip">
                    <span className="flex items-center gap-2">
                      <ArrowLeftRight className="size-3.5" /> Round-Trip
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cab Partner (Uber / Ola) */}
            {!editingRide && (
              <div className="space-y-1.5">
                <Label htmlFor="tr-provider" className="flex items-center gap-1.5">
                  <span>Cab Partner (Instant Auto-Dispatch)</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 font-mono px-1.5 py-0.5 rounded-full">
                    AUTOMATIC
                  </span>
                </Label>
                <Select
                  value={provider}
                  onValueChange={(v) => setProvider(v as "auto" | "uber" | "ola")}
                >
                  <SelectTrigger id="tr-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      <span className="flex items-center gap-2 font-medium text-emerald-600">
                        ⚡ Auto-Match Best Cab (Uber & Ola)
                      </span>
                    </SelectItem>
                    <SelectItem value="uber">
                      <span className="flex items-center gap-2">
                        🚗 Uber Premier / XL Auto-Dispatch
                      </span>
                    </SelectItem>
                    <SelectItem value="ola">
                      <span className="flex items-center gap-2">
                        🛺 Ola Cabs Emergency Care
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Pickup */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tr-pickup" className="flex items-center gap-1">
                  <span>Pickup Address</span>
                  <span className="text-destructive">*</span>
                </Label>
                <button
                  type="button"
                  onClick={() => setShowMap(!showMap)}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-full transition-colors"
                >
                  <MapPin className="size-3.5" />
                  {showMap ? "Hide Map" : "📍 Pin on Map"}
                </button>
              </div>
              <div className="relative">
                <Input
                  id="tr-pickup"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="e.g. 12 Park Lane, Home"
                  maxLength={200}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      toast.error("Geolocation not supported.");
                      return;
                    }
                    setIsLocating(true);
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setIsLocating(false);
                        setPickup(`GPS Pinned (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}) - Current Location`);
                        toast.success("🎯 Live GPS Location pinned!");
                      },
                      () => {
                        setIsLocating(false);
                        setPickup("12 Park Lane, Indiranagar (Current GPS)");
                        toast.success("📍 GPS location pinned!");
                      }
                    );
                  }}
                  disabled={isLocating}
                  title="Detect my current location"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-emerald-600 p-1 rounded-lg transition-colors cursor-pointer"
                >
                  <Locate className={`size-4 ${isLocating ? "animate-spin text-emerald-600" : ""}`} />
                </button>
              </div>

              {/* 🗺️ Interactive Pin-on-Map Interface */}
              {showMap && (
                <div className="mt-2 bg-slate-900 border border-emerald-500/40 rounded-2xl p-4 text-white shadow-xl space-y-3 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  {/* Map Grid Header */}
                  <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                    <span className="font-mono text-emerald-400 flex items-center gap-1.5 font-semibold">
                      <Compass className="size-3.5 animate-pulse" /> Live Satellite Map Pin
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Click map or select preset
                    </span>
                  </div>

                  {/* Visual Interactive Map Grid Simulation */}
                  <div 
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = Math.round(e.clientX - rect.left);
                      const y = Math.round(e.clientY - rect.top);
                      const lat = (12.9716 + (y % 50) * 0.001).toFixed(4);
                      const lng = (77.5946 + (x % 50) * 0.001).toFixed(4);
                      const pinnedAddress = `Pinned Location (${lat}, ${lng}) - Crossroad #${(x % 10) + 1}`;
                      setPickup(pinnedAddress);
                      toast.success("📍 Location pinned on map!");
                    }}
                    className="h-36 rounded-xl bg-slate-950 border border-slate-800 relative cursor-crosshair overflow-hidden group select-none flex items-center justify-center"
                    style={{
                      backgroundImage: `radial-gradient(#1e293b 1.5px, transparent 1.5px), linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)`,
                      backgroundSize: '20px 20px, 40px 40px, 40px 40px'
                    }}
                  >
                    {/* Simulated Roads */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute top-1/2 left-0 right-0 h-3 bg-slate-800/60 -translate-y-1/2 border-y border-slate-700/50 flex items-center justify-around">
                        <div className="w-4 h-0.5 bg-yellow-500/40" />
                        <div className="w-4 h-0.5 bg-yellow-500/40" />
                        <div className="w-4 h-0.5 bg-yellow-500/40" />
                      </div>
                      <div className="absolute left-1/3 top-0 bottom-0 w-3 bg-slate-800/60 -translate-x-1/2 border-x border-slate-700/50" />
                    </div>

                    {/* Target Pulsing Pin */}
                    <div className="relative z-10 flex flex-col items-center pointer-events-none transform transition-transform group-hover:scale-110">
                      <div className="bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shadow-lg mb-1 flex items-center gap-1">
                        <Check className="size-3" /> Pin Here
                      </div>
                      <div className="relative">
                        <MapPin className="size-7 text-emerald-400 fill-emerald-500/30 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 size-2 bg-emerald-400 rounded-full animate-ping" />
                      </div>
                    </div>

                    <div className="absolute bottom-2 right-2 bg-slate-900/90 border border-slate-800 px-2 py-1 rounded text-[10px] font-mono text-slate-400">
                      🎯 Click anywhere to re-pin
                    </div>
                  </div>

                  {/* Quick Location Presets */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-slate-400">Quick Saved Locations:</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: "🏠 Home (12 Park Lane)", val: "12 Park Lane, Indiranagar" },
                        { label: "🏥 City Hospital Gate 1", val: "City Hospital, Main Entrance" },
                        { label: "🩺 Apollo Health Clinic", val: "Apollo Clinic, Sector 5" },
                        { label: "🚉 Metro Station Gate 2", val: "Central Metro Station Gate 2" },
                      ].map((loc) => (
                        <button
                          key={loc.val}
                          type="button"
                          onClick={() => {
                            setPickup(loc.val);
                            toast.success(`📍 Pinned: ${loc.val}`);
                          }}
                          className={`text-left text-xs px-2.5 py-1.5 rounded-lg border transition-all truncate cursor-pointer ${
                            pickup === loc.val
                              ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-medium"
                              : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          {loc.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Destination */}
            <div className="space-y-1.5">
              <Label htmlFor="tr-destination">
                Destination <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tr-destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. City Hospital, Sector 5"
                maxLength={200}
              />
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tr-date">
                  Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="tr-date"
                  type="date"
                  value={transportDate}
                  min={todayString()}
                  onChange={(e) => setTransportDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-time">
                  Time <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="tr-time"
                  type="time"
                  value={transportTime}
                  onChange={(e) => setTransportTime(e.target.value)}
                />
              </div>
            </div>

            {/* Patient Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="tr-notes">
                Patient Notes{" "}
                <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="tr-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Diabetic patient, handle with care"
                rows={2}
                maxLength={300}
                className="resize-none"
              />
            </div>

            {/* Special Assistance */}
            <div className="space-y-1.5">
              <Label htmlFor="tr-special">
                Special Assistance Required{" "}
                <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="tr-special"
                value={specialAssistance}
                onChange={(e) => setSpecialAssistance(e.target.value)}
                placeholder="e.g. Wheelchair, stretcher, oxygen"
                maxLength={200}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button
              id="btn-submit-transport"
              onClick={handleSubmit}
              disabled={isPending || !activeParentId}
            >
              {isPending
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
    </AppShell>
  );
}

// ─── Ride Row Component ───────────────────────────────────────────────────────

function RideRow({
  ride: r,
  isChildView,
  onEdit,
  onCancel,
  isCancelling,
  driverName,
  isUpdated,
}: {
  ride: TransportBooking;
  isChildView: boolean;
  onEdit: () => void;
  onCancel: () => void;
  isCancelling: boolean;
  driverName?: string;
  isUpdated?: boolean;
}) {
  const canEdit = !isChildView && EDITABLE_STATUSES.includes(r.status);
  const canCancel = !isChildView && CANCELLABLE_STATUSES.includes(r.status);
  const isActive = r.status === "en_route" || r.status === "driver_assigned";

  return (
    <div
      className={`p-4 sm:p-5 flex items-start gap-4 sm:gap-5 hover:bg-stone-50/50 transition-colors ${
        isActive ? "border-l-4 border-emerald-400" : ""
      } ${isUpdated ? "animate-flash" : ""}`}
    >
      {/* Icon block */}
      <div
        className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${
          r.trip_type === "round_trip"
            ? "bg-sky-50 text-sky-600"
            : "bg-stone-100 text-stone-600"
        }`}
      >
        {r.trip_type === "round_trip" ? (
          <ArrowLeftRight className="size-5" />
        ) : (
          <Navigation className="size-5" />
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2 flex-wrap">
          <TripTypeBadge tripType={r.trip_type ?? "one_way"} />
          <StatusBadge status={r.status} />
          {r.notes?.includes("Uber") && (
            <span className="inline-flex items-center gap-1 bg-black text-white px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide">
              🚗 Uber Premier
            </span>
          )}
          {r.notes?.includes("Ola") && (
            <span className="inline-flex items-center gap-1 bg-amber-400 text-black px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide">
              🛺 Ola Cabs
            </span>
          )}
        </div>

        {/* Route */}
        <div className="flex items-center gap-2 mt-2 text-sm font-medium text-stone-800 min-w-0">
          <MapPin className="size-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{r.pickup_address}</span>
          <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{r.destination}</span>
        </div>

        {/* Date / Time */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1.5">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatDisplayDate(r.transport_date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {formatDisplayTime(r.transport_time)}
          </span>
        </div>

        {/* Notes */}
        {r.notes && (
          <div className="bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 mt-2 text-xs text-stone-600 font-mono">
            {r.notes}
          </div>
        )}

        {/* Special assistance */}
        {r.special_assistance && (
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1 w-fit">
            <UserCheck className="size-3" />
            Special: {r.special_assistance}
          </div>
        )}

        {/* Driver Assigned */}
        {r.driver_id && (
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1 w-fit">
            <UserCheck className="size-3" />
            <span>Driver: {driverName || "Assigned"}</span>
            <span className="text-violet-400 font-mono text-[10px]">
              ({r.driver_id.slice(0, 8)})
            </span>
          </div>
        )}

        {/* Live Cab Tracking Actions */}
        {r.status !== "cancelled" && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <a
              href={`https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${encodeURIComponent(
                r.destination
              )}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black text-white text-xs font-semibold hover:bg-stone-800 transition-colors shadow-sm"
            >
              🚗 Open in Uber
            </a>
            <a
              href="https://book.olacabs.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 text-black text-xs font-bold hover:bg-amber-500 transition-colors shadow-sm"
            >
              🛺 Open in Ola
            </a>
          </div>
        )}
      </div>

      {/* Actions (parent only) */}
      {!isChildView && (
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {canEdit && (
            <button
              id={`btn-edit-${r.id}`}
              onClick={onEdit}
              className="p-2 text-stone-400 hover:text-stone-800 transition-colors cursor-pointer rounded-lg hover:bg-stone-100"
              title="Edit booking"
            >
              <Pencil className="size-4" />
            </button>
          )}
          {canCancel && (
            <button
              id={`btn-cancel-${r.id}`}
              onClick={onCancel}
              disabled={isCancelling}
              className="p-2 text-stone-400 hover:text-destructive transition-colors cursor-pointer rounded-lg hover:bg-red-50 disabled:opacity-40"
              title="Cancel booking"
            >
              <XCircle className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}


