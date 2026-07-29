import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("SEO and mobile discovery foundation", () => {
  it("publishes a crawler policy and production sitemap", () => {
    const robots = readProjectFile("public/robots.txt");
    const sitemap = readProjectFile("public/sitemap.xml");

    expect(robots).toContain("Sitemap: https://akarihouse.com/sitemap.xml");
    expect(robots).toContain("Disallow: /admin/");
    expect(sitemap).toContain("https://akarihouse.com/");
    expect(sitemap).toContain("https://akarihouse.com/deals");
    expect(sitemap).not.toContain("/admin/");
  });

  it("provides installable mobile metadata using official brand assets", () => {
    const manifest = JSON.parse(readProjectFile("public/site.webmanifest")) as {
      name: string;
      display: string;
      theme_color: string;
      icons: Array<{ src: string }>;
    };
    const root = readProjectFile("app/root.tsx");

    expect(manifest.name).toBe("AKARI House");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#090b14");
    expect(manifest.icons.some((icon) => icon.src.includes("/assets/brand/"))).toBe(
      true,
    );
    expect(root).toContain('rel: "manifest", href: "/site.webmanifest"');
    expect(root).toContain('name="apple-mobile-web-app-capable"');
    expect(root).toContain("viewport-fit=cover");
  });
});
