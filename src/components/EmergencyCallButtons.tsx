import { Check, Copy, Mail, MessageSquare, Phone, PhoneOff } from "lucide-react";
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
  const digitCount = phone.replace(/[^0-9]/g, "").length;
  return digitCount >= 7 && digitCount <= 15;
}

function isValidEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function cleanPhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

function waNumber(phone: string): string {
  // wa.me expects digits only and works best when the country code is included.
  return phone.replace(/[^\d]/g, "");
}

function ActionRow({
  row,
  emergencySubjectName,
}: {
  row: {
    label: string;
    sub: string;
    phone: string | null;
    email: string | null;
  };
  emergencySubjectName: string;
}) {
  const [copied, setCopied] = useState(false);
  const message = `Emergency! ${emergencySubjectName} needs immediate assistance. Please respond as soon as possible.`;
  const phone = isValidPhone(row.phone) ? row.phone : null;
  const email = isValidEmail(row.email) ? row.email : null;
  const hasPhone = Boolean(phone);
  const hasEmail = Boolean(email);
  const tel = phone ? cleanPhone(phone) : "";
  const wa = phone ? waNumber(phone) : "";

  const handleCall = () => {
    if (!phone) return;
    toast.info(`Dialing ${row.label} (${phone})…`);
    window.location.href = `tel:${tel}`;
  };

  const handleSms = () => {
    if (!phone) return;
    toast.info(`Opening SMS to ${row.label}…`);
    window.location.href = `sms:${tel}?body=${encodeURIComponent(message)}`;
  };

  const handleWhatsapp = () => {
    if (!phone) return;
    toast.success(`Opening WhatsApp for ${row.label}…`);
    window.open(
      `https://wa.me/${wa}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleEmail = () => {
    if (!email) return;
    const subject = `Emergency assistance needed for ${emergencySubjectName}`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  };

  const handleCopy = async () => {
    if (!phone) return;

    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      toast.success(`Copied ${phone}`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy the phone number");
    }
  };

  const contactDetails = [phone, email].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-3 p-4 transition-colors hover:bg-accent/30 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium">{row.label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.sub}
          {contactDetails ? ` · ${contactDetails}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:items-center">
        {hasPhone && (
          <>
            <button
              type="button"
              onClick={handleWhatsapp}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
              title={`WhatsApp ${row.label}`}
              aria-label={`Send an emergency WhatsApp message to ${row.label}`}
            >
              <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
                <path d="M20.52 3.48A11.93 11.93 0 0 0 12.02 0C5.4 0 .04 5.36.04 11.98c0 2.11.55 4.17 1.6 5.99L0 24l6.2-1.62a11.95 11.95 0 0 0 5.82 1.49h.01c6.62 0 11.98-5.36 11.98-11.98 0-3.2-1.25-6.21-3.49-8.41ZM12.02 21.3h-.01a9.3 9.3 0 0 1-4.74-1.3l-.34-.2-3.68.96.98-3.59-.22-.37a9.3 9.3 0 0 1-1.42-4.92c0-5.14 4.19-9.32 9.34-9.32 2.49 0 4.83.97 6.59 2.73a9.25 9.25 0 0 1 2.73 6.6c0 5.15-4.19 9.41-9.23 9.41Zm5.34-6.97c-.29-.15-1.73-.85-2-.95-.27-.1-.46-.15-.66.15-.19.29-.76.95-.93 1.14-.17.2-.34.22-.63.07-.29-.15-1.23-.45-2.34-1.44-.87-.77-1.45-1.72-1.62-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.43-.51.15-.17.19-.29.29-.49.1-.2.05-.37-.02-.51-.07-.15-.66-1.59-.9-2.18-.24-.57-.48-.49-.66-.5l-.56-.01c-.2 0-.51.07-.78.37-.27.29-1.02 1-1.02 2.44 0 1.44 1.05 2.83 1.2 3.03.15.2 2.07 3.16 5.01 4.43.7.3 1.25.48 1.68.62.71.22 1.35.19 1.86.12.57-.09 1.73-.71 1.97-1.39.24-.68.24-1.27.17-1.39-.07-.12-.27-.19-.56-.34Z" />
              </svg>
              WhatsApp
            </button>
            <button
              type="button"
              onClick={handleSms}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              title={`SMS ${row.label}`}
              aria-label={`Send an emergency SMS to ${row.label}`}
            >
              <MessageSquare className="size-4" />
              SMS
            </button>
            <button
              type="button"
              onClick={handleCall}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              title={`Call ${row.label}`}
              aria-label={`Call ${row.label}`}
            >
              <Phone className="size-4" />
              Call
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-stone-200 px-3 py-2 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-300"
              title="Copy phone number"
              aria-label={`Copy ${row.label}'s phone number`}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </>
        )}

        {hasEmail && (
          <button
            type="button"
            onClick={handleEmail}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            title={`Email ${row.label}`}
            aria-label={`Send an emergency email to ${row.label}`}
          >
            <Mail className="size-4" />
            Email
          </button>
        )}
      </div>
    </div>
  );
}

export function EmergencyCallButtons({
  caregivers,
  emergencyContacts,
  profileEmergency,
  parentProfile,
  emergencySubjectName = "The care recipient",
}: {
  caregivers?: EmergencyContactish[];
  emergencyContacts?: EmergencyContactish[];
  profileEmergency?: { name: string | null; phone: string | null; email?: string | null } | null;
  parentProfile?: { name: string | null; phone: string | null; email?: string | null } | null;
  emergencySubjectName?: string;
}) {
  type Row = {
    key: string;
    label: string;
    sub: string;
    phone: string | null;
    email: string | null;
    hasAction: boolean;
  };

  const rows: Row[] = [];

  if (parentProfile?.name || parentProfile?.phone || parentProfile?.email) {
    rows.push({
      key: "parent-profile",
      label: parentProfile.name || "Parent",
      sub: "Parent's contact details",
      phone: parentProfile.phone ?? null,
      email: parentProfile.email ?? null,
      hasAction: isValidPhone(parentProfile.phone) || isValidEmail(parentProfile.email),
    });
  }

  if (profileEmergency?.name || profileEmergency?.phone || profileEmergency?.email) {
    rows.push({
      key: "profile-emergency",
      label: profileEmergency.name || "Emergency contact",
      sub: "Primary emergency contact",
      phone: profileEmergency.phone ?? null,
      email: profileEmergency.email ?? null,
      hasAction: isValidPhone(profileEmergency.phone) || isValidEmail(profileEmergency.email),
    });
  }

  for (const contact of caregivers ?? []) {
    rows.push({
      key: `caregiver-${contact.id}`,
      label: contact.name || "Family member",
      sub: "Linked family member",
      phone: contact.phone ?? null,
      email: contact.email ?? null,
      hasAction: isValidPhone(contact.phone) || isValidEmail(contact.email),
    });
  }

  for (const contact of emergencyContacts ?? []) {
    rows.push({
      key: `ec-${contact.id}`,
      label: contact.name || "Emergency contact",
      sub: contact.relation || "Emergency contact",
      phone: contact.phone ?? null,
      email: contact.email ?? null,
      hasAction: isValidPhone(contact.phone) || isValidEmail(contact.email),
    });
  }

  const hasAnyAction = rows.some((row) => row.hasAction);

  return (
    <div className="space-y-2">
      <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Contact for help
      </h3>

      {rows.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <PhoneOff className="size-4 shrink-0 text-muted-foreground/50" />
          No emergency contacts have been added yet.
        </div>
      ) : (
        <>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {rows.map((row) =>
              row.hasAction ? (
                <ActionRow key={row.key} row={row} emergencySubjectName={emergencySubjectName} />
              ) : (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-4 p-4 opacity-60"
                  title="No valid phone number or email address on file"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.sub}</p>
                  </div>
                  <span className="inline-flex shrink-0 cursor-not-allowed items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-3 py-2 text-xs font-medium text-stone-400">
                    <PhoneOff className="size-3.5" />
                    No contact method
                  </span>
                </div>
              ),
            )}
          </div>

          {!hasAnyAction && (
            <p className="mt-1 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Add a valid phone number or email address to enable emergency contact actions.
            </p>
          )}
        </>
      )}
    </div>
  );
}
