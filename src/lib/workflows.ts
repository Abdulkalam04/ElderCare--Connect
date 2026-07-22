export type CaregiverBookingStatus =
  | "pending"
  | "confirmed"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";
export type TransportBookingStatus =
  | "pending"
  | "confirmed"
  | "driver_assigned"
  | "en_route"
  | "arrived"
  | "completed"
  | "cancelled";
export type VideoConsultationStatus =
  | "scheduled"
  | "pending"
  | "waiting"
  | "in_progress"
  | "completed"
  | "cancelled";
const CAREGIVER_TRANSITIONS: Record<CaregiverBookingStatus, CaregiverBookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["assigned", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};
const TRANSPORT_TRANSITIONS: Record<TransportBookingStatus, TransportBookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["driver_assigned", "cancelled"],
  driver_assigned: ["en_route", "cancelled"],
  en_route: ["arrived", "cancelled"],
  arrived: ["completed"],
  completed: [],
  cancelled: [],
};
const VIDEO_TRANSITIONS: Record<VideoConsultationStatus, VideoConsultationStatus[]> = {
  scheduled: ["waiting", "in_progress", "cancelled"],
  pending: ["waiting", "in_progress", "cancelled"],
  waiting: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
};
export function canTransitionCaregiverBooking(
  current: CaregiverBookingStatus,
  next: CaregiverBookingStatus,
) {
  return CAREGIVER_TRANSITIONS[current].includes(next);
}
export function canTransitionTransportBooking(
  current: TransportBookingStatus,
  next: TransportBookingStatus,
) {
  return TRANSPORT_TRANSITIONS[current].includes(next);
}
export function nextTransportStatus(
  current: TransportBookingStatus,
): TransportBookingStatus | null {
  switch (current) {
    case "pending":
      return "confirmed";
    case "confirmed":
      return "driver_assigned";
    case "driver_assigned":
      return "en_route";
    case "en_route":
      return "arrived";
    case "arrived":
      return "completed";
    default:
      return null;
  }
}
export function canCancelTransportBooking(status: TransportBookingStatus) {
  return ["pending", "confirmed", "driver_assigned", "en_route"].includes(status);
}
export function validateCancellationReason(reason: string) {
  const cleanReason = reason.trim();
  if (cleanReason.length < 3) {
    throw new Error("Please enter a cancellation reason of at least 3 characters.");
  }
  return cleanReason;
}
export function validateDriverAssignment(input: { name: string; phone: string; vehicle: string }) {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const vehicle = input.vehicle.trim();
  if (!name) throw new Error("Driver name is required.");
  if (phone.length < 7) throw new Error("A valid driver phone number is required.");
  if (!vehicle) throw new Error("Vehicle details are required.");
  return { name, phone, vehicle };
}
export function canTransitionVideoConsultation(
  current: VideoConsultationStatus,
  next: VideoConsultationStatus,
) {
  return VIDEO_TRANSITIONS[current].includes(next);
}
export function isVideoConsultationCancellable(status: VideoConsultationStatus) {
  return ["scheduled", "pending", "waiting"].includes(status);
}
export function isValidHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
export type CaregiverAvailability = {
  caregiver_type: "nurse" | "physiotherapist" | "companion" | "caretaker" | "other";
  available: boolean;
  available_days: number[];
  available_from: string | null;
  available_until: string | null;
};
export type CaregiverBookingRequest = {
  caregiver_type: "nurse" | "physiotherapist" | "companion" | "caretaker";
  booking_date: string | null;
  booking_time: string | null;
  scheduled_at: string;
};
function timeValue(value: string | null) {
  return value ? value.slice(0, 5) : null;
}
export function caregiverMatchesBooking(
  caregiver: CaregiverAvailability,
  booking: CaregiverBookingRequest,
) {
  if (!caregiver.available) return false;
  if (caregiver.caregiver_type !== "other" && caregiver.caregiver_type !== booking.caregiver_type) {
    return false;
  }
  const dateValue = booking.booking_date ?? booking.scheduled_at.slice(0, 10);
  const bookingDate = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(bookingDate.getTime())) return false;
  const availableDays = caregiver.available_days.length
    ? caregiver.available_days
    : [0, 1, 2, 3, 4, 5, 6];
  if (!availableDays.includes(bookingDate.getDay())) return false;
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
