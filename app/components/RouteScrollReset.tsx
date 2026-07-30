import { useEffect } from "react";
import { useLocation } from "react-router";

function dealSlugFromHref(href: string) {
  const path = href.split("?")[0]?.split("#")[0] ?? "";
  if (!path.startsWith("/deals/")) return "";
  return decodeURIComponent(path.slice("/deals/".length).split("/")[0] ?? "");
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

export function enhanceDealBrandMedia(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".deal-card").forEach((card) => {
    const link = card.querySelector<HTMLAnchorElement>('h2 a[href^="/deals/"]');
    const art = card.querySelector<HTMLElement>(".deal-card-art");
    const slug = link ? dealSlugFromHref(link.getAttribute("href") ?? "") : "";
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
    art.insertBefore(banner, art.firstChild);

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
    logoFrame.appendChild(logo);
  });
}

export function RouteScrollReset() {
  const location = useLocation();

  useEffect(() => {
    const brandFrame = requestAnimationFrame(() =>
      enhanceDealBrandMedia(document),
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
