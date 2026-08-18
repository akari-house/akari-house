import type { SessionUser } from "~/lib/domain";
import "~/styles/r82-investor-house-header.css";

type InvestorHouseCounts = {
  saved?: number;
  requested?: number;
  approved?: number;
};

type InvestorHouseSidebarProps = {
  user: SessionUser | null;
  activeView?: string;
  counts?: InvestorHouseCounts;
};

/**
 * R82 removes the fixed CRM-style rail from the Investor House as well.
 * Deals and Deal Rooms keep their own contextual controls, while global
 * navigation comes from the standard AKARI SiteHeader rendered by each route.
 * Props stay accepted temporarily so route code can be simplified separately.
 */
export function InvestorHouseSidebar(_props: InvestorHouseSidebarProps) {
  return null;
}
