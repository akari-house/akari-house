import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "~/lib/response-security";

describe("response security", () => {
  it("prevents personalized HTML from being cached and declares UTF-8", () => {
    const response = withSecurityHeaders(
      new Request("https://akari.example/profiles/member"),
      new Response("<html></html>", {
        headers: { "Content-Type": "text/html" },
      }),
    );

    expect(response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toContain("Cookie");
    expect(response.headers.get("Strict-Transport-Security")).toContain(
      "max-age=31536000",
    );
  });

  it("keeps static response caching decisions intact", () => {
    const response = withSecurityHeaders(
      new Request("https://akari.example/assets/brand/favicon.png"),
      new Response("asset", {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000",
        },
      }),
    );

    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000",
    );
  });
});
