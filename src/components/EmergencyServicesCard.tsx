import {
  Ambulance,
  Copy,
  MapPin,
  PhoneCall,
  Share2,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { mapsLink } from "@/lib/geolocation";

export function EmergencyServicesCard({
  subjectName,
  latitude,
  longitude,
}: {
  subjectName: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const locationUrl =
    latitude != null && longitude != null
      ? mapsLink(latitude, longitude)
      : null;

  const shareText = `Emergency assistance is needed for ${subjectName}.${locationUrl ? ` Current location: ${locationUrl}` : ""
    }`;

  async function copyLocation() {
    if (!locationUrl) {
      toast.error("No SOS location is available yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(locationUrl);
      toast.success("Emergency location copied.");
    } catch {
      toast.error("The location could not be copied.");
    }
  }

  async function shareEmergency() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Emergency for ${subjectName}`,
          text: shareText,
          url: locationUrl ?? undefined,
        });
      } else {
        await navigator.clipboard.writeText(shareText);
        toast.success(
          "Emergency message copied. Paste it into a messaging app.",
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

  return (
    <section className="rounded-[1.75rem] border border-[#e5d2ce] bg-white p-5 shadow-[0_20px_55px_-44px_rgba(18,49,54,0.45)] sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f7e7e4] text-[#a74742]">
          <Ambulance className="size-5" />
        </span>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#a74742]">
            Public emergency services
          </p>

          <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em] text-[#17343a]">
            Emergency calling — India
          </h2>

          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#71868a]">
            These actions open the phone dialler or sharing panel.
            The user must confirm the final call or message.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Button
          asChild
          className="h-11 rounded-xl bg-[#a74742] text-white hover:bg-[#913c38]"
        >
          <a
            href="tel:112"
            aria-label="Call national emergency number 112"
          >
            <PhoneCall className="size-4" />
            Call 112
          </a>
        </Button>

        <Button
          asChild
          variant="outline"
          className="h-11 rounded-xl border-[#dfbbb5] bg-white text-[#9a4540] hover:bg-[#fff5f4]"
        >
          <a
            href="tel:108"
            aria-label="Call ambulance number 108 where available"
          >
            <Ambulance className="size-4" />
            Ambulance 108
          </a>
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl border-[#d6e2de] bg-white text-[#4d686d]"
          onClick={copyLocation}
          disabled={!locationUrl}
        >
          <Copy className="size-4" />
          Copy location
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl border-[#d6e2de] bg-white text-[#4d686d]"
          onClick={shareEmergency}
        >
          <Share2 className="size-4" />
          Share emergency
        </Button>
      </div>

      <div
        className={`mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-xs leading-5 ${locationUrl
            ? "border-[#d7e6e1] bg-[#f4f9f7] text-[#5f777b]"
            : "border-[#ead9c9] bg-[#fbf7f2] text-[#80664f]"
          }`}
      >
        {locationUrl ? (
          <MapPin className="mt-0.5 size-4 shrink-0 text-[#176f69]" />
        ) : (
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#9b6339]" />
        )}

        <span>
          {locationUrl
            ? "The latest SOS coordinates will be included when the emergency is shared."
            : "Location is not available yet. Keep the application open and allow location access during an active SOS."}
        </span>
      </div>
    </section>
  );
}