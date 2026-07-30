// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { enhanceProjectBrandMedia } from "~/components/RouteScrollReset";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("project brand media enhancement", () => {
  it("loads a project logo without removing the lantern fallback before success", () => {
    document.body.innerHTML = `
      <article class="project-lantern-card">
        <div class="project-lantern-mark"><span></span></div>
        <h3><a href="/projects/paper-lantern">Paper Lantern</a></h3>
      </article>
    `;

    enhanceProjectBrandMedia(document);

    const mark = document.querySelector<HTMLElement>(".project-lantern-mark")!;
    const fallback = mark.querySelector<HTMLElement>("span")!;
    const image = mark.querySelector<HTMLImageElement>("img.project-brand-logo")!;
    expect(image.getAttribute("src")).toBe(
      "/media/projects/paper-lantern/logo",
    );
    expect(fallback.style.display).toBe("");

    image.dispatchEvent(new Event("load"));
    expect(fallback.style.display).toBe("none");
    expect(mark).toHaveClass("has-project-logo");
  });

  it("adds a deal banner and logo while retaining fallbacks when media is absent", () => {
    document.body.innerHTML = `
      <article class="deal-card">
        <div class="deal-card-art"><span>CO</span><i></i><b>AKARI REVIEWED</b></div>
        <h2><a href="/deals/sisili-islands-club">Sisili Islands Club</a></h2>
      </article>
    `;

    enhanceProjectBrandMedia(document);
    enhanceProjectBrandMedia(document);

    const art = document.querySelector<HTMLElement>(".deal-card-art")!;
    const banner = art.querySelector<HTMLImageElement>("img.project-brand-banner")!;
    const logo = art.querySelector<HTMLImageElement>("img.project-brand-logo")!;
    const logoFrame = art.querySelector<HTMLElement>(":scope > span")!;

    expect(art.querySelectorAll("img.project-brand-banner")).toHaveLength(1);
    expect(art.querySelectorAll("img.project-brand-logo")).toHaveLength(1);
    expect(banner.getAttribute("src")).toBe(
      "/media/projects/sisili-islands-club/banner",
    );
    expect(logo.getAttribute("src")).toBe(
      "/media/projects/sisili-islands-club/logo",
    );
    expect(logoFrame.textContent).toContain("CO");

    banner.dispatchEvent(new Event("load"));
    logo.dispatchEvent(new Event("load"));
    expect(art).toHaveClass("has-project-banner");
    expect(art).toHaveClass("has-project-logo");
    expect(logoFrame.style.color).toBe("transparent");
  });

  it("removes failed media requests so native fallbacks remain clean", () => {
    document.body.innerHTML = `
      <article class="deal-card">
        <div class="deal-card-art"><span>AK</span><i></i><b>AKARI REVIEWED</b></div>
        <h2><a href="/deals/no-brand-yet">No Brand Yet</a></h2>
      </article>
    `;

    enhanceProjectBrandMedia(document);
    const images = Array.from(document.querySelectorAll(".deal-card-art img"));
    expect(images).toHaveLength(2);
    images.forEach((image) => image.dispatchEvent(new Event("error")));
    expect(document.querySelectorAll(".deal-card-art img")).toHaveLength(0);
    expect(document.querySelector(".deal-card-art span")?.textContent).toBe("AK");
  });
});
