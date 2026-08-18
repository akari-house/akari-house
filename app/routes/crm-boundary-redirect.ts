import { redirect } from "react-router";
import { crmProductBoundary } from "~/lib/admin-workspace";

export function loader() {
  return redirect(crmProductBoundary.url, 302);
}

export function action() {
  return redirect(crmProductBoundary.url, 303);
}
