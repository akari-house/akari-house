import { describe, expect, it } from "vitest";
import { legalDocumentForUrl } from "../../app/content/legal-documents";

describe("legalDocumentForUrl", () => {
  it.each([
    ["https://akari.example/terms", "terms"],
    ["https://akari.example/terms/", "terms"],
    ["https://akari.example/terms?_routes=routes%2Fterms", "terms"],
    ["https://akari.example/terms.data", "terms"],
    ["https://akari.example/privacy", "privacy"],
    ["https://akari.example/privacy/", "privacy"],
    ["https://akari.example/privacy.data", "privacy"],
    ["https://akari.example/community-guidelines", "community"],
    ["https://akari.example/community-guidelines/", "community"],
    ["https://akari.example/community-guidelines.data", "community"],
    ["https://akari.example/_root.data?routes=routes%2Fterms", "terms"],
    ["https://akari.example/_root.data?routes=routes%2Fprivacy", "privacy"],
    [
      "https://akari.example/_root.data?routes=routes%2Fcommunity-guidelines",
      "community",
    ],
  ])("resolves %s", (url, key) => {
    expect(legalDocumentForUrl(url)?.key).toBe(key);
  });

  it("does not resolve unrelated paths", () => {
    expect(legalDocumentForUrl("https://akari.example/projects")).toBeNull();
  });
});
