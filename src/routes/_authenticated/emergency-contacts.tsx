import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  AlertTriangle,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
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

export const Route = createFileRoute("/_authenticated/emergency-contacts")({
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
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
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
  const qc = useQueryClient();

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

      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  const contacts = contactsQuery.data ?? [];

  useEffect(() => {
    if (!activeParentId) return;

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
          void qc.invalidateQueries({ queryKey: ["emergency_contacts", activeParentId] });
          void qc.invalidateQueries({ queryKey: ["global_emergency_contacts", activeParentId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeParentId, qc]);

  const refreshContactQueries = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["emergency_contacts", activeParentId] }),
      qc.invalidateQueries({ queryKey: ["global_emergency_contacts", activeParentId] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (input: ContactInput & { id?: string }) => {
      if (!activeParentId) throw new Error("No care-recipient account is selected.");

      const parsed = contactSchema.parse(input);
      const normalizedPhone = parsed.phone ? normalizePhone(parsed.phone) : null;
      const normalizedEmail = parsed.email ? parsed.email.trim().toLowerCase() : null;

      const duplicate = contacts.find((contact) => {
        if (contact.id === input.id) return false;
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
        throw new Error(`This phone number or email is already used by ${duplicate.name}.`);
      }

      if (!input.id && contacts.length >= 10) {
        throw new Error("You can add a maximum of 10 emergency contacts.");
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

        if (error) throw new Error(error.message ?? "Failed to update contact");
        if (!data)
          throw new Error("The contact was not updated. It may have already been removed.");
        savedId = data.id as string;
      } else {
        const { data, error } = await (supabase as any)
          .from("emergency_contacts")
          .insert({ ...payload, created_by: user?.id ?? null })
          .select("id")
          .single();

        if (error) throw new Error(error.message ?? "Failed to add contact");
        savedId = data.id as string;
      }

      // Keep priorities deterministic and gap-free. The selected priority is
      // treated as the desired position in the SOS escalation order.
      const remainingIds = contacts
        .filter((contact) => contact.id !== savedId)
        .map((contact) => contact.id);
      const desiredIndex = Math.min(parsed.priority - 1, remainingIds.length);
      remainingIds.splice(desiredIndex, 0, savedId);

      for (let index = 0; index < remainingIds.length; index += 1) {
        const { error } = await (supabase as any)
          .from("emergency_contacts")
          .update({ priority: index + 1 })
          .eq("id", remainingIds[index])
          .eq("parent_id", activeParentId);

        if (error) throw new Error(error.message ?? "Failed to update the contact order");
      }

      return { edited: Boolean(input.id) };
    },
    onSuccess: async ({ edited }) => {
      await refreshContactQueries();
      setOpen(false);
      setEditing(null);
      toast.success(edited ? "Emergency contact updated." : "Emergency contact added.");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save contact"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (contact: Contact) => {
      if (!activeParentId) throw new Error("No care-recipient account is selected.");

      const { data, error } = await (supabase as any)
        .from("emergency_contacts")
        .delete()
        .eq("id", contact.id)
        .eq("parent_id", activeParentId)
        .select("id")
        .maybeSingle();

      if (error) throw new Error(error.message ?? "Failed to delete contact");
      if (!data) throw new Error("The contact was not deleted. It may have already been removed.");

      return contact;
    },
    onSuccess: async (contact) => {
      qc.setQueryData<Contact[]>(["emergency_contacts", activeParentId], (current = []) =>
        current.filter((item) => item.id !== contact.id),
      );
      await refreshContactQueries();
      setDeleting(null);
      toast.success(`${contact.name} was removed from emergency contacts.`);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete contact"),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (contact: Contact) => {
      if (!activeParentId) throw new Error("No care-recipient account is selected.");

      const ordered = [contact, ...contacts.filter((item) => item.id !== contact.id)];

      for (let index = 0; index < ordered.length; index += 1) {
        const { data, error } = await (supabase as any)
          .from("emergency_contacts")
          .update({ priority: index + 1 })
          .eq("id", ordered[index].id)
          .eq("parent_id", activeParentId)
          .select("id")
          .maybeSingle();

        if (error) throw new Error(error.message ?? "Failed to update the primary contact");
        if (!data) throw new Error("A contact could not be reordered.");
      }

      return contact;
    },
    onSuccess: async (contact) => {
      await refreshContactQueries();
      toast.success(`${contact.name} is now the primary emergency contact.`);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to change primary contact"),
  });

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;

    return contacts.filter((contact) =>
      [contact.name, contact.relationship, contact.phone, contact.email, contact.notes]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [contacts, search]);

  const callableCount = contacts.filter(
    (contact) => contact.phone && isValidPhone(contact.phone),
  ).length;
  const emailCount = contacts.filter((contact) => Boolean(contact.email)).length;
  const primaryContact = contacts[0] ?? null;

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold italic">Emergency Contacts</h1>
          <p className="mt-1 text-muted-foreground">
            Manage the people contacted during an emergency for {activeParent?.full_name ?? "—"}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Refresh emergency contacts"
            title="Refresh contacts"
            disabled={contactsQuery.isFetching}
            onClick={() => void refreshContactQueries()}
          >
            <RefreshCw className={`size-4 ${contactsQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>

          <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
              setOpen(nextOpen);
              if (!nextOpen) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button
                type="button"
                disabled={!activeParentId || contacts.length >= 10}
                onClick={() => setEditing(null)}
              >
                <Plus className="mr-2 size-4" />
                Add contact
              </Button>
            </DialogTrigger>

            <ContactDialog
              key={editing?.id ?? `new-${open ? "open" : "closed"}`}
              initial={editing}
              defaultPriority={editing?.priority ?? Math.min(contacts.length + 1, 10)}
              onSave={(value) => saveMutation.mutate({ ...value, id: editing?.id })}
              saving={saveMutation.isPending}
            />
          </Dialog>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total contacts
          </p>
          <p className="mt-1 text-2xl font-bold">{contacts.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Callable
          </p>
          <p className="mt-1 text-2xl font-bold">{callableCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Email alerts
          </p>
          <p className="mt-1 text-2xl font-bold">{emailCount}</p>
        </div>
      </div>

      {contacts.length >= 10 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          The maximum of 10 emergency contacts has been reached. Remove an old contact before adding
          another.
        </div>
      )}

      {primaryContact && !primaryContact.phone && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            The primary contact, <strong>{primaryContact.name}</strong>, has no phone number. Email
            alerts can still work, but automatic SOS calling cannot dial this contact.
          </span>
        </div>
      )}

      {contacts.length > 2 && (
        <div className="relative mb-5 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, relationship, phone, email…"
            className="pl-9"
          />
        </div>
      )}

      {contactsQuery.isLoading ? (
        <div className="rounded-3xl border border-border bg-card p-12 text-center text-muted-foreground">
          Loading emergency contacts…
        </div>
      ) : contactsQuery.isError ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 size-6 text-destructive" />
          <p className="font-medium">Emergency contacts could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {contactsQuery.error instanceof Error
              ? contactsQuery.error.message
              : "Please try again."}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void contactsQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-12 text-center">
          <ShieldCheck className="mx-auto mb-4 size-10 text-primary/70" />
          <p className="font-semibold">No emergency contacts yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add at least one trusted person with a valid phone number or email address so SOS
            actions have someone to reach.
          </p>
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center text-muted-foreground">
          No emergency contacts match “{search}”.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredContacts.map((contact) => {
            const actualIndex = contacts.findIndex((item) => item.id === contact.id);
            const isPrimary = actualIndex === 0;

            return (
              <article
                key={contact.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <UserRound className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold">{contact.name}</p>
                        {isPrimary && (
                          <Badge className="gap-1 bg-red-600 hover:bg-red-600">
                            <Star className="size-3 fill-current" /> Primary
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {contact.relationship || "Emergency contact"} · Call order {actualIndex + 1}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!isPrimary && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Make primary contact"
                        aria-label={`Make ${contact.name} the primary contact`}
                        disabled={setPrimaryMutation.isPending}
                        onClick={() => setPrimaryMutation.mutate(contact)}
                      >
                        <Star className="size-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
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
                      title="Delete contact"
                      aria-label={`Delete ${contact.name}`}
                      onClick={() => setDeleting(contact)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  {contact.phone && (
                    <a
                      href={`tel:${normalizePhone(contact.phone)}`}
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="size-4" />
                      <span className="truncate">{contact.phone}</span>
                    </a>
                  )}
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="size-4" />
                      <span className="truncate">{contact.email}</span>
                    </a>
                  )}
                  {contact.notes && (
                    <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      {contact.notes}
                    </p>
                  )}
                </div>

                <div className="mt-4">
                  <EmergencyCallButtons
                    emergencySubjectName={activeParent?.full_name ?? "The care recipient"}
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

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(nextOpen) => !nextOpen && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete emergency contact?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${deleting.name} will no longer receive emergency calls, messages, or escalation alerts.`
                : "This contact will be removed."}
              {deleting && contacts[0]?.id === deleting.id
                ? " The next person in the call order will automatically become the primary contact."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Keep contact</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleting || deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteMutation.mutate(deleting)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete contact"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
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
      toast.error(parsed.error.issues[0]?.message ?? "Please check the contact details.");
      return;
    }

    onSave(parsed.data);
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit emergency contact" : "Add emergency contact"}</DialogTitle>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="contact-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="contact-name"
            autoFocus
            required
            maxLength={100}
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-relationship">Relationship</Label>
            <Input
              id="contact-relationship"
              maxLength={80}
              placeholder="e.g. Daughter"
              value={form.relationship}
              onChange={(event) =>
                setForm((current) => ({ ...current, relationship: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="contact-priority">Call order</Label>
            <Input
              id="contact-priority"
              type="number"
              min={1}
              max={10}
              required
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  priority: Math.min(10, Math.max(1, Number(event.target.value) || 1)),
                }))
              }
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              1 is contacted first during SOS escalation.
            </p>
          </div>
        </div>

        <div>
          <Label htmlFor="contact-phone">
            Phone <span className="text-xs text-muted-foreground">(calls, SMS and WhatsApp)</span>
          </Label>
          <Input
            id="contact-phone"
            type="tel"
            inputMode="tel"
            maxLength={40}
            placeholder="+91 98765 43210"
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Include the country code for reliable WhatsApp messaging.
          </p>
        </div>

        <div>
          <Label htmlFor="contact-email">
            Email <span className="text-xs text-muted-foreground">(SOS email alerts)</span>
          </Label>
          <Input
            id="contact-email"
            type="email"
            maxLength={255}
            placeholder="name@example.com"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            At least a phone number or email address is required.
          </p>
        </div>

        <div>
          <Label htmlFor="contact-notes">Notes</Label>
          <Textarea
            id="contact-notes"
            rows={3}
            maxLength={500}
            placeholder="Availability, preferred language, medical context…"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {form.notes?.length ?? 0}/500
          </p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={saving}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : initial ? "Save changes" : "Add contact"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
