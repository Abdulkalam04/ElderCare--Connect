import {
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser, useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

interface EditableAvatarProps {
  size?: "sm" | "md" | "lg" | "xl";
  editable?: boolean;
}

function cropAndCompress(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const image = new Image();
      image.src = event.target?.result as string;

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const outputSize = 256;
        canvas.width = outputSize;
        canvas.height = outputSize;

        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("The image editor could not be opened."));
          return;
        }

        const shortestSide = Math.min(image.width, image.height);
        const sourceX = (image.width - shortestSide) / 2;
        const sourceY = (image.height - shortestSide) / 2;

        context.drawImage(
          image,
          sourceX,
          sourceY,
          shortestSide,
          shortestSide,
          0,
          0,
          outputSize,
          outputSize,
        );

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("The image could not be processed."));
            }
          },
          "image/jpeg",
          0.85,
        );
      };

      image.onerror = () =>
        reject(new Error("The selected image could not be opened."));
    };

    reader.onerror = () =>
      reject(new Error("The selected file could not be read."));
  });
}

export function EditableAvatar({
  size = "md",
  editable = true,
}: EditableAvatarProps) {
  const { data: profile } = useProfile();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const initials = (profile?.full_name || "?")
    .split(" ")
    .map((name) => name[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sizeClass = {
    sm: "size-9 text-xs",
    md: "size-12 text-sm",
    lg: "size-16 text-base",
    xl: "size-24 text-2xl",
  }[size];

  const iconSize = {
    sm: "size-3",
    md: "size-4",
    lg: "size-5",
    xl: "size-6",
  }[size];

  async function invalidateProfileQueries(userId: string) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["profile", userId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["myProfile", userId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["linkedChildren"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["linkedParents"],
      }),
    ]);
  }

  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("The image must be smaller than 5 MB.");
      return;
    }

    const allowedFormats = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];

    if (!allowedFormats.includes(file.type)) {
      toast.error("Upload a JPG, PNG or WEBP image.");
      return;
    }

    setUploading(true);
    const uploadToast = toast.loading("Updating profile photo…");

    try {
      if (!user?.id) {
        throw new Error("Your user session is not available.");
      }

      const compressedBlob = await cropAndCompress(file);

      if (profile?.avatar_url) {
        const pathParts = profile.avatar_url.split("/avatars/");

        if (pathParts.length > 1) {
          await supabase.storage
            .from("avatars")
            .remove([pathParts[1]]);
        }
      }

      const filePath = `${user.id}/avatar-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, compressedBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        if (
          uploadError.message.includes("not found") ||
          uploadError.message.includes("Bucket")
        ) {
          throw new Error(
            "The avatars storage bucket is not configured.",
          );
        }

        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const { error: databaseError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrlData.publicUrl })
        .eq("id", user.id);

      if (databaseError) {
        throw databaseError;
      }

      await invalidateProfileQueries(user.id);

      toast.success("Profile photo updated.", {
        id: uploadToast,
      });
    } catch (error) {
      console.error("Avatar upload error:", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "The profile photo could not be updated.",
        { id: uploadToast },
      );
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleRemovePhoto() {
    if (!user?.id) {
      return;
    }

    setUploading(true);
    const removeToast = toast.loading("Removing profile photo…");

    try {
      if (profile?.avatar_url) {
        const pathParts = profile.avatar_url.split("/avatars/");

        if (pathParts.length > 1) {
          await supabase.storage
            .from("avatars")
            .remove([pathParts[1]]);
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (error) {
        throw error;
      }

      await invalidateProfileQueries(user.id);

      toast.success("Profile photo removed.", {
        id: removeToast,
      });
    } catch (error) {
      console.error("Avatar removal error:", error);

      toast.error("The profile photo could not be removed.", {
        id: removeToast,
      });
    } finally {
      setUploading(false);
    }
  }

  const currentAvatar =
    profile?.avatarUrl ?? profile?.avatar_url ?? null;

  const avatar = (
    <span
      className={`group relative block shrink-0 overflow-hidden rounded-full ${sizeClass}`}
    >
      <Avatar className="size-full border-2 border-white bg-[#e4f1ec] shadow-[0_10px_24px_-14px_rgba(18,49,54,0.55)]">
        {currentAvatar && (
          <AvatarImage
            src={currentAvatar}
            alt={profile?.full_name ?? "Profile photo"}
            className="object-cover"
          />
        )}

        <AvatarFallback className="bg-[#e4f1ec] font-bold text-[#176f69]">
          {initials}
        </AvatarFallback>
      </Avatar>

      {uploading && (
        <span className="absolute inset-0 grid place-items-center bg-[#123c41]/72">
          <Loader2 className="size-5 animate-spin text-white" />
        </span>
      )}

      {editable && !uploading && (
        <span className="absolute inset-0 grid place-items-center bg-[#123c41]/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Camera className={`${iconSize} text-white`} />
        </span>
      )}
    </span>
  );

  if (!editable) {
    return avatar;
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
        onChange={handleFileChange}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d7774] focus-visible:ring-offset-2"
            aria-label="Edit profile photo"
          >
            {avatar}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="center"
          className="w-52 rounded-xl border-[#dce7e3] bg-white p-1.5 shadow-[0_18px_45px_-28px_rgba(18,49,54,0.45)]"
        >
          <DropdownMenuItem
            className="cursor-pointer rounded-lg py-2.5 text-sm font-semibold text-[#38595e] focus:bg-[#eef5f2] focus:text-[#0d6665]"
            onClick={() => fileInputRef.current?.click()}
          >
            {profile?.avatar_url ? (
              <Camera className="size-4" />
            ) : (
              <Upload className="size-4" />
            )}

            {profile?.avatar_url
              ? "Change photo"
              : "Upload photo"}
          </DropdownMenuItem>

          {profile?.avatar_url && (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="cursor-pointer rounded-lg py-2.5 text-sm font-semibold text-[#a44e49] focus:bg-[#fff1ef] focus:text-[#913f3b]"
                onClick={() => void handleRemovePhoto()}
              >
                <Trash2 className="size-4" />
                Remove photo
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}