import { expect, test } from "@playwright/test";

test.describe("R80 House and CRM agreement boundary", () => {
  test("redirects the retired House agreement surface to AKARI CRM", async ({
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "The product-domain redirect only needs one browser-independent proof.",
    );

    const response = await request.get("/admin/agreements", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe("https://crm.akarihouse.com");
  });
});
