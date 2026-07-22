import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";
describe("cn", () => {
  it("joins conditional class names", () => {
    const isHidden = false;
    expect(cn("p-2", isHidden && "hidden", "rounded")).toBe("p-2 rounded");
  });
  it("keeps the final conflicting Tailwind class", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
