import { Phone, PhoneOff, MessageSquare, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type EmergencyContactish = {
  id: string;
  name: string | null;
  phone: string | null;
  email?: string | null;
  relation?: string | null;
};

function isValidPhone(phone: string | null | undefined): phone is string {
  if (!phone) return false;
  return phone.replace(/[^0-9]/g, "").length >= 7;
}

function cleanPhone(phone: string): string {
  return phone.replace(/[^+\d]/g, "");
}

function waNumber(phone: string): string {
  // wa.me expects digits only, no '+'
  return phone.replace(/[^\d]/g, "");
}

function ActionRow({ row }: { row: { label: string; sub: string; phone: string } }) {
  const [copied, setCopied] = useState(false);
  const msg = `Emergency! ${row.label} needs immediate assistance.`;
  const tel = cleanPhone(row.phone);
  const wa = waNumber(row.phone);

  const handleCall = () => {
    toast.info(`📞 Dialing ${row.label} (${row.phone})…`);
    window.location.href = `tel:${tel}`;
  };

  const handleSms = () => {
    toast.info(`💬 Opening SMS to ${row.label} (${row.phone})…`);
    window.location.href = `sms:${tel}?body=${encodeURIComponent(msg)}`;
  };

  const handleWhatsapp = () => {
    toast.success(`🟢 Opening WhatsApp for ${row.label}…`);
    // Open in a new tab — bypasses iframe block on wa.me
    const url = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(row.phone);
      setCopied(true);
      toast.success(`📋 Copied ${row.phone}`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy number");
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 hover:bg-accent/30 transition-colors sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium truncate">{row.label}</p>
        <p className="text-xs text-muted-foreground truncate">
          {row.sub} · {row.phone}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:shrink-0">
        <button
          onClick={handleWhatsapp}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-green-600 text-white px-3 py-2 text-sm font-medium hover:bg-green-700 transition-colors"
          title={`WhatsApp ${row.label}`}
        >
          <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
            <path d="M20.52 3.48A11.93 11.93 0 0 0 12.02 0C5.4 0 .04 5.36.04 11.98c0 2.11.55 4.17 1.6 5.99L0 24l6.2-1.62a11.95 11.95 0 0 0 5.82 1.49h.01c6.62 0 11.98-5.36 11.98-11.98 0-3.2-1.25-6.21-3.49-8.41ZM12.02 21.3h-.01a9.3 9.3 0 0 1-4.74-1.3l-.34-.2-3.68.96.98-3.59-.22-.37a9.3 9.3 0 0 1-1.42-4.92c0-5.14 4.19-9.32 9.34-9.32 2.49 0 4.83.97 6.59 2.73a9.25 9.25 0 0 1 2.73 6.6c0 5.15-4.19 9.41-9.23 9.41Zm5.34-6.97c-.29-.15-1.73-.85-2-.95-.27-.1-.46-.15-.66.15-.19.29-.76.95-.93 1.14-.17.2-.34.22-.63.07-.29-.15-1.23-.45-2.34-1.44-.87-.77-1.45-1.72-1.62-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.43-.51.15-.17.19-.29.29-.49.1-.2.05-.37-.02-.51-.07-.15-.66-1.59-.9-2.18-.24-.57-.48-.49-.66-.5l-.56-.01c-.2 0-.51.07-.78.37-.27.29-1.02 1-1.02 2.44 0 1.44 1.05 2.83 1.2 3.03.15.2 2.07 3.16 5.01 4.43.7.3 1.25.48 1.68.62.71.22 1.35.19 1.86.12.57-.09 1.73-.71 1.97-1.39.24-.68.24-1.27.17-1.39-.07-.12-.27-.19-.56-.34Z" />
          </svg>
          WhatsApp
        </button>
        <button
          onClick={handleSms}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          title={`SMS ${row.label}`}
        >
          <MessageSquare className="size-4" />
          SMS
        </button>
        <button
          onClick={handleCall}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          title={`Call ${row.label}`}
        >
          <Phone className="size-4" />
          Call
        </button>
        <button
          onClick={handleCopy}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-stone-200 text-stone-800 px-3 py-2 text-sm font-medium hover:bg-stone-300 transition-colors"
          title="Copy number"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function EmergencyCallButtons({
  caregivers,
  emergencyContacts,
  profileEmergency,
  parentProfile,
}: {
  caregivers?: EmergencyContactish[];
  emergencyContacts?: EmergencyContactish[];
  profileEmergency?: { name: string | null; phone: string | null } | null;
  parentProfile?: { name: string | null; phone: string | null } | null;
}) {
  type Row = {
    key: string;
    label: string;
    sub: string;
    phone: string | null;
    valid: boolean;
  };

  const rows: Row[] = [];

  if (parentProfile?.name || parentProfile?.phone) {
    rows.push({
      key: "parent-profile",
      label: parentProfile.name || "Parent",
      sub: "Parent's phone number",
      phone: parentProfile.phone ?? null,
      valid: isValidPhone(parentProfile.phone),
    });
  }

  if (profileEmergency?.name || profileEmergency?.phone) {
    rows.push({
      key: "profile-emergency",
      label: profileEmergency.name || "Emergency contact",
      sub: "Primary emergency contact",
      phone: profileEmergency.phone ?? null,
      valid: isValidPhone(profileEmergency.phone),
    });
  }

  for (const c of caregivers ?? []) {
    rows.push({
      key: `caregiver-${c.id}`,
      label: c.name || "Family member",
      sub: "Linked family member",
      phone: c.phone ?? null,
      valid: isValidPhone(c.phone),
    });
  }

  for (const c of emergencyContacts ?? []) {
    rows.push({
      key: `ec-${c.id}`,
      label: c.name || "Emergency contact",
      sub: c.relation || "Emergency contact",
      phone: c.phone ?? null,
      valid: isValidPhone(c.phone),
    });
  }

  const hasAnyValid = rows.some((r) => r.valid);

  return (
    <div className="space-y-2">
      <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Call for help
      </h3>

      {rows.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground flex items-center gap-3">
          <PhoneOff className="size-4 shrink-0 text-muted-foreground/50" />
          No emergency contacts added yet. Add contacts or family members to enable one-tap calling.
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
            {rows.map((r) =>
              r.valid ? (
                <ActionRow
                  key={r.key}
                  row={{ label: r.label, sub: r.sub, phone: r.phone! }}
                />
              ) : (
                <div
                  key={r.key}
                  className="flex items-center justify-between gap-4 p-4 opacity-60"
                  title="No phone number on file"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.sub}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-stone-100 text-stone-400 border border-stone-200 px-3 py-2 text-xs font-medium cursor-not-allowed">
                    <PhoneOff className="size-3.5" />
                    No phone
                  </span>
                </div>
              )
            )}
          </div>

          {!hasAnyValid && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-1">
              Add phone numbers to family members or emergency contacts in Settings to enable one-tap calling and SMS.
            </p>
          )}
        </>
      )}
    </div>
  );
}
