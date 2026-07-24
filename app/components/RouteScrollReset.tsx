import { useEffect } from "react";
import { useLocation } from "react-router";

export function RouteScrollReset() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.hash]);

  return null;
}
