import { Link, useLocation } from "react-router";
import { Icon } from "~/components/Icon";
import { fallbackLabel, fallbackPath } from "~/lib/navigation";

export function JourneyBack({ hidden = false }: { hidden?: boolean }) {
  const location = useLocation();

  if (location.pathname === "/" || hidden) return null;

  return (
    <Link className="journey-back-button" to={fallbackPath(location.pathname)}>
      <Icon name="arrow-left" />
      <span>{fallbackLabel(location.pathname)}</span>
    </Link>
  );
}
