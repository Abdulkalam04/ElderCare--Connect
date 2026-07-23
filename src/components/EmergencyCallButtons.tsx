import {
  Check,
  Copy,
  Mail,
  MessageSquare,
  Phone,
  PhoneOff,
  Send,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type EmergencyContactish = {
  id: string;
  name: string | null;
  phone: string | null;
  email?: string | null;
  relation?: string | null;
};

function isValidPhone(
  phone: string | null | undefined,
): phone is string {
  if (!phone) {
    return false;
  }

  const digitCount = phone.replace(/[^0-9]/g, "").length;
  return digitCount >= 7 && digitCount <= 15;
}

function isValidEmail(
  email: string | null | undefined,
): email is string {
  if (!email) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function cleanPhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");

  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

function waNumber(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

function ActionButton({
  icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "primary" | "neutral" | "whatsapp";
}) {
  const toneClass = {
    primary:
      "border-[#0d6665] bg-[#0d6665] text-white hover:bg-[#0a5958]",
    neutral:
      "border-[#d5e2de] bg-white text-[#48666b] hover:border-[#b9d0c9] hover:bg-[#f2f8f5]",
    whatsapp:
      "border-[#b9d9cb] bg-[#eff8f3] text-[#247154] hover:bg-[#e5f3eb]",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors ${toneClass}`}
    >
      {icon}
      {label}
    </button>
  );
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

  function handleCall() {
    if (!phone) {
      return;
    }

    toast.info(`Opening the dialler for ${row.label}.`);
    window.location.href = `tel:${tel}`;
  }

  function handleSms() {
    if (!phone) {
      return;
    }

    window.location.href = `sms:${tel}?body=${encodeURIComponent(
      message,
    )}`;
  }

  function handleWhatsapp() {
    if (!phone) {
      return;
    }

    window.open(
      `https://wa.me/${wa}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function handleEmail() {
    if (!email) {
      return;
    }

    const subject = `Emergency assistance needed for ${emergencySubjectName}`;

    window.location.href = `mailto:${email}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(message)}`;
  }

  async function handleCopy() {
    if (!phone) {
      return;
    }

    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      toast.success("Phone number copied.");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("The phone number could not be copied.");
    }
  }

  const contactDetails = [phone, email].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-[#fbfdfc] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-[#24454b]">
          {row.label}
        </p>

        <p className="mt-0.5 truncate text-xs text-[#74898d]">
          {row.sub}
          {contactDetails ? ` · ${contactDetails}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
        {hasPhone && (
          <>
            <ActionButton
              icon={<Phone className="size-3.5" />}
              label="Call"
              tone="primary"
              onClick={handleCall}
            />

            <ActionButton
              icon={<MessageSquare className="size-3.5" />}
              label="SMS"
              onClick={handleSms}
            />

            <ActionButton
              icon={<Send className="size-3.5" />}
              label="WhatsApp"
              tone="whatsapp"
              onClick={handleWhatsapp}
            />

            <ActionButton
              icon={
                copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )
              }
              label={copied ? "Copied" : "Copy"}
              onClick={handleCopy}
            />
          </>
        )}

        {hasEmail && (
          <ActionButton
            icon={<Mail className="size-3.5" />}
            label="Email"
            onClick={handleEmail}
          />
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
  profileEmergency?: {
    name: string | null;
    phone: string | null;
    email?: string | null;
  } | null;
  parentProfile?: {
    name: string | null;
    phone: string | null;
    email?: string | null;
  } | null;
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

  if (
    parentProfile?.name ||
    parentProfile?.phone ||
    parentProfile?.email
  ) {
    rows.push({
      key: "parent-profile",
      label: parentProfile.name || "Parent",
      sub: "Parent contact",
      phone: parentProfile.phone ?? null,
      email: parentProfile.email ?? null,
      hasAction:
        isValidPhone(parentProfile.phone) ||
        isValidEmail(parentProfile.email),
    });
  }

  if (
    profileEmergency?.name ||
    profileEmergency?.phone ||
    profileEmergency?.email
  ) {
    rows.push({
      key: "profile-emergency",
      label: profileEmergency.name || "Emergency contact",
      sub: "Primary emergency contact",
      phone: profileEmergency.phone ?? null,
      email: profileEmergency.email ?? null,
      hasAction:
        isValidPhone(profileEmergency.phone) ||
        isValidEmail(profileEmergency.email),
    });
  }

  for (const contact of caregivers ?? []) {
    rows.push({
      key: `caregiver-${contact.id}`,
      label: contact.name || "Family member",
      sub: "Linked family member",
      phone: contact.phone ?? null,
      email: contact.email ?? null,
      hasAction:
        isValidPhone(contact.phone) ||
        isValidEmail(contact.email),
    });
  }

  for (const contact of emergencyContacts ?? []) {
    rows.push({
      key: `ec-${contact.id}`,
      label: contact.name || "Emergency contact",
      sub: contact.relation || "Emergency contact",
      phone: contact.phone ?? null,
      email: contact.email ?? null,
      hasAction:
        isValidPhone(contact.phone) ||
        isValidEmail(contact.email),
    });
  }

  const hasAnyAction = rows.some((row) => row.hasAction);

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-[#e2e9e7] bg-[#f8fbfa] p-4 text-sm text-[#71868a]">
          <PhoneOff className="size-4 shrink-0 text-[#8a9a9d]" />
          No emergency contacts have been added.
        </div>
      ) : (
        <>
          <div className="divide-y divide-[#e5ecea] overflow-hidden rounded-xl border border-[#dce7e3] bg-white">
            {rows.map((row) =>
              row.hasAction ? (
                <ActionRow
                  key={row.key}
                  row={row}
                  emergencySubjectName={emergencySubjectName}
                />
              ) : (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-4 px-4 py-4"
                  title="No valid phone number or email address"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#4e696e]">
                      {row.label}
                    </p>

                    <p className="mt-0.5 text-xs text-[#839397]">
                      {row.sub}
                    </p>
                  </div>

                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#eef2f1] px-2.5 py-1 text-[10px] font-bold text-[#7b8d91]">
                    <PhoneOff className="size-3" />
                    No contact method
                  </span>
                </div>
              ),
            )}
          </div>

          {!hasAnyAction && (
            <p className="rounded-xl border border-[#ead9c9] bg-[#fbf7f2] px-4 py-3 text-xs leading-5 text-[#8b633f]">
              Add a valid phone number or email address to enable
              emergency communication.
            </p>
          )}
        </>
      )}
    </div>
  );
}