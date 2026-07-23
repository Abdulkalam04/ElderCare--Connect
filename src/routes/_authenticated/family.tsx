import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import {
  useCurrentUser,
  useLinkedChildren,
  useLinkedParents,
  useProfile,
} from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  if (
    normalized.includes("permission") ||
    normalized.includes("row-level security")
  ) {
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

  if (!copied) {
    throw new Error("Clipboard access is unavailable.");
  }
}

function FamilyPage() {
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useProfile();

  const linkedParentsQuery = useLinkedParents();
  const linkedChildrenQuery = useLinkedChildren(
    profile?.role === "parent" ? user?.id : undefined,
  );

  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [removalTarget, setRemovalTarget] =
    useState<RemovalTarget | null>(null);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const isParent = profile?.role === "parent";
  const linkedParents = (linkedParentsQuery.data ?? []) as LinkedProfile[];
  const linkedChildren = (linkedChildrenQuery.data ?? []) as LinkedProfile[];
  const familyQuery = isParent ? linkedChildrenQuery : linkedParentsQuery;
  const familyMembers = isParent ? linkedChildren : linkedParents;

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return familyMembers;
    }

    return familyMembers.filter((member) =>
      [member.full_name, member.email, member.phone]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [familyMembers, search]);

  const membersWithPhone = useMemo(
    () => familyMembers.filter((member) => Boolean(member.phone)).length,
    [familyMembers],
  );

  const latestConnection = useMemo(() => {
    const validDates = familyMembers
      .map((member) => member.linked_at)
      .filter(Boolean)
      .map((value) => new Date(value!))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((first, second) => second.getTime() - first.getTime());

    return validDates[0] ?? null;
  }, [familyMembers]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const refreshFamily = () => {
      queryClient.invalidateQueries({ queryKey: ["linkedParents"] });
      queryClient.invalidateQueries({ queryKey: ["linkedChildren"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
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
  }, [queryClient, user?.id]);

  const link = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error("Your session is not ready. Please refresh the page.");
      }

      const trimmedCode = normalizeInviteCode(code);
      const trimmedPhone = phone.trim();

      if (!/^[A-Z0-9]{8}$/.test(trimmedCode)) {
        throw new Error("Enter the complete 8-character Family Link Code.");
      }

      if (trimmedPhone) {
        const digitCount = trimmedPhone.replace(/\D/g, "").length;
        const validFormat = /^\+?[0-9\s\-()]{7,30}$/.test(trimmedPhone);

        if (!validFormat || digitCount < 7) {
          throw new Error(
            "Please enter a valid phone number with at least 7 digits.",
          );
        }
      }

      const { data, error } = await supabase.rpc(
        "link_parent_by_invite_code",
        {
          _code: trimmedCode,
          _phone: trimmedPhone || null,
        },
      );

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("Unable to create the family connection.");
      }

      return data;
    },
    onSuccess: async () => {
      setCode("");
      toast.success("Family account linked successfully.");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["linkedParents"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
        queryClient.invalidateQueries({ queryKey: ["myProfile"] }),
      ]);
    },
    onError: (error) => {
      toast.error(
        friendlyFamilyError(error, "Unable to link the family account."),
      );
    },
  });

  const unlink = useMutation({
    mutationFn: async (parentId: string) => {
      if (!user) {
        throw new Error("Your session is not ready.");
      }

      const { data, error } = await supabase
        .from("parent_child_links")
        .delete()
        .eq("parent_id", parentId)
        .eq("child_id", user.id)
        .select("id");

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error(
          "The family connection was already removed or could not be deleted.",
        );
      }
    },
    onSuccess: async () => {
      setRemovalTarget(null);
      toast.success("Family connection removed.");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["linkedParents"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
    },
    onError: (error) => {
      toast.error(
        friendlyFamilyError(error, "Unable to remove the family connection."),
      );
    },
  });

  const removeChild = useMutation({
    mutationFn: async (childId: string) => {
      if (!user) {
        throw new Error("Your session is not ready.");
      }

      const { data, error } = await supabase
        .from("parent_child_links")
        .delete()
        .eq("parent_id", user.id)
        .eq("child_id", childId)
        .select("id");

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error(
          "The family member was already removed or could not be deleted.",
        );
      }
    },
    onSuccess: async () => {
      setRemovalTarget(null);
      toast.success("Family member removed.");
      await queryClient.invalidateQueries({ queryKey: ["linkedChildren"] });
    },
    onError: (error) => {
      toast.error(
        friendlyFamilyError(error, "Unable to remove the family member."),
      );
    },
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc(
        "regenerate_family_invite_code",
      );

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("A new Family Link Code was not generated.");
      }

      return data;
    },
    onSuccess: async (newCode) => {
      setShowRegenerateConfirm(false);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });

      try {
        await copyText(newCode);
        toast.success("New code generated and copied.");
      } catch {
        toast.success("New Family Link Code generated.");
      }
    },
    onError: (error) => {
      toast.error(
        friendlyFamilyError(error, "Failed to regenerate the code."),
      );
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
      toast.error("Unable to copy the code. Please copy it manually.");
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
        await navigator.share({
          title: "ElderCare Family Link",
          text: shareText,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
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
    if (!removalTarget) {
      return;
    }

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
        <div className="grid min-h-[55vh] place-items-center">
          <div className="flex items-center gap-3 rounded-2xl border border-[#dce8e4] bg-white px-5 py-4 text-sm font-medium text-[#647b80] shadow-sm">
            <Loader2 className="size-5 animate-spin text-[#0d7774]" />
            Loading family connections…
          </div>
        </div>
      </AppShell>
    );
  }

  if (profileError || !profile || !user) {
    return (
      <AppShell>
        <div className="grid min-h-[55vh] place-items-center px-4">
          <div className="w-full max-w-md rounded-[1.5rem] border border-[#dce8e4] bg-white p-8 text-center shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)]">
            <span className="mx-auto grid size-13 place-items-center rounded-2xl bg-[#e8f2ef] text-[#176f69]">
              <Users className="size-6" />
            </span>

            <h1 className="mt-5 text-2xl font-bold tracking-[-0.035em] text-[#17343a]">
              Family connections unavailable
            </h1>

            <p className="mt-2 text-sm leading-6 text-[#71868a]">
              Your profile could not be loaded. Check your connection and try
              again.
            </p>

            <Button
              type="button"
              className="mt-6 h-11 rounded-xl bg-[#0d6665] px-5 text-white hover:bg-[#0a5958]"
              onClick={() => void refetchProfile()}
            >
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-10">
        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_20px_55px_-42px_rgba(22,55,60,0.45)]">
          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-7">
            <div className="max-w-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#e8f3ef] px-3 py-1.5 text-xs font-bold text-[#176f69]">
                  <Users className="size-3.5" />
                  Family care network
                </span>

                <span className="rounded-full border border-[#d8e5e1] bg-[#f8fbfa] px-3 py-1.5 text-xs font-semibold text-[#647b80]">
                  {isParent ? "Care recipient account" : "Family member account"}
                </span>
              </div>

              <h1 className="text-3xl font-bold tracking-[-0.04em] text-[#122f35] sm:text-4xl">
                Family
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[#667d82] sm:text-base">
                {isParent
                  ? "Connect trusted family members and control who can monitor your care information."
                  : "Connect to care recipients securely and keep important health updates in one place."}
              </p>
            </div>

            <div className="inline-flex w-fit items-center gap-3 rounded-2xl border border-[#dce8e4] bg-[#f8fbfa] px-4 py-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#e4f1ed] text-[#176f69]">
                <ShieldCheck className="size-5" />
              </span>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.11em] text-[#7a8d91]">
                  Connection status
                </p>
                <p className="mt-0.5 text-sm font-bold text-[#26474c]">
                  Secure and active
                </p>
              </div>
            </div>
          </div>

          <div className="grid border-t border-[#e2ece9] bg-[#f7faf9] sm:grid-cols-2 lg:grid-cols-4">
            <SummaryMetric
              icon={Users}
              label="Connected accounts"
              value={String(familyMembers.length)}
              detail={isParent ? "Trusted family members" : "Care accounts monitored"}
              iconBackground="bg-[#e4f1ed]"
              iconClass="text-[#176f69]"
            />

            <SummaryMetric
              icon={Phone}
              label="Contact coverage"
              value={`${membersWithPhone}/${familyMembers.length}`}
              detail="Members with a phone number"
              iconBackground="bg-[#e9eff5]"
              iconClass="text-[#526f8d]"
            />

            <SummaryMetric
              icon={CalendarClock}
              label="Latest connection"
              value={latestConnection ? format(latestConnection, "MMM d") : "None"}
              detail={
                latestConnection
                  ? format(latestConnection, "yyyy")
                  : "No connection recorded"
              }
              iconBackground="bg-[#f5eadf]"
              iconClass="text-[#98643a]"
            />

            <SummaryMetric
              icon={KeyRound}
              label="Access method"
              value="Private code"
              detail="8-character Family Link Code"
              iconBackground="bg-[#eeeaf4]"
              iconClass="text-[#6d5d86]"
              last
            />
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
          {isParent ? (
            <InviteCodeCard
              inviteCode={profile.invite_code}
              regeneratePending={regenerate.isPending}
              onCopy={() => void copyInviteCode()}
              onShare={() => void shareInviteCode()}
              onRegenerate={() => setShowRegenerateConfirm(true)}
            />
          ) : (
            <ConnectAccountCard
              code={code}
              phone={phone}
              profilePhone={profile.phone}
              pending={link.isPending}
              onCodeChange={setCode}
              onPhoneChange={setPhone}
              onSubmit={() => link.mutate()}
            />
          )}

          <section className="overflow-hidden rounded-[1.75rem] border border-[#dce8e4] bg-white shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)]">
            <div className="flex flex-col gap-4 border-b border-[#e3ece9] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h2 className="text-lg font-bold tracking-[-0.025em] text-[#17343a]">
                  {isParent
                    ? "Connected family members"
                    : "Care accounts you monitor"}
                </h2>

                <p className="mt-1 text-sm text-[#72868a]">
                  Connections update automatically across the application.
                </p>
              </div>

              {familyMembers.length > 1 && (
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#809397]" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search family"
                    className="h-11 rounded-xl border-[#d8e4e0] bg-[#fbfdfc] pl-10"
                  />
                </div>
              )}
            </div>

            {familyQuery.isLoading ? (
              <MembersLoadingState />
            ) : familyQuery.isError ? (
              <div className="px-6 py-14 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f1f4f3] text-[#60777b]">
                  <RefreshCw className="size-5" />
                </span>

                <h3 className="mt-4 text-base font-bold text-[#26454a]">
                  Family connections could not be loaded
                </h3>

                <p className="mt-2 text-sm text-[#74898d]">
                  Check your internet connection and try again.
                </p>

                <Button
                  type="button"
                  variant="outline"
                  className="mt-5 h-10 rounded-xl border-[#d5e1dd]"
                  onClick={() => void familyQuery.refetch()}
                >
                  <RefreshCw className="size-4" />
                  Retry
                </Button>
              </div>
            ) : familyMembers.length === 0 ? (
              <EmptyMembersState isParent={isParent} />
            ) : filteredMembers.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-sm font-semibold text-[#586f74]">
                  No family member matches “{search}”.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#e7eeec]">
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
          </section>
        </div>

        <section className="grid gap-4 lg:grid-cols-3">
          <GuidanceCard
            icon={ShieldCheck}
            title="Share access carefully"
            description="Only connect people you trust with sensitive care and health information."
          />

          <GuidanceCard
            icon={Phone}
            title="Keep contact details current"
            description="Accurate phone numbers help the care circle communicate during urgent situations."
          />

          <GuidanceCard
            icon={KeyRound}
            title="Regenerate when needed"
            description="Create a new link code if the current code was shared with the wrong person."
          />
        </section>
      </div>

      <AlertDialog
        open={Boolean(removalTarget)}
        onOpenChange={(open) => {
          if (!open && !removing) {
            setRemovalTarget(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-[1.5rem] border-[#dce7e3]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold tracking-[-0.025em] text-[#17343a]">
              Remove family connection?
            </AlertDialogTitle>

            <AlertDialogDescription className="leading-6 text-[#71858a]">
              {removalTarget?.kind === "child"
                ? `${removalTarget.name} will no longer be able to view or monitor this care account.`
                : `You will no longer be able to view or monitor ${removalTarget?.name ?? "this care account"}.`} {" "}
              Health records are not deleted, but access is removed immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={removing}
              className="h-11 rounded-xl border-[#d7e2df]"
            >
              Keep connection
            </AlertDialogCancel>

            <AlertDialogAction
              disabled={removing}
              onClick={(event) => {
                event.preventDefault();
                confirmRemoval();
              }}
              className="h-11 rounded-xl bg-[#a74c47] text-white hover:bg-[#913f3b]"
            >
              {removing && <Loader2 className="size-4 animate-spin" />}
              Remove connection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showRegenerateConfirm}
        onOpenChange={setShowRegenerateConfirm}
      >
        <AlertDialogContent className="rounded-[1.5rem] border-[#dce7e3]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold tracking-[-0.025em] text-[#17343a]">
              Generate a new Family Link Code?
            </AlertDialogTitle>

            <AlertDialogDescription className="leading-6 text-[#71858a]">
              The current code will stop working for new connections. Existing
              family members will remain connected.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={regenerate.isPending}
              className="h-11 rounded-xl border-[#d7e2df]"
            >
              Keep current code
            </AlertDialogCancel>

            <AlertDialogAction
              disabled={regenerate.isPending}
              onClick={(event) => {
                event.preventDefault();
                regenerate.mutate();
              }}
              className="h-11 rounded-xl bg-[#0d6665] text-white hover:bg-[#0a5958]"
            >
              {regenerate.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Generate new code
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

type SummaryMetricProps = {
  icon: typeof Users;
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
          : "border-b border-[#e2ebe8] sm:border-r lg:border-b-0"
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

        <p className="mt-1 text-xl font-bold tracking-[-0.035em] text-[#17343a]">
          {value}
        </p>

        <p className="mt-0.5 truncate text-xs text-[#768a8e]">{detail}</p>
      </div>
    </div>
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
    <section className="relative overflow-hidden rounded-[1.75rem] bg-[#0c3f45] p-6 text-white shadow-[0_22px_55px_-35px_rgba(12,63,69,0.75)] sm:p-7">
      <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 size-64 rounded-full bg-[#6fb19f]/10" />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a7d0c7]">
              Your Family Link Code
            </p>

            <h2 className="mt-2 text-xl font-bold tracking-[-0.025em]">
              Invite a trusted family member
            </h2>
          </div>

          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-[#b5ddd3]">
            <KeyRound className="size-5" />
          </span>
        </div>

        <div className="mt-7 rounded-2xl border border-white/12 bg-white/7 px-5 py-6 backdrop-blur-sm">
          <p className="break-all font-mono text-3xl font-bold tracking-[0.16em] text-white sm:text-4xl">
            {inviteCode ?? "————————"}
          </p>

          <p className="mt-3 text-xs font-medium text-white/55">
            Eight characters · Case insensitive · Share privately
          </p>
        </div>

        <p className="mt-5 text-sm leading-6 text-white/68">
          A family member uses this code once to connect to your account. Existing
          connections remain active if you generate a new code.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            onClick={onCopy}
            disabled={!inviteCode}
            className="h-11 rounded-xl bg-white text-[#17454a] hover:bg-[#eef6f3]"
          >
            <Copy className="size-4" />
            Copy code
          </Button>

          <Button
            type="button"
            onClick={onShare}
            disabled={!inviteCode}
            variant="outline"
            className="h-11 rounded-xl border-white/18 bg-white/8 text-white hover:bg-white/14 hover:text-white"
          >
            <Share2 className="size-4" />
            Share invitation
          </Button>
        </div>

        <button
          type="button"
          onClick={onRegenerate}
          disabled={regeneratePending}
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#b9d9d1] transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`size-4 ${regeneratePending ? "animate-spin" : ""}`}
          />
          Generate a different code
        </button>
      </div>
    </section>
  );
}

function ConnectAccountCard({
  code,
  phone,
  profilePhone,
  pending,
  onCodeChange,
  onPhoneChange,
  onSubmit,
}: {
  code: string;
  phone: string;
  profilePhone?: string | null;
  pending: boolean;
  onCodeChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="rounded-[1.75rem] border border-[#dce8e4] bg-white p-6 shadow-[0_18px_50px_-40px_rgba(18,49,54,0.45)] sm:p-7">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e4f1ed] text-[#176f69]">
          <UserPlus className="size-5" />
        </span>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#74898d]">
            Secure connection
          </p>

          <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-[#17343a]">
            Connect a care account
          </h2>

          <p className="mt-2 text-sm leading-6 text-[#71858a]">
            Enter the private eight-character code shown on the care recipient’s
            Family page.
          </p>
        </div>
      </div>

      <form
        className="mt-7 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="invite-code" className="font-semibold text-[#29484e]">
              Family Link Code
            </Label>

            <span className="text-xs font-semibold text-[#7b8e92]">
              {code.length}/8
            </span>
          </div>

          <Input
            id="invite-code"
            value={code}
            onChange={(event) =>
              onCodeChange(normalizeInviteCode(event.target.value))
            }
            placeholder="A1B2C3D4"
            className="h-13 rounded-xl border-[#d5e2de] bg-[#fbfdfc] px-4 font-mono text-lg font-bold uppercase tracking-[0.2em] text-[#173f44]"
            maxLength={8}
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="family-phone" className="font-semibold text-[#29484e]">
            Your phone number
            <span className="ml-1 font-normal text-[#859699]">(optional)</span>
          </Label>

          <Input
            id="family-phone"
            type="tel"
            value={phone}
            onChange={(event) => onPhoneChange(event.target.value)}
            placeholder={profilePhone || "+91 98765 43210"}
            className="h-11 rounded-xl border-[#d8e4e0] bg-white"
            disabled={pending}
          />

          <p className="text-xs leading-5 text-[#7a8d91]">
            This updates your profile so the linked care recipient can contact
            you when needed.
          </p>
        </div>

        <Button
          type="submit"
          disabled={pending || code.length !== 8}
          className="h-11 w-full rounded-xl bg-[#0d6665] font-semibold text-white hover:bg-[#0a5958]"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Link2 className="size-4" />
          )}
          {pending ? "Connecting…" : "Connect account"}
        </Button>
      </form>
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
  const hasValidLinkedDate =
    linkedDate !== null && !Number.isNaN(linkedDate.getTime());

  return (
    <article className="flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-[#fbfdfc] sm:flex-row sm:items-center sm:px-6">
      <Avatar className="size-12 shrink-0 border border-[#d9e5e1] bg-[#eef5f2]">
        <AvatarImage src={avatarUrl} alt={member.full_name || label} />
        <AvatarFallback className="bg-[#e4f1ed] font-bold text-[#176f69]">
          {initial}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-bold text-[#234349]">
            {member.full_name || "Unnamed member"}
          </h3>

          <Badge className="border-0 bg-[#e5f2ed] text-[#1b725f] hover:bg-[#e5f2ed]">
            <CheckCircle2 className="mr-1 size-3" />
            Connected
          </Badge>
        </div>

        <p className="mt-1 text-xs font-medium text-[#768a8e]">{label}</p>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#667d81]">
          {member.email && (
            <a
              href={`mailto:${member.email}`}
              className="flex min-w-0 items-center gap-1.5 transition hover:text-[#0d7774]"
              title={`Email ${member.full_name || "family member"}`}
            >
              <Mail className="size-3.5 shrink-0" />
              <span className="truncate">{member.email}</span>
            </a>
          )}

          {member.phone && (
            <a
              href={`tel:${member.phone.replace(/[^+\d]/g, "")}`}
              className="flex items-center gap-1.5 transition hover:text-[#0d7774]"
              title={`Call ${member.full_name || "family member"}`}
            >
              <Phone className="size-3.5" />
              {member.phone}
            </a>
          )}

          {hasValidLinkedDate && (
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              Connected {format(linkedDate, "MMM d, yyyy")}
            </span>
          )}
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="size-10 shrink-0 self-end rounded-xl text-[#98514c] hover:bg-[#fff1ef] hover:text-[#873f3b] sm:self-auto"
        title="Remove family connection"
        aria-label={`Remove ${member.full_name || "family member"}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </article>
  );
}

function MembersLoadingState() {
  return (
    <div className="divide-y divide-[#e7eeec] px-5 sm:px-6">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex animate-pulse items-center gap-4 py-5">
          <div className="size-12 rounded-full bg-[#e9efed]" />

          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-36 rounded bg-[#e6edeb]" />
            <div className="h-3 w-52 rounded bg-[#f0f4f3]" />
          </div>

          <div className="size-10 rounded-xl bg-[#edf2f0]" />
        </div>
      ))}
    </div>
  );
}

function EmptyMembersState({ isParent }: { isParent: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-[#e7f2ee] text-[#176f69]">
        <Users className="size-6" />
      </span>

      <h3 className="mt-5 text-lg font-bold text-[#1c3b41]">
        No family connections yet
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-[#71868a]">
        {isParent
          ? "Share your private Family Link Code with a trusted family member to create the first connection."
          : "Enter a Family Link Code to connect to the first care account you want to monitor."}
      </p>
    </div>
  );
}

function GuidanceCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-2xl border border-[#dce8e4] bg-white p-5 shadow-[0_16px_40px_-34px_rgba(18,49,54,0.45)]">
      <span className="grid size-10 place-items-center rounded-xl bg-[#e7f2ee] text-[#176f69]">
        <Icon className="size-4.5" />
      </span>

      <h2 className="mt-4 text-sm font-bold text-[#24444a]">{title}</h2>

      <p className="mt-2 text-sm leading-6 text-[#71858a]">{description}</p>
    </article>
  );
}