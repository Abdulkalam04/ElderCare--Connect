import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ContactRound,
  Crown,
  Mail,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmergencyCallButtons } from "@/components/EmergencyCallButtons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActiveParent, useCurrentUser } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute(
  "/_authenticated/emergency-contacts",
)({
  ssr: false,
  component: EmergencyContactsPage,
});

type Contact = {
  id: string;
  parent_id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");

  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

function isValidPhone(phone: string): boolean {
  const digitCount = phone.replace(/\D/g, "").length;

  return digitCount >= 7 && digitCount <= 15;
}

const contactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(100, "Name is too long"),
    relationship: z
      .string()
      .trim()
      .max(80, "Relationship is too long")
      .optional()
      .or(z.literal("")),
    phone: z
      .string()
      .trim()
      .max(40, "Phone number is too long")
      .optional()
      .or(z.literal(""))
      .refine(
        (value) => !value || isValidPhone(value),
        "Enter a valid phone number with 7 to 15 digits",
      ),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address")
      .max(255)
      .optional()
      .or(z.literal("")),
    priority: z
      .number()
      .int()
      .min(1, "Priority must be between 1 and 10")
      .max(10, "Priority must be between 1 and 10"),
    notes: z
      .string()
      .trim()
      .max(500, "Notes cannot exceed 500 characters")
      .optional()
      .or(z.literal("")),
  })
  .refine((value) => Boolean(value.phone || value.email), {
    message: "Add at least a phone number or an email address",
    path: ["phone"],
  });

type ContactInput = z.infer<typeof contactSchema>;

function EmergencyContactsPage() {
  const { activeParentId, activeParent } = useActiveParent();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);
  const [search, setSearch] = useState("");

  const contactsQuery = useQuery({
    queryKey: ["emergency_contacts", activeParentId],
    enabled: Boolean(activeParentId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("emergency_contacts")
        .select("*")
        .eq("parent_id", activeParentId!)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []) as Contact[];
    },
  });

  const contacts = contactsQuery.data ?? [];

  useEffect(() => {
    if (!activeParentId) {
      return;
    }

    const channel = supabase
      .channel(`emergency-contacts-${activeParentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "emergency_contacts",
          filter: `parent_id=eq.${activeParentId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["emergency_contacts", activeParentId],
          });

          void queryClient.invalidateQueries({
            queryKey: ["global_emergency_contacts", activeParentId],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeParentId, queryClient]);

  const refreshContactQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["emergency_contacts", activeParentId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["global_emergency_contacts", activeParentId],
      }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (
      input: ContactInput & {
        id?: string;
      },
    ) => {
      if (!activeParentId) {
        throw new Error("No care-recipient account is selected.");
      }

      const parsed = contactSchema.parse(input);
      const normalizedPhone = parsed.phone
        ? normalizePhone(parsed.phone)
        : null;
      const normalizedEmail = parsed.email
        ? parsed.email.trim().toLowerCase()
        : null;

      const duplicate = contacts.find((contact) => {
        if (contact.id === input.id) {
          return false;
        }

        const samePhone =
          Boolean(normalizedPhone) &&
          Boolean(contact.phone) &&
          normalizePhone(contact.phone ?? "") === normalizedPhone;

        const sameEmail =
          Boolean(normalizedEmail) &&
          Boolean(contact.email) &&
          contact.email?.trim().toLowerCase() === normalizedEmail;

        return samePhone || sameEmail;
      });

      if (duplicate) {
        throw new Error(
          `This phone number or email is already used by ${duplicate.name}.`,
        );
      }

      if (!input.id && contacts.length >= 10) {
        throw new Error(
          "You can add a maximum of 10 emergency contacts.",
        );
      }

      const payload = {
        parent_id: activeParentId,
        name: parsed.name,
        relationship: parsed.relationship || null,
        phone: normalizedPhone,
        email: normalizedEmail,
        priority: parsed.priority,
        notes: parsed.notes || null,
      };

      let savedId: string;

      if (input.id) {
        const { data, error } = await (supabase as any)
          .from("emergency_contacts")
          .update(payload)
          .eq("id", input.id)
          .eq("parent_id", activeParentId)
          .select("id")
          .maybeSingle();

        if (error) {
          throw new Error(
            error.message ?? "Failed to update contact",
          );
        }

        if (!data) {
          throw new Error(
            "The contact was not updated. It may have already been removed.",
          );
        }

        savedId = data.id as string;
      } else {
        const { data, error } = await (supabase as any)
          .from("emergency_contacts")
          .insert({
            ...payload,
            created_by: user?.id ?? null,
          })
          .select("id")
          .single();

        if (error) {
          throw new Error(error.message ?? "Failed to add contact");
        }

        savedId = data.id as string;
      }

      const remainingIds = contacts
        .filter((contact) => contact.id !== savedId)
        .map((contact) => contact.id);

      const desiredIndex = Math.min(
        parsed.priority - 1,
        remainingIds.length,
      );

      remainingIds.splice(desiredIndex, 0, savedId);

      for (let index = 0; index < remainingIds.length; index += 1) {
        const { error } = await (supabase as any)
          .from("emergency_contacts")
          .update({ priority: index + 1 })
          .eq("id", remainingIds[index])
          .eq("parent_id", activeParentId);

        if (error) {
          throw new Error(
            error.message ?? "Failed to update the contact order",
          );
        }
      }

      return { edited: Boolean(input.id) };
    },
    onSuccess: async ({ edited }) => {
      await refreshContactQueries();
      setOpen(false);
      setEditing(null);

      toast.success(
        edited
          ? "Emergency contact updated."
          : "Emergency contact added.",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save contact");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (contact: Contact) => {
      if (!activeParentId) {
        throw new Error("No care-recipient account is selected.");
      }

      const { data, error } = await (supabase as any)
        .from("emergency_contacts")
        .delete()
        .eq("id", contact.id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new Error(error.message ?? "Failed to delete contact");
      }

      if (!data) {
        throw new Error(
          "The contact was not deleted. It may have already been removed.",
        );
      }

      return contact;
    },
    onSuccess: async (contact) => {
      queryClient.setQueryData<Contact[]>(
        ["emergency_contacts", activeParentId],
        (current = []) =>
          current.filter((item) => item.id !== contact.id),
      );

      await refreshContactQueries();
      setDeleting(null);

      toast.success(
        `${contact.name} was removed from emergency contacts.`,
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete contact");
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (contact: Contact) => {
      if (!activeParentId) {
        throw new Error("No care-recipient account is selected.");
      }

      const ordered = [
        contact,
        ...contacts.filter((item) => item.id !== contact.id),
      ];

      for (let index = 0; index < ordered.length; index += 1) {
        const { data, error } = await (supabase as any)
          .from("emergency_contacts")
          .update({ priority: index + 1 })
          .eq("id", ordered[index].id)
          .eq("parent_id", activeParentId)
          .select("id")
          .maybeSingle();

        if (error) {
          throw new Error(
            error.message ?? "Failed to update the primary contact",
          );
        }

        if (!data) {
          throw new Error("A contact could not be reordered.");
        }
      }

      return contact;
    },
    onSuccess: async (contact) => {
      await refreshContactQueries();

      toast.success(
        `${contact.name} is now the primary emergency contact.`,
      );
    },
    onError: (error: Error) => {
      toast.error(
        error.message || "Failed to change primary contact",
      );
    },
  });

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return contacts;
    }

    return contacts.filter((contact) =>
      [
        contact.name,
        contact.relationship,
        contact.phone,
        contact.email,
        contact.notes,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [contacts, search]);

  const callableCount = contacts.filter(
    (contact) => contact.phone && isValidPhone(contact.phone),
  ).length;

  const emailCount = contacts.filter((contact) =>
    Boolean(contact.email),
  ).length;

  const primaryContact = contacts[0] ?? null;
  const hasReliablePrimaryPhone = Boolean(
    primaryContact?.phone && isValidPhone(primaryContact.phone),
  );

  return (
    <AppShell>
      <div className="space-y-6 pb-10">
        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)]">
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-7">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#e8f3ef] px-3 py-1.5 text-xs font-bold text-[#176f69]">
                <ShieldCheck className="size-3.5" />
                Emergency readiness
              </div>

              <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#122f35] sm:text-4xl">
                Emergency contacts
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[#667d82] sm:text-base">
                Manage the trusted people who should be contacted
                during an emergency for{" "}
                <span className="font-semibold text-[#294b50]">
                  {activeParent?.full_name ?? "the selected profile"}
                </span>
                .
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-[#d7e3df] bg-white px-4 font-semibold text-[#49666b] hover:bg-[#f3f8f6]"
                disabled={contactsQuery.isFetching}
                onClick={() => void refreshContactQueries()}
              >
                <RefreshCw
                  className={`size-4 ${contactsQuery.isFetching ? "animate-spin" : ""
                    }`}
                />
                Refresh
              </Button>

              <Dialog
                open={open}
                onOpenChange={(nextOpen) => {
                  setOpen(nextOpen);

                  if (!nextOpen) {
                    setEditing(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    disabled={!activeParentId || contacts.length >= 10}
                    className="h-11 rounded-xl bg-[#0d6665] px-5 font-semibold text-white shadow-[0_14px_30px_-18px_rgba(13,102,101,0.9)] hover:bg-[#0a5958]"
                    onClick={() => setEditing(null)}
                  >
                    <Plus className="size-4" />
                    Add contact
                  </Button>
                </DialogTrigger>

                <ContactDialog
                  key={
                    editing?.id ??
                    `new-${open ? "open" : "closed"}`
                  }
                  initial={editing}
                  defaultPriority={
                    editing?.priority ??
                    Math.min(contacts.length + 1, 10)
                  }
                  onSave={(value) =>
                    saveMutation.mutate({
                      ...value,
                      id: editing?.id,
                    })
                  }
                  saving={saveMutation.isPending}
                />
              </Dialog>
            </div>
          </div>

          <div className="grid border-t border-[#e2ece9] bg-[#f7faf9] sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric
              icon={UsersRound}
              label="Total contacts"
              value={String(contacts.length)}
              detail={`${Math.max(10 - contacts.length, 0)} slots available`}
              iconBackground="bg-[#e5f2ed]"
              iconClass="text-[#19705f]"
            />

            <SummaryMetric
              icon={PhoneCall}
              label="Callable"
              value={String(callableCount)}
              detail="Available for direct SOS calls"
              iconBackground="bg-[#e9eff5]"
              iconClass="text-[#506f8e]"
            />

            <SummaryMetric
              icon={Mail}
              label="Email enabled"
              value={String(emailCount)}
              detail="Can receive email alerts"
              iconBackground="bg-[#f5eadf]"
              iconClass="text-[#98643a]"
            />

            <SummaryMetric
              icon={Crown}
              label="Primary contact"
              value={primaryContact?.name ?? "Not set"}
              detail={
                primaryContact
                  ? `Call order 1${primaryContact.relationship
                    ? ` · ${primaryContact.relationship}`
                    : ""
                  }`
                  : "Add a trusted contact"
              }
              iconBackground={
                hasReliablePrimaryPhone
                  ? "bg-[#e5f2ed]"
                  : "bg-[#f8e8e6]"
              }
              iconClass={
                hasReliablePrimaryPhone
                  ? "text-[#19705f]"
                  : "text-[#a44e49]"
              }
              last
            />
          </div>
        </section>

        {(contacts.length >= 10 ||
          (primaryContact && !primaryContact.phone)) && (
            <div className="space-y-3">
              {contacts.length >= 10 && (
                <StatusNotice
                  icon={AlertTriangle}
                  title="Contact limit reached"
                  description="The maximum of 10 emergency contacts has been reached. Remove an old contact before adding another."
                  tone="warning"
                />
              )}

              {primaryContact && !primaryContact.phone && (
                <StatusNotice
                  icon={AlertTriangle}
                  title="Primary contact cannot receive direct calls"
                  description={`${primaryContact.name} has no phone number. Email alerts can still work, but automatic SOS calling cannot dial this contact.`}
                  tone="warning"
                />
              )}
            </div>
          )}

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.5rem] border border-[#dce8e4] bg-[#0c3f45] p-6 text-white shadow-[0_18px_45px_-35px_rgba(16,49,54,0.7)] sm:p-7">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-[#b7ded4]">
                <BellRing className="size-5" />
              </span>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9bc8bd]">
                  Escalation order
                </p>

                <h2 className="mt-2 text-xl font-bold tracking-[-0.025em]">
                  Contacts are notified by priority
                </h2>

                <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
                  The primary contact is first in the escalation
                  sequence. Keep phone numbers current and place the
                  most reliable person at the top of the list.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ["1", "Primary", "First person contacted"],
                ["2", "Backup", "Used if help is still needed"],
                ["3+", "Extended circle", "Additional trusted support"],
              ].map(([number, title, detail]) => (
                <div
                  key={title}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <p className="text-lg font-bold text-[#acd7cc]">
                    {number}
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">
                    {title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/55">
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#dce8e4] bg-white p-6 shadow-[0_18px_45px_-38px_rgba(16,49,54,0.45)] sm:p-7">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e6f2ee] text-[#176f69]">
                <CheckCircle2 className="size-5" />
              </span>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#74898d]">
                  Readiness check
                </p>

                <h2 className="mt-2 text-xl font-bold tracking-[-0.025em] text-[#17343a]">
                  Emergency contact coverage
                </h2>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <ReadinessRow
                label="At least one contact added"
                ready={contacts.length > 0}
              />

              <ReadinessRow
                label="Primary contact has a phone number"
                ready={hasReliablePrimaryPhone}
              />

              <ReadinessRow
                label="Email backup is available"
                ready={emailCount > 0}
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
          <div className="flex flex-col gap-4 border-b border-[#e3ece9] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                Contact directory
              </h2>

              <p className="mt-1 text-sm text-[#72868a]">
                Review contact details, call order and available
                emergency actions.
              </p>
            </div>

            {contacts.length > 2 && (
              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#789094]" />

                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search contacts"
                  className="h-11 rounded-xl border-[#d8e4e0] bg-[#fbfdfc] pl-10"
                />
              </div>
            )}
          </div>

          {contactsQuery.isLoading ? (
            <ContactsLoadingState />
          ) : contactsQuery.isError ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-[#f8e6e4] text-[#a64c47]">
                <AlertTriangle className="size-6" />
              </span>

              <h3 className="mt-5 text-lg font-bold text-[#1f3d43]">
                Emergency contacts could not be loaded
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-[#71868a]">
                {contactsQuery.error instanceof Error
                  ? contactsQuery.error.message
                  : "Please try again."}
              </p>

              <Button
                type="button"
                variant="outline"
                className="mt-6 h-11 rounded-xl border-[#d6e2de] bg-white px-5"
                onClick={() => void contactsQuery.refetch()}
              >
                <RefreshCw className="size-4" />
                Try again
              </Button>
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-[#e6f2ee] text-[#176f69]">
                <ContactRound className="size-6" />
              </span>

              <h3 className="mt-5 text-lg font-bold text-[#1c3b41]">
                No emergency contacts yet
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-[#71868a]">
                Add at least one trusted person with a valid phone
                number or email address so emergency actions have
                someone to reach.
              </p>

              <Button
                type="button"
                disabled={!activeParentId}
                className="mt-6 h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="size-4" />
                Add the first contact
              </Button>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-[#edf3f1] text-[#647d81]">
                <Search className="size-6" />
              </span>

              <h3 className="mt-5 text-lg font-bold text-[#1c3b41]">
                No matching contacts
              </h3>

              <p className="mt-2 text-sm text-[#71868a]">
                No emergency contacts match “{search}”.
              </p>

              <Button
                type="button"
                variant="outline"
                className="mt-5 rounded-xl"
                onClick={() => setSearch("")}
              >
                Clear search
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
              {filteredContacts.map((contact) => {
                const actualIndex = contacts.findIndex(
                  (item) => item.id === contact.id,
                );
                const isPrimary = actualIndex === 0;

                return (
                  <article
                    key={contact.id}
                    className={`rounded-2xl border bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_42px_-34px_rgba(18,49,54,0.4)] ${isPrimary
                        ? "border-[#9fc9be] shadow-[0_16px_36px_-32px_rgba(13,102,101,0.55)]"
                        : "border-[#dce7e3]"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <div
                          className={`grid size-12 shrink-0 place-items-center rounded-2xl ${isPrimary
                              ? "bg-[#0d6665] text-white"
                              : "bg-[#e8f2ef] text-[#176f69]"
                            }`}
                        >
                          <UserRound className="size-5" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-bold text-[#1c3b41]">
                              {contact.name}
                            </h3>

                            {isPrimary && (
                              <Badge className="gap-1 border-0 bg-[#e3f1ec] text-[#176f69] hover:bg-[#e3f1ec]">
                                <Star className="size-3 fill-current" />
                                Primary
                              </Badge>
                            )}
                          </div>

                          <p className="mt-1 truncate text-xs font-medium text-[#768a8e]">
                            {contact.relationship ||
                              "Emergency contact"}{" "}
                            · Call order {actualIndex + 1}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {!isPrimary && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-9 rounded-xl text-[#7a8f93] hover:bg-[#eef5f2] hover:text-[#0d7774]"
                            title="Make primary contact"
                            aria-label={`Make ${contact.name} the primary contact`}
                            disabled={setPrimaryMutation.isPending}
                            onClick={() =>
                              setPrimaryMutation.mutate(contact)
                            }
                          >
                            <Star className="size-4" />
                          </Button>
                        )}

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-9 rounded-xl text-[#71878b] hover:bg-[#eef5f2] hover:text-[#0d7774]"
                          title="Edit contact"
                          aria-label={`Edit ${contact.name}`}
                          onClick={() => {
                            setEditing(contact);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-9 rounded-xl text-[#a45a54] hover:bg-[#fff1ef] hover:text-[#933f3b]"
                          title="Delete contact"
                          aria-label={`Delete ${contact.name}`}
                          onClick={() => setDeleting(contact)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <ContactDetail
                        icon={Phone}
                        label="Phone"
                        value={contact.phone ?? "Not provided"}
                        href={
                          contact.phone
                            ? `tel:${normalizePhone(contact.phone)}`
                            : undefined
                        }
                        available={Boolean(contact.phone)}
                      />

                      <ContactDetail
                        icon={Mail}
                        label="Email"
                        value={contact.email ?? "Not provided"}
                        href={
                          contact.email
                            ? `mailto:${contact.email}`
                            : undefined
                        }
                        available={Boolean(contact.email)}
                      />
                    </div>

                    {contact.notes && (
                      <div className="mt-4 rounded-xl border border-[#e5ecea] bg-[#f8fbfa] px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#7a8f93]">
                          Notes
                        </p>

                        <p className="mt-1.5 text-sm leading-6 text-[#5d7478]">
                          {contact.notes}
                        </p>
                      </div>
                    )}

                    <div className="mt-5 border-t border-[#e5ecea] pt-5">
                      <p className="mb-3 text-xs font-bold uppercase tracking-[0.11em] text-[#7a8f93]">
                        Emergency actions
                      </p>

                      <EmergencyCallButtons
                        emergencySubjectName={
                          activeParent?.full_name ??
                          "The care recipient"
                        }
                        emergencyContacts={[
                          {
                            id: contact.id,
                            name: contact.name,
                            phone: contact.phone,
                            email: contact.email,
                            relation: contact.relationship,
                          },
                        ]}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <StatusNotice
          icon={ShieldCheck}
          title="Keep emergency information current"
          description="Review this directory regularly. Confirm that phone numbers, email addresses and the call order still match the people who can respond quickly."
          tone="information"
        />

        <AlertDialog
          open={Boolean(deleting)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setDeleting(null);
            }
          }}
        >
          <AlertDialogContent className="rounded-[1.5rem] border-[#dce7e3]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold tracking-[-0.025em] text-[#17343a]">
                Delete emergency contact?
              </AlertDialogTitle>

              <AlertDialogDescription className="leading-6 text-[#6d8287]">
                {deleting
                  ? `${deleting.name} will no longer receive emergency calls, messages or escalation alerts.`
                  : "This contact will be removed."}

                {deleting && contacts[0]?.id === deleting.id
                  ? " The next person in the call order will automatically become the primary contact."
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel
                className="h-11 rounded-xl"
                disabled={deleteMutation.isPending}
              >
                Keep contact
              </AlertDialogCancel>

              <AlertDialogAction
                disabled={!deleting || deleteMutation.isPending}
                className="h-11 rounded-xl bg-[#a74742] text-white hover:bg-[#913c38]"
                onClick={() => {
                  if (deleting) {
                    deleteMutation.mutate(deleting);
                  }
                }}
              >
                {deleteMutation.isPending
                  ? "Deleting…"
                  : "Delete contact"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppShell>
  );
}

type SummaryMetricProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  iconBackground: string;
  iconClass: string;
  last?: boolean;
};

function SummaryMetric({
  icon: Icon,
  label,
  value,
  detail,
  iconBackground,
  iconClass,
  last = false,
}: SummaryMetricProps) {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-5 sm:px-6 ${last
          ? ""
          : "border-b border-[#e2ebe8] sm:border-r xl:border-b-0"
        }`}
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl ${iconBackground} ${iconClass}`}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0">
        <p className="truncate text-xs font-bold uppercase tracking-[0.11em] text-[#7b8f93]">
          {label}
        </p>

        <p className="mt-1 truncate text-xl font-bold tracking-[-0.035em] text-[#17343a]">
          {value}
        </p>

        <p className="mt-0.5 truncate text-xs text-[#768a8e]">
          {detail}
        </p>
      </div>
    </div>
  );
}

function ReadinessRow({
  label,
  ready,
}: {
  label: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#e3ebe8] bg-[#f8fbfa] px-4 py-3">
      <span className="text-sm font-semibold text-[#4f696e]">
        {label}
      </span>

      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${ready
            ? "bg-[#e2f1eb] text-[#176f5d]"
            : "bg-[#f7e8e5] text-[#a64c47]"
          }`}
      >
        {ready ? (
          <CheckCircle2 className="size-3.5" />
        ) : (
          <AlertTriangle className="size-3.5" />
        )}
        {ready ? "Ready" : "Action needed"}
      </span>
    </div>
  );
}

function ContactDetail({
  icon: Icon,
  label,
  value,
  href,
  available,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
  available: boolean;
}) {
  const content = (
    <>
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl ${available
            ? "bg-[#e9f2ef] text-[#176f69]"
            : "bg-[#f0f3f2] text-[#8b9a9d]"
          }`}
      >
        <Icon className="size-4" />
      </span>

      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-[#839498]">
          {label}
        </span>

        <span
          className={`mt-0.5 block truncate text-sm font-semibold ${available ? "text-[#35565c]" : "text-[#87979a]"
            }`}
        >
          {value}
        </span>
      </span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e3ebe8] bg-[#fbfdfc] p-3 transition hover:border-[#bdd3cc] hover:bg-[#f2f8f5]"
      >
        {content}
      </a>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e8eeec] bg-[#fbfdfc] p-3">
      {content}
    </div>
  );
}

function StatusNotice({
  icon: Icon,
  title,
  description,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tone: "warning" | "information";
}) {
  const toneClasses =
    tone === "warning"
      ? {
        container: "border-[#ead4c5] bg-[#fbf6f0]",
        icon: "bg-[#f3e3d5] text-[#9b6339]",
        title: "text-[#4c4138]",
        description: "text-[#766d65]",
      }
      : {
        container: "border-[#d7e6e1] bg-[#f4f9f7]",
        icon: "bg-[#e2f0eb] text-[#176f69]",
        title: "text-[#24474d]",
        description: "text-[#687e82]",
      };

  return (
    <div
      className={`flex items-start gap-4 rounded-2xl border p-5 ${toneClasses.container}`}
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClasses.icon}`}
      >
        <Icon className="size-4.5" />
      </span>

      <div>
        <h3 className={`text-sm font-bold ${toneClasses.title}`}>
          {title}
        </h3>

        <p
          className={`mt-1 text-sm leading-6 ${toneClasses.description}`}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

function ContactsLoadingState() {
  return (
    <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-2xl border border-[#e1e9e6] bg-white p-5"
        >
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-[#e9efed]" />

            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 rounded bg-[#e7eeeb]" />
              <div className="h-3 w-24 rounded bg-[#f0f4f3]" />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="h-16 rounded-xl bg-[#f0f4f3]" />
            <div className="h-16 rounded-xl bg-[#f0f4f3]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactDialog({
  initial,
  defaultPriority,
  onSave,
  saving,
}: {
  initial: Contact | null;
  defaultPriority: number;
  onSave: (value: ContactInput) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ContactInput>({
    name: initial?.name ?? "",
    relationship: initial?.relationship ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    priority: initial?.priority ?? defaultPriority,
    notes: initial?.notes ?? "",
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = contactSchema.safeParse(form);

    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ??
        "Please check the contact details.",
      );
      return;
    }

    onSave(parsed.data);
  }

  return (
    <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[1.5rem] border-[#dce7e3] p-0 sm:max-w-xl">
      <DialogHeader className="border-b border-[#e3ece9] px-6 py-5 text-left">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e6f2ee] text-[#176f69]">
            <ContactRound className="size-5" />
          </span>

          <div>
            <DialogTitle className="text-xl font-bold tracking-[-0.03em] text-[#17343a]">
              {initial
                ? "Edit emergency contact"
                : "Add emergency contact"}
            </DialogTitle>

            <DialogDescription className="mt-1.5 leading-6 text-[#71858a]">
              Add a trusted person and define where they should
              appear in the emergency escalation order.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <form
        onSubmit={submit}
        className="space-y-5 px-6 pb-6 pt-5"
      >
        <div className="space-y-2">
          <Label
            htmlFor="contact-name"
            className="font-semibold text-[#29484e]"
          >
            Full name <span className="text-[#a74742]">*</span>
          </Label>

          <Input
            id="contact-name"
            autoFocus
            required
            maxLength={100}
            placeholder="Enter the contact's name"
            className="h-11 rounded-xl border-[#d8e4e0] bg-white"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label
              htmlFor="contact-relationship"
              className="font-semibold text-[#29484e]"
            >
              Relationship
            </Label>

            <Input
              id="contact-relationship"
              maxLength={80}
              placeholder="e.g. Daughter"
              className="h-11 rounded-xl border-[#d8e4e0] bg-white"
              value={form.relationship}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  relationship: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="contact-priority"
              className="font-semibold text-[#29484e]"
            >
              Call order
            </Label>

            <Input
              id="contact-priority"
              type="number"
              min={1}
              max={10}
              required
              className="h-11 rounded-xl border-[#d8e4e0] bg-white"
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  priority: Math.min(
                    10,
                    Math.max(
                      1,
                      Number(event.target.value) || 1,
                    ),
                  ),
                }))
              }
            />

            <p className="text-[11px] leading-4 text-[#809195]">
              Number 1 is contacted first during escalation.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="contact-phone"
            className="font-semibold text-[#29484e]"
          >
            Phone number
          </Label>

          <Input
            id="contact-phone"
            type="tel"
            inputMode="tel"
            maxLength={40}
            placeholder="+91 98765 43210"
            className="h-11 rounded-xl border-[#d8e4e0] bg-white"
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                phone: event.target.value,
              }))
            }
          />

          <p className="text-[11px] leading-4 text-[#809195]">
            Include the country code for reliable calls, SMS and
            WhatsApp messaging.
          </p>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="contact-email"
            className="font-semibold text-[#29484e]"
          >
            Email address
          </Label>

          <Input
            id="contact-email"
            type="email"
            maxLength={255}
            placeholder="name@example.com"
            className="h-11 rounded-xl border-[#d8e4e0] bg-white"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
          />

          <p className="text-[11px] leading-4 text-[#809195]">
            At least a phone number or email address is required.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <Label
              htmlFor="contact-notes"
              className="font-semibold text-[#29484e]"
            >
              Notes
            </Label>

            <span className="text-[11px] text-[#809195]">
              {form.notes?.length ?? 0}/500
            </span>
          </div>

          <Textarea
            id="contact-notes"
            rows={4}
            maxLength={500}
            placeholder="Availability, preferred language or useful emergency context"
            className="min-h-24 rounded-xl border-[#d8e4e0] bg-white"
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
          />
        </div>

        <div className="rounded-xl border border-[#dfe9e6] bg-[#f7faf9] px-4 py-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#176f69]" />

            <p className="text-xs leading-5 text-[#687e82]">
              Contact details are used for emergency communication
              and escalation workflows. Confirm that the person has
              agreed to be contacted.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-[#e5ecea] pt-5">
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              className="h-11 rounded-xl border-[#d6e2de] bg-white"
            >
              Cancel
            </Button>
          </DialogClose>

          <Button
            type="submit"
            disabled={saving}
            className="h-11 rounded-xl bg-[#0d6665] px-6 text-white hover:bg-[#0a5958]"
          >
            {saving
              ? "Saving…"
              : initial
                ? "Save changes"
                : "Add contact"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}