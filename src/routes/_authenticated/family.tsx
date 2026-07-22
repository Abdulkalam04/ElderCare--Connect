import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  useCurrentUser,
  useLinkedChildren,
  useLinkedParents,
  useProfile,
} from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
export const Route = createFileRoute("/_authenticated/family")({
  ssr: false,
  component: FamilyPage,
});
type LinkedProfile = {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  linked_at?: string;
};
type RemovalTarget = {
  kind: "parent" | "child";
  id: string;
  name: string;
};
function normalizeInviteCode(value: string) {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
}
function friendlyFamilyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid family link code")) {
    return "That Family Link Code is invalid or has expired.";
  }
  if (normalized.includes("already linked")) {
    return "This account is already linked to that family member.";
  }
  if (normalized.includes("only family member accounts")) {
    return "Only a family-member account can use a Family Link Code.";
  }
  if (normalized.includes("valid phone")) {
    return "Please enter a valid phone number with at least 7 digits.";
  }
  if (normalized.includes("permission") || normalized.includes("row-level security")) {
    return "Supabase permissions blocked this action. Run the Family security migration first.";
  }
  return message || fallback;
}
async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard access is unavailable.");
}
function FamilyPage() {
  const qc = useQueryClient();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useProfile();
  const linkedParentsQuery = useLinkedParents();
  const linkedChildrenQuery = useLinkedChildren(profile?.role === "parent" ? user?.id : undefined);
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [removalTarget, setRemovalTarget] = useState<RemovalTarget | null>(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const isParent = profile?.role === "parent";
  const linkedParents = (linkedParentsQuery.data ?? []) as LinkedProfile[];
  const linkedChildren = (linkedChildrenQuery.data ?? []) as LinkedProfile[];
  const familyQuery = isParent ? linkedChildrenQuery : linkedParentsQuery;
  const familyMembers = isParent ? linkedChildren : linkedParents;
  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return familyMembers;
    return familyMembers.filter((member) =>
      [member.full_name, member.email, member.phone]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [familyMembers, search]);
  useEffect(() => {
    if (!user?.id) return;
    const refreshFamily = () => {
      qc.invalidateQueries({ queryKey: ["linkedParents"] });
      qc.invalidateQueries({ queryKey: ["linkedChildren"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    };
    const channel = supabase
      .channel(`family-page-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parent_child_links",
          filter: `parent_id=eq.${user.id}`,
        },
        refreshFamily,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parent_child_links",
          filter: `child_id=eq.${user.id}`,
        },
        refreshFamily,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
        },
        refreshFamily,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, user?.id]);
  const link = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Your session is not ready. Please refresh the page.");
      const trimmedCode = normalizeInviteCode(code);
      const trimmedPhone = phone.trim();
      if (!/^[A-Z0-9]{8}$/.test(trimmedCode)) {
        throw new Error("Enter the complete 8-character Family Link Code.");
      }
      if (trimmedPhone) {
        const digitCount = trimmedPhone.replace(/\D/g, "").length;
        const validFormat = /^\+?[0-9\s\-()]{7,30}$/.test(trimmedPhone);
        if (!validFormat || digitCount < 7) {
          throw new Error("Please enter a valid phone number with at least 7 digits.");
        }
      }
      const { data, error } = await supabase.rpc("link_parent_by_invite_code", {
        _code: trimmedCode,
        _phone: trimmedPhone || null,
      });
      if (error) throw error;
      if (!data) throw new Error("Unable to create the family connection.");
      return data;
    },
    onSuccess: async () => {
      setCode("");
      toast.success("Family account linked successfully.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["linkedParents"] }),
        qc.invalidateQueries({ queryKey: ["profile"] }),
        qc.invalidateQueries({ queryKey: ["myProfile"] }),
      ]);
    },
    onError: (error) => {
      toast.error(friendlyFamilyError(error, "Unable to link the family account."));
    },
  });
  const unlink = useMutation({
    mutationFn: async (parentId: string) => {
      if (!user) throw new Error("Your session is not ready.");
      const { data, error } = await supabase
        .from("parent_child_links")
        .delete()
        .eq("parent_id", parentId)
        .eq("child_id", user.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("The family connection was already removed or could not be deleted.");
      }
    },
    onSuccess: async () => {
      setRemovalTarget(null);
      toast.success("Family connection removed.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["linkedParents"] }),
        qc.invalidateQueries({ queryKey: ["profile"] }),
      ]);
    },
    onError: (error) => {
      toast.error(friendlyFamilyError(error, "Unable to remove the family connection."));
    },
  });
  const removeChild = useMutation({
    mutationFn: async (childId: string) => {
      if (!user) throw new Error("Your session is not ready.");
      const { data, error } = await supabase
        .from("parent_child_links")
        .delete()
        .eq("parent_id", user.id)
        .eq("child_id", childId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("The family member was already removed or could not be deleted.");
      }
    },
    onSuccess: async () => {
      setRemovalTarget(null);
      toast.success("Family member removed.");
      await qc.invalidateQueries({ queryKey: ["linkedChildren"] });
    },
    onError: (error) => {
      toast.error(friendlyFamilyError(error, "Unable to remove the family member."));
    },
  });
  const regenerate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("regenerate_family_invite_code");
      if (error) throw error;
      if (!data) throw new Error("A new Family Link Code was not generated.");
      return data;
    },
    onSuccess: async (newCode) => {
      setShowRegenerateConfirm(false);
      await qc.invalidateQueries({ queryKey: ["profile"] });
      try {
        await copyText(newCode);
        toast.success("New code generated and copied.");
      } catch {
        toast.success("New Family Link Code generated.");
      }
    },
    onError: (error) => {
      toast.error(friendlyFamilyError(error, "Failed to regenerate the code."));
    },
  });
  async function copyInviteCode() {
    if (!profile?.invite_code) {
      toast.error("No Family Link Code is available.");
      return;
    }
    try {
      await copyText(profile.invite_code);
      toast.success("Family Link Code copied.");
    } catch {
      toast.error("Unable to copy the code. Please select and copy it manually.");
    }
  }
  async function shareInviteCode() {
    if (!profile?.invite_code) {
      toast.error("No Family Link Code is available.");
      return;
    }
    const shareText = `Use Family Link Code ${profile.invite_code} to connect with me in ElderCare Connect.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "ElderCare Family Link", text: shareText });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await copyText(shareText);
      toast.success("Invitation message copied.");
    } catch {
      toast.error("Unable to share the invitation from this browser.");
    }
  }
  function confirmRemoval() {
    if (!removalTarget) return;
    if (removalTarget.kind === "child") {
      removeChild.mutate(removalTarget.id);
    } else {
      unlink.mutate(removalTarget.id);
    }
  }
  const removing = removeChild.isPending || unlink.isPending;
  if (userLoading || profileLoading) {
    return (
      <AppShell>
        <div className="min-h-[55vh] grid place-items-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Loading family connections…
          </div>
        </div>
      </AppShell>
    );
  }
  if (profileError || !profile || !user) {
    return (
      <AppShell>
        <div className="min-h-[55vh] grid place-items-center">
          <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center">
            <Users className="mx-auto mb-4 size-9 text-muted-foreground" />
            <h1 className="font-display text-2xl font-bold italic">Family unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your profile could not be loaded. Check your connection and try again.
            </p>
            <Button className="mt-5" onClick={() => void refetchProfile()}>
              <RefreshCw className="mr-2 size-4" /> Retry
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold italic">Family</h1>
          <p className="mt-1 text-muted-foreground">
            {isParent
              ? "Connect trusted family members to your care account"
              : "Connect to one or more care accounts using their Family Link Code"}
          </p>
        </div>

        <Badge variant="outline" className="w-fit rounded-full px-3 py-1.5">
          <Users className="mr-1.5 size-3.5" />
          {familyMembers.length} connected
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {isParent ? (
          <InviteCodeCard
            inviteCode={profile.invite_code}
            regeneratePending={regenerate.isPending}
            onCopy={() => void copyInviteCode()}
            onShare={() => void shareInviteCode()}
            onRegenerate={() => setShowRegenerateConfirm(true)}
          />
        ) : (
          <section className="rounded-3xl border border-border bg-card p-7 sm:p-8">
            <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Link2 className="size-6" />
            </div>
            <h2 className="font-display text-2xl font-bold italic">Connect care account</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Enter the 8-character code shown on the care recipient&apos;s Family page. You can
              connect to more than one care account.
            </p>

            <form
              className="mt-7 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                link.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="invite-code">Family Link Code</Label>
                <Input
                  id="invite-code"
                  value={code}
                  onChange={(event) => setCode(normalizeInviteCode(event.target.value))}
                  placeholder="A1B2C3D4"
                  className="h-12 font-mono text-lg uppercase tracking-[0.2em]"
                  maxLength={8}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={link.isPending}
                />
                <p className="text-xs text-muted-foreground">{code.length}/8 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="family-phone">Your phone number (optional)</Label>
                <Input
                  id="family-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={profile.phone || "+91 98765 43210"}
                  className="h-11 rounded-xl"
                  disabled={link.isPending}
                />
                <p className="text-xs text-muted-foreground">
                  This updates your profile so the linked care recipient can contact you.
                </p>
              </div>

              <Button
                type="submit"
                disabled={link.isPending || code.length !== 8}
                className="h-11 w-full rounded-xl"
              >
                {link.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Link2 className="mr-2 size-4" />
                )}
                {link.isPending ? "Connecting…" : "Connect account"}
              </Button>
            </form>
          </section>
        )}

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold italic">
                {isParent ? "Connected family members" : "Care accounts you monitor"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Changes made here update across the project automatically.
              </p>
            </div>

            {familyMembers.length > 1 && (
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search family…"
                  className="pl-9"
                />
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card">
            {familyQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading connections…
              </div>
            ) : familyQuery.isError ? (
              <div className="p-10 text-center">
                <p className="text-sm font-medium">Family connections could not be loaded.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Check your internet connection and try again.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => void familyQuery.refetch()}
                >
                  <RefreshCw className="mr-2 size-4" /> Retry
                </Button>
              </div>
            ) : familyMembers.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                <Users className="mx-auto mb-3 size-9 opacity-30" />
                {isParent
                  ? "No family members are connected yet. Share your code to get started."
                  : "No care accounts are connected yet. Enter a Family Link Code to connect."}
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No family member matches “{search}”.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredMembers.map((member) => (
                  <FamilyMemberRow
                    key={member.id}
                    member={member}
                    label={isParent ? "Family member" : "Care recipient"}
                    onRemove={() =>
                      setRemovalTarget({
                        kind: isParent ? "child" : "parent",
                        id: member.id,
                        name: member.full_name || "this family member",
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <AlertDialog
        open={Boolean(removalTarget)}
        onOpenChange={(open) => {
          if (!open && !removing) setRemovalTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove family connection?</AlertDialogTitle>
            <AlertDialogDescription>
              {removalTarget?.kind === "child"
                ? `${removalTarget.name} will no longer be able to view or monitor this care account.`
                : `You will no longer be able to view or monitor ${removalTarget?.name ?? "this care account"}.`}{" "}
              Health records are not deleted, but access is removed immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep connection</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(event) => {
                event.preventDefault();
                confirmRemoval();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing && <Loader2 className="mr-2 size-4 animate-spin" />}
              Remove connection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate a new Family Link Code?</AlertDialogTitle>
            <AlertDialogDescription>
              The current code will stop working for new connections. Existing connected family
              members will remain connected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenerate.isPending}>Keep current code</AlertDialogCancel>
            <AlertDialogAction
              disabled={regenerate.isPending}
              onClick={(event) => {
                event.preventDefault();
                regenerate.mutate();
              }}
            >
              {regenerate.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Generate new code
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
function InviteCodeCard({
  inviteCode,
  regeneratePending,
  onCopy,
  onShare,
  onRegenerate,
}: {
  inviteCode: string | null;
  regeneratePending: boolean;
  onCopy: () => void;
  onShare: () => void;
  onRegenerate: () => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-stone-900 p-7 text-white sm:p-8">
      <div className="absolute -right-12 -top-12 size-44 rounded-full bg-white/5" />
      <div className="absolute -bottom-20 -left-12 size-52 rounded-full bg-primary/10" />

      <div className="relative">
        <div className="mb-7 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            Your Family Link Code
          </span>
          <div className="grid size-10 place-items-center rounded-xl bg-white/10">
            <UserRound className="size-5 text-white/80" />
          </div>
        </div>

        <p className="break-all font-mono text-4xl font-bold tracking-[0.08em] sm:text-5xl">
          {inviteCode ?? "————————"}
        </p>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-white/60">
          Share this private code only with trusted family members. Each account can use it once to
          connect and monitor your care information. Generating a new code does not disconnect
          existing members.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-3">
          <Button
            type="button"
            onClick={onCopy}
            disabled={!inviteCode}
            variant="secondary"
            className="rounded-xl bg-white/10 text-white hover:bg-white/20"
          >
            <Copy className="mr-2 size-4" /> Copy code
          </Button>
          <Button
            type="button"
            onClick={onShare}
            disabled={!inviteCode}
            variant="secondary"
            className="rounded-xl bg-white/10 text-white hover:bg-white/20"
          >
            <Share2 className="mr-2 size-4" /> Share
          </Button>
        </div>

        <Button
          type="button"
          onClick={onRegenerate}
          disabled={regeneratePending}
          variant="ghost"
          className="mt-3 w-full rounded-xl text-white/60 hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className={`mr-2 size-4 ${regeneratePending ? "animate-spin" : ""}`} />
          Generate a new code
        </Button>
      </div>
    </section>
  );
}
function FamilyMemberRow({
  member,
  label,
  onRemove,
}: {
  member: LinkedProfile;
  label: string;
  onRemove: () => void;
}) {
  const avatarUrl = member.avatarUrl || member.avatar_url || undefined;
  const initial = (member.full_name?.trim()?.[0] || "?").toUpperCase();
  const linkedDate = member.linked_at ? new Date(member.linked_at) : null;
  const hasValidLinkedDate = linkedDate && !Number.isNaN(linkedDate.getTime());
  return (
    <div className="flex items-start gap-4 p-5 sm:items-center">
      <Avatar className="size-11 border border-border">
        <AvatarImage src={avatarUrl} alt={member.full_name || label} />
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold">{member.full_name || "Unnamed member"}</p>
          <Badge variant="secondary" className="rounded-full text-[10px]">
            <CheckCircle2 className="mr-1 size-3" /> Connected
          </Badge>
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {member.email && (
            <a
              href={`mailto:${member.email}`}
              className="flex min-w-0 items-center gap-1.5 hover:text-foreground hover:underline"
              title={`Email ${member.full_name || "family member"}`}
            >
              <Mail className="size-3.5 shrink-0" />
              <span className="truncate">{member.email}</span>
            </a>
          )}
          {member.phone && (
            <a
              href={`tel:${member.phone.replace(/[^+\d]/g, "")}`}
              className="flex items-center gap-1.5 hover:text-foreground hover:underline"
              title={`Call ${member.full_name || "family member"}`}
            >
              <Phone className="size-3.5" /> {member.phone}
            </a>
          )}
          {hasValidLinkedDate && <span>Connected {format(linkedDate, "MMM d, yyyy")}</span>}
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        title="Remove family connection"
        aria-label={`Remove ${member.full_name || "family member"}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
