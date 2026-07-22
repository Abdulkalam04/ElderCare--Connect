import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useCurrentUser } from "@/hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Trash2, Loader2 } from "lucide-react";

interface EditableAvatarProps {
  size?: "sm" | "md" | "lg" | "xl";
  editable?: boolean;
}

const cropAndCompress = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 256; // Standard size for high-quality avatars
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get 2D canvas context"));
          return;
        }

        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas compression failed"));
          },
          "image/jpeg",
          0.85 // High quality, low file size compression
        );
      };
      img.onerror = () => reject(new Error("Failed to load image into memory"));
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
  });
};

export function EditableAvatar({ size = "md", editable = true }: EditableAvatarProps) {
  const { data: profile } = useProfile();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const initials = (profile?.full_name || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sizeCls = {
    sm: "size-9 text-sm",
    md: "size-12 text-base",
    lg: "size-16 text-lg",
    xl: "size-24 text-3xl",
  }[size];

  const iconSize = {
    sm: "size-3",
    md: "size-4",
    lg: "size-5",
    xl: "size-6",
  }[size];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 5 MB
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Maximum allowed size is 5 MB.");
      return;
    }

    // Check file format
    const allowedFormats = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedFormats.includes(file.type)) {
      toast.error("Invalid file format. Please upload JPG, JPEG, PNG, or WEBP.");
      return;
    }

    setUploading(true);
    const uploadToast = toast.loading("Processing and uploading your photo...");

    try {
      if (!user?.id) throw new Error("User session not found. Please log in.");

      // 1. Compress and crop image
      const compressedBlob = await cropAndCompress(file);

      // 2. Housekeeping: Remove old custom avatar if exists
      if (profile?.avatar_url) {
        const pathParts = profile.avatar_url.split("/avatars/");
        if (pathParts.length > 1) {
          const oldPath = pathParts[1];
          await supabase.storage.from("avatars").remove([oldPath]);
        }
      }

      // 3. Upload to Supabase Storage avatars bucket
      const fileExt = "jpg"; // We compressed it to JPEG
      const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, compressedBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        // If bucket is missing or RLS issue, report it clearly
        if (uploadError.message.includes("not found") || uploadError.message.includes("Bucket")) {
          throw new Error("Avatars bucket is not configured. Please apply database migrations.");
        }
        throw uploadError;
      }

      // 4. Retrieve public URL
      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      // 5. Update profiles table
      const { error: dbError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (dbError) throw dbError;

      // 6. Invalidate query cache to trigger instant app-wide updates
      await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["myProfile", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["linkedChildren"] });
      await queryClient.invalidateQueries({ queryKey: ["linkedParents"] });

      toast.success("Profile photo updated successfully!", { id: uploadToast });
    } catch (err) {
      console.error("Avatar upload error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to upload profile photo.", { id: uploadToast });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    if (!user?.id) return;
    setUploading(true);
    const removeToast = toast.loading("Removing your profile photo...");

    try {
      // 1. Delete from Supabase Storage
      if (profile?.avatar_url) {
        const pathParts = profile.avatar_url.split("/avatars/");
        if (pathParts.length > 1) {
          const oldPath = pathParts[1];
          await supabase.storage.from("avatars").remove([oldPath]);
        }
      }

      // 2. Set database avatar_url to null
      const { error: dbError } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (dbError) throw dbError;

      // 3. Refresh cache
      await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["myProfile", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["linkedChildren"] });
      await queryClient.invalidateQueries({ queryKey: ["linkedParents"] });

      toast.success("Profile photo removed successfully.", { id: removeToast });
    } catch (err) {
      console.error("Avatar removal error:", err);
      toast.error("Failed to remove profile photo.", { id: removeToast });
    } finally {
      setUploading(false);
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const currentAvatar = profile?.avatarUrl;

  const AvatarMarkup = (
    <div className={`relative ${sizeCls} rounded-full group select-none shrink-0 ${editable ? "cursor-pointer" : ""}`}>
      <Avatar className="w-full h-full border border-border shadow-sm">
        {currentAvatar && <AvatarImage src={currentAvatar} alt={profile?.full_name} className="object-cover" />}
        <AvatarFallback className="bg-secondary/20 text-secondary font-bold font-sans">
          {initials}
        </AvatarFallback>
      </Avatar>

      {/* Uploading Spinner Overlay */}
      {uploading && (
        <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center z-10">
          <Loader2 className="size-5 text-white animate-spin" />
        </div>
      )}

      {/* Hover Camera Icon Overlay */}
      {editable && !uploading && (
        <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
          <Camera className={`${iconSize} text-white`} />
        </div>
      )}
    </div>
  );

  if (!editable) {
    return AvatarMarkup;
  }

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="outline-none block focus-visible:ring-2 focus-visible:ring-brand-accent rounded-full">
            {AvatarMarkup}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-48 rounded-xl p-1.5 shadow-lg">
          <DropdownMenuItem onClick={triggerUpload} className="rounded-lg py-2 flex items-center gap-2 cursor-pointer font-medium text-sm">
            <Camera className="size-4 text-muted-foreground" />
            {profile?.avatar_url ? "Change Photo" : "Upload Photo"}
          </DropdownMenuItem>
          {profile?.avatar_url && (
            <DropdownMenuItem onClick={handleRemovePhoto} className="rounded-lg py-2 flex items-center gap-2 cursor-pointer font-medium text-sm text-red-600 hover:text-red-700 hover:bg-red-50 focus:text-red-700 focus:bg-red-50">
              <Trash2 className="size-4 text-red-500" />
              Remove Photo
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
