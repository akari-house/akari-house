import { redirect } from "react-router";
import { crmProductBoundary } from "~/lib/admin-workspace";

export async function loader() {
  return redirect(crmProductBoundary.url, 302);
}

export async function action() {
  return redirect(crmProductBoundary.url, 303);
}
