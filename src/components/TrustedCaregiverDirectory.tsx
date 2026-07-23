import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  Award,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  Crosshair,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
export type TrustedCaregiverType =
  | "nurse"
  | "caretaker"
  | "physiotherapist"
  | "companion"
  | "other";
export type TrustedCaregiver = {
  id: string;
  parent_id: string;
  name: string;
  caregiver_type: TrustedCaregiverType;
  phone: string | null;
  email: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  available: boolean;
  qualification: string | null;
  experience_years: number;
  service_area: string | null;
  available_days: number[];
  available_from: string | null;
  available_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
type FormState = {
  name: string;
  caregiver_type: TrustedCaregiverType;
  phone: string;
  email: string;
  address: string;
  latitude: string;
  longitude: string;
  available: boolean;
  qualification: string;
  experience_years: string;
  service_area: string;
  available_days: number[];
  available_from: string;
  available_until: string;
  notes: string;
};
const WEEK_DAYS = [
  { value: 0, short: "Sun", long: "Sunday" },
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
] as const;
const ALL_DAYS = WEEK_DAYS.map((day) => day.value);
const EMPTY_FORM: FormState = {
  name: "",
  caregiver_type: "caretaker",
  phone: "",
  email: "",
  address: "",
  latitude: "",
  longitude: "",
  available: true,
  qualification: "",
  experience_years: "0",
  service_area: "",
  available_days: ALL_DAYS,
  available_from: "",
  available_until: "",
  notes: "",
};
function cleanPhone(value: string) {
  return value.trim().replace(/[^+\d]/g, "");
}
function cleanTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
}
function formatTime(value: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}
function formatAvailabilityDays(days: number[]) {
  const normalized = [...new Set(days)].sort((a, b) => a - b);
  if (normalized.length === 7) return "Every day";
  if (normalized.join(",") === "1,2,3,4,5") return "Weekdays";
  if (normalized.join(",") === "0,6") return "Weekends";
  return normalized
    .map((day) => WEEK_DAYS.find((item) => item.value === day)?.short)
    .filter(Boolean)
    .join(", ");
}
function validate(form: FormState) {
  if (form.name.trim().length < 2) {
    return "Enter the caregiver's name.";
  }
  const phone = cleanPhone(form.phone);
  if (!phone && !form.email.trim()) {
    return "Add at least a phone number or email address.";
  }
  if (phone && phone.replace(/\D/g, "").length < 7) {
    return "Enter a valid phone number.";
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "Enter a valid email address.";
  }
  const experience = Number(form.experience_years);
  if (!Number.isInteger(experience) || experience < 0 || experience > 60) {
    return "Experience must be a whole number between 0 and 60 years.";
  }
  if (form.available_days.length === 0) {
    return "Select at least one available day.";
  }
  const hasStart = form.available_from.trim() !== "";
  const hasEnd = form.available_until.trim() !== "";
  if (hasStart !== hasEnd) {
    return "Enter both availability start and end times, or leave both empty.";
  }
  if (hasStart && form.available_from >= form.available_until) {
    return "Availability end time must be later than the start time.";
  }
  const hasLatitude = form.latitude.trim() !== "";
  const hasLongitude = form.longitude.trim() !== "";
  if (hasLatitude !== hasLongitude) {
    return "Enter both latitude and longitude, or leave both empty.";
  }
  if (hasLatitude) {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return "Latitude must be between -90 and 90.";
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return "Longitude must be between -180 and 180.";
    }
  }
  return null;
}
export function TrustedCaregiverDirectory({
  parentId,
  readOnly,
}: {
  parentId: string;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrustedCaregiver | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [locating, setLocating] = useState(false);
  const { data: caregivers = [], isLoading } = useQuery({
    queryKey: ["trusted-caregivers", parentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trusted_caregivers")
        .select("*")
        .eq("parent_id", parentId)
        .order("available", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TrustedCaregiver[];
    },
  });
  useEffect(() => {
    const channel = supabase
      .channel(`trusted-caregivers-${parentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trusted_caregivers",
          filter: `parent_id=eq.${parentId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["trusted-caregivers", parentId],
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [parentId, queryClient]);
  const availableCount = useMemo(
    () => caregivers.filter((caregiver) => caregiver.available).length,
    [caregivers],
  );
  function startCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, available_days: [...ALL_DAYS] });
    setOpen(true);
  }
  function startEdit(item: TrustedCaregiver) {
    setEditing(item);
    setForm({
      name: item.name,
      caregiver_type: item.caregiver_type,
      phone: item.phone ?? "",
      email: item.email ?? "",
      address: item.address ?? "",
      latitude: item.latitude == null ? "" : String(item.latitude),
      longitude: item.longitude == null ? "" : String(item.longitude),
      available: item.available,
      qualification: item.qualification ?? "",
      experience_years: String(item.experience_years ?? 0),
      service_area: item.service_area ?? "",
      available_days: item.available_days?.length > 0 ? [...item.available_days] : [...ALL_DAYS],
      available_from: cleanTime(item.available_from),
      available_until: cleanTime(item.available_until),
      notes: item.notes ?? "",
    });
    setOpen(true);
  }
  function closeDialog() {
    if (save.isPending) return;
    setOpen(false);
    setEditing(null);
    setForm({ ...EMPTY_FORM, available_days: [...ALL_DAYS] });
  }
  function toggleDay(day: number) {
    setForm((current) => {
      const selected = current.available_days.includes(day);
      const nextDays = selected
        ? current.available_days.filter((value) => value !== day)
        : [...current.available_days, day].sort((a, b) => a - b);
      return {
        ...current,
        available_days: nextDays,
      };
    });
  }
  const save = useMutation({
    mutationFn: async () => {
      const errorMessage = validate(form);
      if (errorMessage) throw new Error(errorMessage);
      const payload = {
        parent_id: parentId,
        name: form.name.trim(),
        caregiver_type: form.caregiver_type,
        phone: cleanPhone(form.phone) || null,
        email: form.email.trim().toLowerCase() || null,
        address: form.address.trim() || null,
        latitude: form.latitude.trim() ? Number(form.latitude) : null,
        longitude: form.longitude.trim() ? Number(form.longitude) : null,
        available: form.available,
        qualification: form.qualification.trim() || null,
        experience_years: Number(form.experience_years),
        service_area: form.service_area.trim() || null,
        available_days: [...form.available_days].sort((a, b) => a - b),
        available_from: form.available_from || null,
        available_until: form.available_until || null,
        notes: form.notes.trim() || null,
      };
      const query = editing
        ? supabase
          .from("trusted_caregivers")
          .update(payload)
          .eq("id", editing.id)
          .eq("parent_id", parentId)
        : supabase.from("trusted_caregivers").insert(payload);
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(
          "The caregiver profile was not saved. Check your database migration and permissions.",
        );
      }
    },
    onSuccess: () => {
      closeDialog();
      queryClient.invalidateQueries({
        queryKey: ["trusted-caregivers", parentId],
      });
      toast.success("Caregiver profile saved.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("trusted_caregivers")
        .delete()
        .eq("id", id)
        .eq("parent_id", parentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The caregiver profile was not deleted.");
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<TrustedCaregiver[]>(
        ["trusted-caregivers", parentId],
        (current = []) => current.filter((item) => item.id !== id),
      );
      toast.success("Caregiver profile deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  function captureCoordinates() {
    if (!("geolocation" in navigator)) {
      toast.error("Location is not supported by this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setLocating(false);
        toast.success(
          "Coordinates added. Use this only when the caregiver is at the saved location.",
        );
      },
      (error) => {
        setLocating(false);
        toast.error(error.message || "Location could not be captured.");
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 5000,
      },
    );
  }
  return (
    <section className="rounded-[1.75rem] border border-[#dce8e4] bg-white p-5 shadow-[0_20px_55px_-44px_rgba(18,49,54,0.45)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-[#176f69]" />
            <h2 className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">Trusted caregiver directory</h2>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#71868a]">
            Save caregivers you already know, define their weekly availability, and assign them to
            internal bookings without a paid marketplace.
          </p>
          {caregivers.length > 0 && (
            <p className="mt-2 inline-flex rounded-full bg-[#e4f1ec] px-3 py-1.5 text-xs font-bold text-[#176f5f]">
              {availableCount} of {caregivers.length} caregiver
              {caregivers.length === 1 ? "" : "s"} currently available
            </p>
          )}
        </div>

        {!readOnly && (
          <Button onClick={startCreate} className="h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]">
            <Plus className="mr-2 size-4" />
            Add caregiver
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid min-h-36 place-items-center text-[#176f69]">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : caregivers.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[#cfdeda] bg-[#f8fbfa] p-9 text-center text-sm leading-6 text-[#71868a]">
          No caregiver profiles have been added. Add at least one profile before assigning a
          booking.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {caregivers.map((item) => {
            const from = formatTime(item.available_from);
            const until = formatTime(item.available_until);
            return (
              <article key={item.id} className="professional-card-hover rounded-2xl border border-[#dce7e3] bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e5f2ed] text-[#176f69]">
                      <UserRound className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-[#1d3e44]">{item.name}</h3>
                      <p className="mt-0.5 text-xs font-medium capitalize text-[#788c90]">
                        {item.caregiver_type.replace("_", " ")}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold ${item.available
                        ? "bg-[#e4f1ec] text-[#176f5f]"
                        : "bg-[#eef2f1] text-[#6f8185]"
                      }`}
                  >
                    {item.available ? "Available" : "Unavailable"}
                  </span>
                </div>

                <div className="mt-5 space-y-2.5 text-sm">
                  {item.qualification && (
                    <p className="flex items-start gap-2 text-[#647a7f]">
                      <Award className="mt-0.5 size-4 shrink-0" />
                      {item.qualification}
                    </p>
                  )}

                  <p className="flex items-center gap-2 text-[#647a7f]">
                    <BriefcaseBusiness className="size-4" />
                    {item.experience_years === 0
                      ? "Experience not specified"
                      : `${item.experience_years} year${item.experience_years === 1 ? "" : "s"} experience`}
                  </p>

                  <p className="flex items-start gap-2 text-[#647a7f]">
                    <CalendarDays className="mt-0.5 size-4 shrink-0" />
                    {formatAvailabilityDays(item.available_days ?? ALL_DAYS)}
                  </p>

                  {from && until && (
                    <p className="flex items-center gap-2 text-[#647a7f]">
                      <Clock3 className="size-4" />
                      {from}–{until}
                    </p>
                  )}

                  {item.phone && (
                    <a
                      className="flex items-center gap-2 font-medium text-[#48666b] transition hover:text-[#0d7774]"
                      href={`tel:${item.phone}`}
                    >
                      <Phone className="size-4" />
                      {item.phone}
                    </a>
                  )}

                  {item.email && (
                    <a
                      className="flex items-center gap-2 font-medium text-[#48666b] transition hover:text-[#0d7774]"
                      href={`mailto:${item.email}`}
                    >
                      <Mail className="size-4" />
                      {item.email}
                    </a>
                  )}

                  {item.service_area && (
                    <p className="flex items-start gap-2 text-[#647a7f]">
                      <MapPin className="mt-0.5 size-4 shrink-0" />
                      Service area: {item.service_area}
                    </p>
                  )}

                  {item.address && (
                    <p className="flex items-start gap-2 text-[#647a7f]">
                      <MapPin className="mt-0.5 size-4 shrink-0" />
                      {item.address}
                    </p>
                  )}

                  {item.latitude != null && item.longitude != null && (
                    <p className="flex items-center gap-2 text-xs text-[#72878b]">
                      <Crosshair className="size-4" />
                      Coordinates saved for SOS distance sorting
                    </p>
                  )}

                  {item.notes && (
                    <p className="rounded-xl border border-[#e4ece9] bg-[#f8fbfa] p-3 text-xs leading-5 text-[#667c81]">
                      {item.notes}
                    </p>
                  )}
                </div>

                {!readOnly && (
                  <div className="mt-5 flex justify-end gap-2 border-t border-[#e6eeeb] pt-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-xl text-[#61797e] hover:bg-[#eef5f2] hover:text-[#0d7774]"
                      onClick={() => startEdit(item)}
                      aria-label={`Edit ${item.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-xl text-[#a44e49] hover:bg-[#fff1ef] hover:text-[#913f3b]"
                      onClick={() =>
                        window.confirm(
                          `Delete ${item.name}? Existing bookings will keep the caregiver name, but the profile link will be removed.`,
                        ) && remove.mutate(item.id)
                      }
                      disabled={remove.isPending}
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeDialog();
          else setOpen(true);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] border-[#dce7e3] p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-[#e3ece9] px-6 py-5 text-left">
            <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">
              {editing ? "Edit caregiver profile" : "Add caregiver profile"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="trusted-caregiver-name">Name *</Label>
              <Input
                id="trusted-caregiver-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.caregiver_type}
                onValueChange={(value: TrustedCaregiverType) =>
                  setForm((current) => ({
                    ...current,
                    caregiver_type: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nurse">Nurse</SelectItem>
                  <SelectItem value="caretaker">Caretaker</SelectItem>
                  <SelectItem value="physiotherapist">Physiotherapist</SelectItem>
                  <SelectItem value="companion">Companion</SelectItem>
                  <SelectItem value="other">Other / Multi-service</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-[#dce7e3] bg-[#f8fbfa] px-4 py-3">
              <Switch
                checked={form.available}
                onCheckedChange={(available) => setForm((current) => ({ ...current, available }))}
              />
              <div>
                <Label>Available for assignments and SOS</Label>
                <p className="text-[11px] text-muted-foreground">
                  Turn this off when the caregiver cannot accept requests.
                </p>
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="trusted-caregiver-qualification">Qualification or skills</Label>
              <Input
                id="trusted-caregiver-qualification"
                value={form.qualification}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    qualification: event.target.value,
                  }))
                }
                placeholder="e.g. GNM Nurse, BPT, elderly-care training"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trusted-caregiver-experience">Experience (years)</Label>
              <Input
                id="trusted-caregiver-experience"
                type="number"
                min={0}
                max={60}
                value={form.experience_years}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    experience_years: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trusted-caregiver-service-area">Service area</Label>
              <Input
                id="trusted-caregiver-service-area"
                value={form.service_area}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    service_area: event.target.value,
                  }))
                }
                placeholder="e.g. Andheri East, within 5 km"
                maxLength={200}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Available days *</Label>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {WEEK_DAYS.map((day) => {
                  const selected = form.available_days.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`rounded-xl border px-2 py-2 text-xs font-semibold transition-colors ${selected
                          ? "border-[#0d6665] bg-[#0d6665] text-white shadow-sm"
                          : "border-[#d7e3df] bg-white text-[#6c8185] hover:border-[#9fc3b9] hover:bg-[#f2f8f5]"
                        }`}
                      aria-pressed={selected}
                      title={day.long}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trusted-caregiver-from">Available from</Label>
              <Input
                id="trusted-caregiver-from"
                type="time"
                value={form.available_from}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    available_from: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trusted-caregiver-until">Available until</Label>
              <Input
                id="trusted-caregiver-until"
                type="time"
                value={form.available_until}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    available_until: event.target.value,
                  }))
                }
              />
            </div>

            <p className="text-xs text-muted-foreground sm:col-span-2">
              Leave both times empty when the caregiver is available at any time on the selected
              days.
            </p>

            <div className="space-y-2">
              <Label htmlFor="trusted-caregiver-phone">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  id="trusted-caregiver-phone"
                  className="h-11 rounded-xl border-[#d8e4e0] bg-white pl-9"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trusted-caregiver-email">Email</Label>
              <div className="relative">
                <AtSign className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  id="trusted-caregiver-email"
                  className="h-11 rounded-xl border-[#d8e4e0] bg-white pl-9"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="trusted-caregiver-address">Address</Label>
              <Input
                id="trusted-caregiver-address"
                value={form.address}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    address: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trusted-caregiver-latitude">Latitude (optional)</Label>
              <Input
                id="trusted-caregiver-latitude"
                inputMode="decimal"
                value={form.latitude}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    latitude: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trusted-caregiver-longitude">Longitude (optional)</Label>
              <Input
                id="trusted-caregiver-longitude"
                inputMode="decimal"
                value={form.longitude}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    longitude: event.target.value,
                  }))
                }
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-[#d6e2de] bg-white sm:col-span-2"
              onClick={captureCoordinates}
              disabled={locating}
            >
              {locating ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Crosshair className="mr-2 size-4" />
              )}
              Use current coordinates
            </Button>

            <p className="rounded-xl border border-[#ead9c9] bg-[#fbf7f2] px-4 py-3 text-xs leading-5 text-[#8b633f] sm:col-span-2">
              Save current coordinates only when the caregiver is physically at the intended
              location. The application does not secretly track caregivers.
            </p>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="trusted-caregiver-notes">Notes</Label>
              <Textarea
                id="trusted-caregiver-notes"
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                maxLength={500}
                placeholder="Languages, special skills, emergency availability, or other details"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-[#e5ecea] px-6 py-5">
            <Button variant="outline" className="h-11 rounded-xl border-[#d6e2de] bg-white" onClick={closeDialog} disabled={save.isPending}>
              Cancel
            </Button>
            <Button className="h-11 rounded-xl bg-[#0d6665] px-6 text-white hover:bg-[#0a5958]" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save caregiver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}