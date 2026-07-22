import { describe, expect, it } from "vitest";
import {
  caregiverMatchesBooking,
  canCancelTransportBooking,
  canTransitionCaregiverBooking,
  canTransitionTransportBooking,
  canTransitionVideoConsultation,
  isValidHttpsUrl,
  isVideoConsultationCancellable,
  nextTransportStatus,
  validateCancellationReason,
  validateDriverAssignment,
} from "@/lib/workflows";
describe("caregiver booking workflow", () => {
  it("allows only the configured forward transitions and cancellations", () => {
    expect(canTransitionCaregiverBooking("pending", "confirmed")).toBe(true);
    expect(canTransitionCaregiverBooking("confirmed", "assigned")).toBe(true);
    expect(canTransitionCaregiverBooking("assigned", "in_progress")).toBe(true);
    expect(canTransitionCaregiverBooking("in_progress", "completed")).toBe(true);
    expect(canTransitionCaregiverBooking("pending", "completed")).toBe(false);
    expect(canTransitionCaregiverBooking("completed", "cancelled")).toBe(false);
  });
  it("matches a caregiver by service, weekday, and working time", () => {
    const caregiver = {
      caregiver_type: "nurse" as const,
      available: true,
      available_days: [1, 2, 3, 4, 5],
      available_from: "09:00:00",
      available_until: "18:00:00",
    };
    expect(
      caregiverMatchesBooking(caregiver, {
        caregiver_type: "nurse",
        booking_date: "2026-07-20",
        booking_time: "10:30:00",
        scheduled_at: "2026-07-20T10:30:00+05:30",
      }),
    ).toBe(true);
    expect(
      caregiverMatchesBooking(caregiver, {
        caregiver_type: "physiotherapist",
        booking_date: "2026-07-20",
        booking_time: "10:30:00",
        scheduled_at: "2026-07-20T10:30:00+05:30",
      }),
    ).toBe(false);
    expect(
      caregiverMatchesBooking(caregiver, {
        caregiver_type: "nurse",
        booking_date: "2026-07-20",
        booking_time: "19:00:00",
        scheduled_at: "2026-07-20T19:00:00+05:30",
      }),
    ).toBe(false);
  });
  it("supports an all-service caregiver and default all-day availability", () => {
    expect(
      caregiverMatchesBooking(
        {
          caregiver_type: "other",
          available: true,
          available_days: [],
          available_from: null,
          available_until: null,
        },
        {
          caregiver_type: "companion",
          booking_date: null,
          booking_time: null,
          scheduled_at: "2026-07-19T12:00:00+05:30",
        },
      ),
    ).toBe(true);
  });
  it("rejects unavailable caregivers, unsupported weekdays, and invalid dates", () => {
    const booking = {
      caregiver_type: "nurse" as const,
      booking_date: "2026-07-19",
      booking_time: "10:00:00",
      scheduled_at: "2026-07-19T10:00:00+05:30",
    };
    expect(
      caregiverMatchesBooking(
        {
          caregiver_type: "nurse",
          available: false,
          available_days: [0],
          available_from: "09:00",
          available_until: "18:00",
        },
        booking,
      ),
    ).toBe(false);
    expect(
      caregiverMatchesBooking(
        {
          caregiver_type: "nurse",
          available: true,
          available_days: [1],
          available_from: "09:00",
          available_until: "18:00",
        },
        booking,
      ),
    ).toBe(false);
    expect(
      caregiverMatchesBooking(
        {
          caregiver_type: "nurse",
          available: true,
          available_days: [],
          available_from: null,
          available_until: null,
        },
        { ...booking, booking_date: "not-a-date", scheduled_at: "not-a-date" },
      ),
    ).toBe(false);
  });
});
describe("transport workflow", () => {
  it("returns each next workflow status in order", () => {
    expect(nextTransportStatus("pending")).toBe("confirmed");
    expect(nextTransportStatus("confirmed")).toBe("driver_assigned");
    expect(nextTransportStatus("driver_assigned")).toBe("en_route");
    expect(nextTransportStatus("en_route")).toBe("arrived");
    expect(nextTransportStatus("arrived")).toBe("completed");
    expect(nextTransportStatus("completed")).toBeNull();
  });
  it("rejects skipped and reversed transitions", () => {
    expect(canTransitionTransportBooking("pending", "confirmed")).toBe(true);
    expect(canTransitionTransportBooking("pending", "completed")).toBe(false);
    expect(canTransitionTransportBooking("arrived", "driver_assigned")).toBe(false);
  });
  it("permits cancellation only before arrival", () => {
    expect(canCancelTransportBooking("pending")).toBe(true);
    expect(canCancelTransportBooking("en_route")).toBe(true);
    expect(canCancelTransportBooking("arrived")).toBe(false);
    expect(canCancelTransportBooking("completed")).toBe(false);
  });
  it("normalises valid cancellation and driver details", () => {
    expect(validateCancellationReason("  Appointment moved  ")).toBe("Appointment moved");
    expect(
      validateDriverAssignment({
        name: "  Rahul Sharma ",
        phone: " 9876543210 ",
        vehicle: " White Swift ",
      }),
    ).toEqual({
      name: "Rahul Sharma",
      phone: "9876543210",
      vehicle: "White Swift",
    });
  });
  it("rejects incomplete cancellation and driver details", () => {
    expect(() => validateCancellationReason("x")).toThrow("at least 3 characters");
    expect(() => validateDriverAssignment({ name: "", phone: "123", vehicle: "" })).toThrow(
      "Driver name is required",
    );
    expect(() => validateDriverAssignment({ name: "Rahul", phone: "123", vehicle: "Car" })).toThrow(
      "valid driver phone",
    );
    expect(() =>
      validateDriverAssignment({ name: "Rahul", phone: "9876543210", vehicle: "" }),
    ).toThrow("Vehicle details");
  });
});
describe("video consultation workflow", () => {
  it("allows check-in, joining, completion, and early cancellation", () => {
    expect(canTransitionVideoConsultation("scheduled", "waiting")).toBe(true);
    expect(canTransitionVideoConsultation("waiting", "in_progress")).toBe(true);
    expect(canTransitionVideoConsultation("in_progress", "completed")).toBe(true);
    expect(canTransitionVideoConsultation("scheduled", "completed")).toBe(false);
    expect(canTransitionVideoConsultation("completed", "cancelled")).toBe(false);
  });
  it("allows cancellation only before a consultation starts", () => {
    expect(isVideoConsultationCancellable("scheduled")).toBe(true);
    expect(isVideoConsultationCancellable("waiting")).toBe(true);
    expect(isVideoConsultationCancellable("in_progress")).toBe(false);
    expect(isVideoConsultationCancellable("completed")).toBe(false);
  });
  it("accepts only HTTPS meeting links", () => {
    expect(isValidHttpsUrl("https://meet.jit.si/eldercare-test")).toBe(true);
    expect(isValidHttpsUrl("http://meet.example.com/test")).toBe(false);
    expect(isValidHttpsUrl("meet.google.com/test")).toBe(false);
  });
});
