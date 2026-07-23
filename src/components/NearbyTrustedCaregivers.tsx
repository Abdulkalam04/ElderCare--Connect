import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Share2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { TrustedCaregiver } from "@/components/TrustedCaregiverDirectory";
import { supabase } from "@/integrations/supabase/client";
import { mapsLink } from "@/lib/geolocation";

function distanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(latitudeB - latitudeA);
  const dLon = toRadians(longitudeB - longitudeA);
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

function cleanPhone(value: string | null) {
  return value?.replace(/[^+\d]/g, "") ?? "";
}

export function NearbyTrustedCaregivers({
  parentId,
  subjectName,
  latitude,
  longitude,
}: {
  parentId: string;
  subjectName: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const { data: caregivers = [], isLoading } = useQuery({
    queryKey: ["trusted-caregivers", parentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("trusted_caregivers")
        .select("*")
        .eq("parent_id", parentId)
        .eq("available", true)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as TrustedCaregiver[];
    },
  });

  const sorted = useMemo(
    () =>
      caregivers
        .map((caregiver) => ({
          caregiver,
          distance:
            latitude != null &&
              longitude != null &&
              caregiver.latitude != null &&
              caregiver.longitude != null
              ? distanceKm(
                latitude,
                longitude,
                caregiver.latitude,
                caregiver.longitude,
              )
              : null,
        }))
        .sort((left, right) => {
          if (left.distance == null && right.distance == null) {
            return left.caregiver.name.localeCompare(
              right.caregiver.name,
            );
          }

          if (left.distance == null) {
            return 1;
          }

          if (right.distance == null) {
            return -1;
          }

          return left.distance - right.distance;
        }),
    [caregivers, latitude, longitude],
  );

  const locationUrl =
    latitude != null && longitude != null
      ? mapsLink(latitude, longitude)
      : null;

  const message = `Emergency assistance is needed for ${subjectName}.${locationUrl ? ` Current location: ${locationUrl}` : ""
    }`;

  async function share(caregiver: TrustedCaregiver) {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Emergency for ${subjectName}`,
          text: message,
          url: locationUrl ?? undefined,
        });
      } else {
        await navigator.clipboard.writeText(message);
        toast.success(
          `Emergency message copied for ${caregiver.name}.`,
        );
      }
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      toast.error("The emergency message could not be shared.");
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-[1.5rem] border border-[#dce8e4] bg-white p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-64 rounded bg-[#e6eeeb]" />
          <div className="grid gap-3 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-40 rounded-2xl bg-[#f0f4f3]"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (sorted.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.75rem] border border-[#dce8e4] bg-white p-5 shadow-[0_20px_55px_-44px_rgba(18,49,54,0.45)] sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e6f2ee] text-[#176f69]">
          <UsersRound className="size-5" />
        </span>

        <div>
          <h2 className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">
            Available trusted caregivers
          </h2>

          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#71868a]">
            Caregivers with saved coordinates are ordered by their
            approximate distance from the latest SOS location.
            Contact actions always require user confirmation.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {sorted.map(({ caregiver, distance }) => {
          const phone = cleanPhone(caregiver.phone);
          const whatsapp = phone.replace(/^\+/, "");

          return (
            <article
              key={caregiver.id}
              className="professional-card-hover rounded-2xl border border-[#dce7e3] bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-[#1d3e44]">
                    {caregiver.name}
                  </h3>

                  <p className="mt-0.5 text-xs font-medium capitalize text-[#788c90]">
                    {caregiver.caregiver_type.replace("_", " ")}
                  </p>
                </div>

                {distance != null && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${distance <= 10
                        ? "bg-[#e4f1ec] text-[#176f5f]"
                        : "bg-[#eef2f1] text-[#657b7f]"
                      }`}
                  >
                    {distance < 1
                      ? `${Math.round(distance * 1000)} m`
                      : `${distance.toFixed(1)} km`}
                  </span>
                )}
              </div>

              {caregiver.address && (
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#6d8287]">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#7f9498]" />
                  {caregiver.address}
                </p>
              )}

              {distance == null && (
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#7a8e92]">
                  <Navigation className="mt-0.5 size-3.5 shrink-0" />
                  Distance unavailable because coordinates are not
                  saved.
                </p>
              )}

              <div className="mt-5 grid grid-cols-2 gap-2">
                {phone && (
                  <Button
                    asChild
                    size="sm"
                    className="h-10 rounded-xl bg-[#0d6665] text-white hover:bg-[#0a5958]"
                  >
                    <a href={`tel:${phone}`}>
                      <Phone className="size-3.5" />
                      Call
                    </a>
                  </Button>
                )}

                {phone && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-10 rounded-xl border-[#d6e2de] bg-white"
                  >
                    <a
                      href={`sms:${phone}?body=${encodeURIComponent(
                        message,
                      )}`}
                    >
                      <MessageCircle className="size-3.5" />
                      SMS
                    </a>
                  </Button>
                )}

                {phone && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-10 rounded-xl border-[#d6e2de] bg-white"
                  >
                    <a
                      href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
                        message,
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="size-3.5" />
                      WhatsApp
                    </a>
                  </Button>
                )}

                {caregiver.email && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-10 rounded-xl border-[#d6e2de] bg-white"
                  >
                    <a
                      href={`mailto:${caregiver.email}?subject=${encodeURIComponent(
                        `Emergency for ${subjectName}`,
                      )}&body=${encodeURIComponent(message)}`}
                    >
                      <Mail className="size-3.5" />
                      Email
                    </a>
                  </Button>
                )}

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="col-span-2 h-10 rounded-xl border-[#bfd3cd] bg-[#f5f9f7] text-[#31575c] hover:bg-[#edf5f2]"
                  onClick={() => void share(caregiver)}
                >
                  <Share2 className="size-3.5" />
                  Share emergency message
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}