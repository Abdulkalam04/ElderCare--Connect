import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-24 w-full resize-y rounded-xl border border-[#d6e2de] bg-white px-3.5 py-3 text-base leading-6 text-[#17343a] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_20px_-20px_rgba(18,49,54,0.5)] transition-[border-color,box-shadow,background-color] placeholder:text-[#92a1a4] hover:border-[#bfd1cb] focus-visible:border-[#6da69b] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0d7774]/10 disabled:cursor-not-allowed disabled:bg-[#f3f6f5] disabled:opacity-65 md:text-sm",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";

export { Textarea };