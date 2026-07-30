import { useEffect } from "react";
import { useLocation } from "react-router";

function slugFromHref(href: string, prefix: string) {
  const path = href.split("?")[0]?.split("#")[0] ?? "";
  if (!path.startsWith(prefix)) return "";
  return decodeURIComponent(path.slice(prefix.length).split("/")[0] ?? "");
}

function createBrandImage(src: string, className: string) {
  const image = document.createElement("img");
  image.src = src;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.className = className;
  return image;
}

export function enhanceProjectBrandMedia(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".project-lantern-card").forEach((card) => {
    const link = card.querySelector<HTMLAnchorElement>(
      'h3 a[href^="/projects/"]',
    );
    const mark = card.querySelector<HTMLElement>(".project-lantern-mark");
    const slug = link ? slugFromHref(link.getAttribute("href") ?? "", "/projects/") : "";
    if (!mark || !slug || mark.dataset.brandEnhanced === "true") return;

    mark.dataset.brandEnhanced = "true";
    const fallback = mark.querySelector<HTMLElement>("span");
    const image = createBrandImage(
      `/media/projects/${encodeURIComponent(slug)}/logo`,
      "project-brand-logo",
    );
    Object.assign(image.style, {
      position: "absolute",
      inset: "7px",
      width: "calc(100% - 14px)",
      height: "calc(100% - 14px)",
      objectFit: "contain",
      borderRadius: "14px",
      opacity: "0",
      transition: "opacity 180ms ease",
    });
    image.addEventListener("load", () => {
      fallback?.style.setProperty("display", "none");
      image.style.opacity = "1";
      mark.classList.add("has-project-logo");
      mark.style.borderRadius = "18px";
      mark.style.background = "rgba(8, 11, 19, 0.82)";
    });
    image.addEventListener("error", () => image.remove());
    mark.append(image);
  });

  root.querySelectorAll<HTMLElement>(".deal-card").forEach((card) => {
    const link = card.querySelector<HTMLAnchorElement>('h2 a[href^="/deals/"]');
    const art = card.querySelector<HTMLElement>(".deal-card-art");
    const slug = link ? slugFromHref(link.getAttribute("href") ?? "", "/deals/") : "";
    if (!art || !slug || art.dataset.brandEnhanced === "true") return;

    art.dataset.brandEnhanced = "true";
    const encodedSlug = encodeURIComponent(slug);
    const banner = createBrandImage(
      `/media/projects/${encodedSlug}/banner`,
      "project-brand-banner",
    );
    Object.assign(banner.style, {
      position: "absolute",
      inset: "0",
      zIndex: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      opacity: "0",
      transition: "opacity 220ms ease",
    });
    banner.addEventListener("load", () => {
      banner.style.opacity = "1";
      art.classList.add("has-project-banner");
    });
    banner.addEventListener("error", () => banner.remove());
    art.prepend(banner);

    const logoFrame = art.querySelector<HTMLElement>(":scope > span");
    if (!logoFrame) return;
    logoFrame.style.position = "relative";
    logoFrame.style.overflow = "hidden";
    const logo = createBrandImage(
      `/media/projects/${encodedSlug}/logo`,
      "project-brand-logo",
    );
    Object.assign(logo.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      padding: "8px",
      objectFit: "contain",
      opacity: "0",
      background: "rgba(8, 11, 19, 0.86)",
      transition: "opacity 180ms ease",
    });
    logo.addEventListener("load", () => {
      logo.style.opacity = "1";
      logoFrame.style.color = "transparent";
      art.classList.add("has-project-logo");
    });
    logo.addEventListener("error", () => logo.remove());
    logoFrame.append(logo);
  });
}

export function RouteScrollReset() {
  const location = useLocation();

  useEffect(() => {
    const brandFrame = requestAnimationFrame(() =>
      enhanceProjectBrandMedia(document),
    );
    const scrollFrame = location.hash
      ? 0
      : requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        });
    return () => {
      cancelAnimationFrame(brandFrame);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
    };
  }, [location.pathname, location.search, location.hash]);

  return null;
}
