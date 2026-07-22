import { cn } from "@/lib/utils";
export function BrandIcon({
  className,
  rounded = true,
}: {
  className?: string;
  rounded?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="ec-brand-grad"
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="hsl(222 47% 22%)" />
          <stop offset="1" stopColor="hsl(217 91% 55%)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx={rounded ? 16 : 0} fill="url(#ec-brand-grad)" />
      <path
        d="M32 48s-13-8.2-13-18a8 8 0 0 1 13-6.2A8 8 0 0 1 45 30c0 9.8-13 18-13 18Z"
        fill="#ffffff"
      />
      <path
        d="M22 32h5l2.4-4 3.6 8 2.6-5h6.4"
        stroke="hsl(222 47% 22%)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
export function BrandLogo({
  className,
  size = "md",
  tone = "dark",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: "dark" | "light";
}) {
  const iconSize = size === "lg" ? "size-11" : size === "sm" ? "size-7" : "size-9";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandIcon className={cn(iconSize, "shadow-sm rounded-2xl")} />
      <span
        className={cn(
          "font-display font-bold tracking-tight leading-none",
          text,
          tone === "light" ? "text-white" : "text-foreground",
        )}
      >
        ElderCare<span className="text-[color:var(--brand-accent)]"> Connect</span>
      </span>
    </div>
  );
}
