import { Link } from "react-router";
import type { Route } from "./+types/legal";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

const documents = {
  "/privacy": {
    title: "Privacy",
    intro:
      "How AKARI House handles account, profile, connection and participation data.",
    sections: [
      ["What we collect", "We store the information you submit when applying, maintaining a profile, following a project, registering for an event or connecting with another member. Passwords are stored only as secure hashes."],
      ["Visibility and contact sharing", "Applicant profiles remain private. Member profile visibility is enforced on the server. Private contact details are disclosed only under the visibility and consent choices shown in the product."],
      ["Media and external services", "Profile media may be stored in Cloudflare R2 when uploads are enabled. Transactional delivery may use Resend and Telegram only when those features are configured or linked."],
      ["Retention and requests", "Operational and security records are retained only as needed to run and protect the House. Contact the AKARI team to request access, correction or deletion of your account data."],
    ],
  },
  "/terms": {
    title: "Terms of participation",
    intro:
      "The practical agreement that keeps the House useful, private and trustworthy.",
    sections: [
      ["Membership", "An account application does not guarantee approved membership. AKARI may review, waitlist, decline, suspend or remove access to protect the community."],
      ["Your information", "You are responsible for keeping profile, project, event and interest information accurate and for having permission to publish submitted material."],
      ["Introductions and opportunities", "AKARI facilitates discovery and consent-based introductions. It does not guarantee investments, partnerships, attendance, performance or commercial outcomes."],
      ["Acceptable use", "Do not scrape private information, impersonate others, spam members, evade access controls or upload unlawful, deceptive or harmful material."],
    ],
  },
  "/community-guidelines": {
    title: "Community guidelines",
    intro:
      "A simple standard for thoughtful participation across every room.",
    sections: [
      ["Lead with context", "Explain why a connection, collaboration or investment conversation may be relevant. A thoughtful request is more valuable than high volume."],
      ["Respect permission", "A pending request is not a mutual connection. Do not move private information outside AKARI without the other person’s consent."],
      ["Represent work honestly", "Distinguish evidence from aspiration. Keep project stages, audience figures, case studies and investment interests accurate and current."],
      ["Protect the room", "Report spam, harassment, misrepresentation or unsafe behaviour. AKARI may restrict content or access while a report is reviewed."],
    ],
  },
} as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const pathname = new URL(request.url).pathname as keyof typeof documents;
  const document = documents[pathname];
  if (!document) throw new Response("Not found", { status: 404 });
  const user = await getOptionalUser(request, context.get(cloudflareContext).env.DB);
  return { document, user };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.document.title ?? "Policy"} | AKARI House` },
    { name: "description", content: loaderData?.document.intro ?? "" },
  ];
}

export default function Legal({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell legal-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="legal-main">
        <header>
          <span className="eyebrow">The House agreement</span>
          <h1>{loaderData.document.title}</h1>
          <p>{loaderData.document.intro}</p>
        </header>
        <div className="legal-sections">
          {loaderData.document.sections.map(([title, body]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <p className="legal-note">
          Foundation edition · Updated 24 July 2026. Questions can be sent
          through the official AKARI contact channel announced by the
          Membership Desk.
        </p>
        <Link className="button button-quiet" to="/">
          Return to the House
        </Link>
      </main>
    </div>
  );
}
