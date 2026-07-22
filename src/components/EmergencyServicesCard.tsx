import { Ambulance, Copy, MapPin, PhoneCall, Share2, ShieldAlert } from "lucide-react";
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
  const locationUrl = latitude != null && longitude != null ? mapsLink(latitude, longitude) : null;
  const shareText = `Emergency assistance is needed for ${subjectName}.${locationUrl ? ` Current location: ${locationUrl}` : ""}`;
  async function copyLocation() {
    if (!locationUrl) {
      toast.error("No SOS location is available yet.");
      return;
    }
    await navigator.clipboard.writeText(locationUrl);
    toast.success("Emergency location copied.");
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
        toast.success("Emergency message copied. Paste it into any messaging app.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("The emergency message could not be shared.");
    }
  }
  return (
    <section className="rounded-3xl border border-red-200 bg-red-50/70 p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-red-600 text-white">
          <Ambulance className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold italic text-red-950">
            Emergency services — India
          </h2>
          <p className="mt-1 text-sm text-red-800">
            These buttons open the phone dialler. The user must confirm the call; a website cannot
            silently call or book an ambulance.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Button asChild className="h-12 rounded-xl bg-red-600 text-white hover:bg-red-700">
          <a href="tel:112" aria-label="Call national emergency number 112">
            <PhoneCall className="mr-2 size-4" /> Call 112
          </a>
        </Button>

        <Button asChild variant="outline" className="h-12 rounded-xl border-red-300 text-red-700">
          <a href="tel:108" aria-label="Call ambulance number 108 where available">
            <Ambulance className="mr-2 size-4" /> Ambulance 108
          </a>
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-12 rounded-xl"
          onClick={copyLocation}
          disabled={!locationUrl}
        >
          <Copy className="mr-2 size-4" /> Copy location
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-12 rounded-xl"
          onClick={shareEmergency}
        >
          <Share2 className="mr-2 size-4" /> Share emergency
        </Button>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-white/80 p-3 text-xs text-red-900">
        {locationUrl ? (
          <MapPin className="mt-0.5 size-4 shrink-0 text-red-600" />
        ) : (
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
        )}
        <span>
          {locationUrl
            ? "The latest SOS coordinates will be included when sharing."
            : "Location is not available yet. Keep the app open and allow location permission during an active SOS."}
        </span>
      </div>
    </section>
  );
}
