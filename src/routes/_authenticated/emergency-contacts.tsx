import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useActiveParent, useCurrentUser } from "@/hooks/useProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Phone, Mail, Pencil, Trash2, Plus, UserRound } from "lucide-react";
import { EmergencyCallButtons } from "@/components/EmergencyCallButtons";
import { useState } from "react";
import { z } from "zod";

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
};

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  relationship: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  priority: z.number().int().min(1).max(10),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

function cleanPhone(phone: string): string {
  return phone.replace(/[^+\d]/g, "");
}

function EmergencyContactsPage() {
  const { activeParentId, activeParent } = useActiveParent();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["emergency_contacts", activeParentId],
    enabled: !!activeParentId,
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

  const saveMutation = useMutation({
    mutationFn: async (input: z.infer<typeof contactSchema> & { id?: string }) => {
      const parsed = contactSchema.parse(input);
      const payload = {
        parent_id: activeParentId!,
        name: parsed.name,
        relationship: parsed.relationship || null,
        phone: parsed.phone || null,
        email: parsed.email || null,
        priority: parsed.priority,
        notes: parsed.notes || null,
      };
      if (input.id) {
        const { error } = await (supabase as any)
          .from("emergency_contacts")
          .update(payload)
          .eq("id", input.id);
        if (error) throw new Error(error.message ?? "Failed to save");
      } else {
        const { error } = await (supabase as any)
          .from("emergency_contacts")
          .insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw new Error(error.message ?? "Failed to save");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emergency_contacts"] });
      setOpen(false);
      setEditing(null);
      toast.success("Contact saved successfully.");
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to save contact"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("emergency_contacts")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message ?? "Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emergency_contacts"] });
      toast.success("Contact removed.");
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to delete contact"),
  });

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl font-bold italic">Emergency Contacts</h1>
          <p className="text-muted-foreground mt-1">
            People to alert in an emergency for {activeParent?.full_name ?? "—"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}>
              <Plus className="size-4 mr-2" /> Add contact
            </Button>
          </DialogTrigger>
          <ContactDialog
            initial={editing}
            onSave={(v) => saveMutation.mutate({ ...v, id: editing?.id })}
            saving={saveMutation.isPending}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : contacts.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-12 text-center text-muted-foreground">
          No emergency contacts yet. Add the first one so SOS can reach them instantly.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                    <UserRound className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.relationship || "Contact"} · Priority {c.priority}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => {
                    if (confirm(`Remove ${c.name}?`)) deleteMutation.mutate(c.id);
                  }}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <EmergencyCallButtons
                emergencyContacts={[
                  {
                    id: c.id,
                    name: c.name,
                    phone: c.phone,
                    relation: c.relationship,
                  },
                ]}
              />
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function ContactDialog({
  initial,
  onSave,
  saving,
}: {
  initial: Contact | null;
  onSave: (v: z.infer<typeof contactSchema>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    relationship: initial?.relationship ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    priority: initial?.priority ?? 5,
    notes: initial?.notes ?? "",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    onSave(parsed.data);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{initial ? "Edit contact" : "Add emergency contact"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
          <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="relationship">Relationship</Label>
            <Input id="relationship" placeholder="e.g. Daughter" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="priority">Priority (1=highest)</Label>
            <Input id="priority" type="number" min={1} max={10} value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 5 })} />
          </div>
        </div>
        <div>
          <Label htmlFor="phone">Phone <span className="text-xs text-muted-foreground">(for calls &amp; SMS)</span></Label>
          <Input id="phone" type="tel" placeholder="+1 555 000 0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="email">Email <span className="text-xs text-muted-foreground">(for SOS alerts)</span></Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save contact"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
