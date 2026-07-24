import { useNavigate, useLocation } from "react-router";
import { Icon } from "~/components/Icon";
import { fallbackPath } from "~/lib/navigation";

export function JourneyBack() {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname === "/") return null;

  const goBack = () => {
    const cameFromAkari = (() => {
      try {
        return (
          Boolean(document.referrer) &&
          new URL(document.referrer).origin === window.location.origin
        );
      } catch {
        return false;
      }
    })();
    if (cameFromAkari) void navigate(-1);
    else void navigate(fallbackPath(location.pathname));
  };

  return (
    <button
      className="journey-back-button"
      type="button"
      onClick={goBack}
      aria-label="Return to the previous AKARI page"
    >
      <Icon name="arrow-left" />
      <span>Back</span>
    </button>
  );
}
