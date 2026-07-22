import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, MapPin, MessageCircle, Phone, Share2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { TrustedCaregiver } from "@/components/TrustedCaregiverDirectory";
import { mapsLink } from "@/lib/geolocation";

function distanceKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(latitudeB - latitudeA);
  const dLon = toRadians(longitudeB - longitudeA);
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
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
  const { data: caregivers = [] } = useQuery({
    queryKey: ["trusted-caregivers", parentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("trusted_caregivers")
        .select("*")
        .eq("parent_id", parentId)
        .eq("available", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrustedCaregiver[];
    },
  });

  const sorted = useMemo(() => {
    return caregivers
      .map((caregiver) => ({
        caregiver,
        distance:
          latitude != null &&
          longitude != null &&
          caregiver.latitude != null &&
          caregiver.longitude != null
            ? distanceKm(latitude, longitude, caregiver.latitude, caregiver.longitude)
            : null,
      }))
      .sort((left, right) => {
        if (left.distance == null && right.distance == null)
          return left.caregiver.name.localeCompare(right.caregiver.name);
        if (left.distance == null) return 1;
        if (right.distance == null) return -1;
        return left.distance - right.distance;
      });
  }, [caregivers, latitude, longitude]);

  const locationUrl = latitude != null && longitude != null ? mapsLink(latitude, longitude) : null;
  const message = `Emergency assistance is needed for ${subjectName}.${
    locationUrl ? ` Current location: ${locationUrl}` : ""
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
        toast.success(`Emergency message copied for ${caregiver.name}.`);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("The emergency message could not be shared.");
    }
  }

  if (sorted.length === 0) return null;

  return (
    <section className="rounded-3xl border border-violet-200 bg-violet-50/50 p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white">
          <UsersRound className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold italic text-violet-950">
            Trusted caregivers near the latest SOS location
          </h2>
          <p className="mt-1 text-sm text-violet-800">
            Distance is shown only for contacts whose coordinates were added manually. Contact
            actions remain user-confirmed and free.
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
              className="rounded-2xl border border-violet-100 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{caregiver.name}</h3>
                  <p className="text-xs capitalize text-muted-foreground">
                    {caregiver.caregiver_type}
                  </p>
                </div>
                {distance != null && (
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold ${distance <= 10 ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}
                  >
                    {distance < 1
                      ? `${Math.round(distance * 1000)} m`
                      : `${distance.toFixed(1)} km`}
                  </span>
                )}
              </div>

              {caregiver.address && (
                <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" /> {caregiver.address}
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                {phone && (
                  <Button asChild size="sm" className="rounded-xl">
                    <a href={`tel:${phone}`}>
                      <Phone className="mr-1.5 size-3.5" /> Call
                    </a>
                  </Button>
                )}
                {phone && (
                  <Button asChild size="sm" variant="outline" className="rounded-xl">
                    <a href={`sms:${phone}?body=${encodeURIComponent(message)}`}>
                      <MessageCircle className="mr-1.5 size-3.5" /> SMS
                    </a>
                  </Button>
                )}
                {phone && (
                  <Button asChild size="sm" variant="outline" className="rounded-xl">
                    <a
                      href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="mr-1.5 size-3.5" /> WhatsApp
                    </a>
                  </Button>
                )}
                {caregiver.email && (
                  <Button asChild size="sm" variant="outline" className="rounded-xl">
                    <a
                      href={`mailto:${caregiver.email}?subject=${encodeURIComponent(`Emergency for ${subjectName}`)}&body=${encodeURIComponent(message)}`}
                    >
                      <Mail className="mr-1.5 size-3.5" /> Email
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="col-span-2 rounded-xl"
                  onClick={() => void share(caregiver)}
                >
                  <Share2 className="mr-1.5 size-3.5" /> Share emergency message
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
