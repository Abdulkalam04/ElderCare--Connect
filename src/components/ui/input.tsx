import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "flex h-11 w-full rounded-xl border border-[#d6e2de] bg-white px-3.5 py-2 text-base text-[#17343a] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_20px_-20px_rgba(18,49,54,0.5)] transition-[border-color,box-shadow,background-color] file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-[#29484e] placeholder:text-[#92a1a4] hover:border-[#bfd1cb] focus-visible:border-[#6da69b] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0d7774]/10 disabled:cursor-not-allowed disabled:bg-[#f3f6f5] disabled:opacity-65 md:text-sm",
      className,
    )}
    {...props}
  />
));

Input.displayName = "Input";

export { Input };