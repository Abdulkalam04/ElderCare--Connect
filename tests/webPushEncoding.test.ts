import { describe, expect, it } from "vitest";
import { bufferToBase64Url, urlBase64ToUint8Array } from "@/lib/webPushEncoding";
describe("web-push key encoding", () => {
  it("encodes an ArrayBuffer as URL-safe Base64 without padding", () => {
    const encoded = bufferToBase64Url(Uint8Array.from([251, 255, 239, 1, 2, 3]).buffer);
    expect(encoded).toBe("-__vAQID");
    expect(encoded).not.toMatch(/[+/=]/);
  });
  it("decodes URL-safe Base64 back to the original bytes", () => {
    const original = Uint8Array.from([1, 2, 3, 250, 251, 252, 253, 254, 255]);
    const encoded = bufferToBase64Url(original.buffer);
    expect([...urlBase64ToUint8Array(encoded)]).toEqual([...original]);
  });
  it("returns an empty value for a missing browser key", () => {
    expect(bufferToBase64Url(null)).toBe("");
  });
});
