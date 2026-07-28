import { readFileSync, writeFileSync } from "node:fs";

function update(path, transform) {
  const source = readFileSync(path, "utf8");
  const next = transform(source);
  if (next === source) throw new Error(`No changes applied to ${path}`);
  writeFileSync(path, next);
}

function replaceOnce(source, oldValue, newValue, label) {
  const occurrences = source.split(oldValue).length - 1;
  if (occurrences !== 1)
    throw new Error(`${label}: expected one match, found ${occurrences}`);
  return source.replace(oldValue, newValue);
}

update("app/root.tsx", (source) =>
  replaceOnce(
    source,
    'import "./styles/site-final-polish.css";\n',
    'import "./styles/site-final-polish.css";\nimport "./styles/investor-house-reference.css";\n',
    "root stylesheet import",
  ),
);

update("app/routes/deals.tsx", (initial) => {
  let source = replaceOnce(
    initial,
    'import { SiteHeader } from "~/components/SiteHeader";\n',
    'import { SiteHeader } from "~/components/SiteHeader";\nimport { InvestorHouseSidebar } from "~/components/InvestorHouseSidebar";\n',
    "deals sidebar import",
  );
  source = replaceOnce(
    source,
    '<div className="site-shell">\n      <SiteHeader user={loaderData.user} />\n      <main id="main-content" className="deals-main">',
    '<div className="site-shell investor-house-shell">\n      <SiteHeader user={loaderData.user} />\n      <InvestorHouseSidebar\n        user={loaderData.user}\n        activeView={loaderData.view}\n        counts={loaderData.navigationCounts}\n      />\n      <main id="main-content" className="deals-main investor-house-content">',
    "deals shell",
  );

  const navStart = source.indexOf(
    '        <nav className="investor-workspace-nav" aria-label="Investor workspace">',
  );
  const heroStart = source.indexOf('        <header className="deals-hero">');
  if (navStart < 0 || heroStart < 0 || heroStart <= navStart)
    throw new Error("deals workspace navigation markers not found");
  source = source.slice(0, navStart) + source.slice(heroStart);

  source = replaceOnce(
    source,
    '<span className="chapter">Investor and Angel Deal Rooms</span>\n            <h1>Private opportunities. Clearer conviction.</h1>\n            <p>\n              Discover reviewed early-stage opportunities, compare the\n              essentials, and enter secure Deal Rooms when access is approved.\n            </p>',
    '<span className="chapter">AKARI Investor House</span>\n            <h1>Investor Deals Room</h1>\n            <p>\n              Curated opportunities matched to your investment preferences,\n              verification status and approved access.\n            </p>',
    "deals hero copy",
  );
  source = replaceOnce(
    source,
    '<aside>\n            <span className="workspace-pulse" aria-hidden="true" />\n            <strong>Curated, controlled, confidential.</strong>\n            <p>\n              AKARI supports professional discovery and introductions. Members\n              remain responsible for independent due diligence and professional\n              advice.\n            </p>\n          </aside>',
    '<aside aria-label="Deal Room guidance">\n            <div className="deal-hero-actions">\n              <a className="button button-quiet" href="#deal-filter-title">\n                How it works\n              </a>\n              {investorMember ? (\n                <Link className="button button-primary" to="/settings/investor">\n                  Investor Preferences\n                </Link>\n              ) : (\n                <Link\n                  className="button button-primary"\n                  to="/login?returnTo=/settings/investor"\n                >\n                  Investor sign in\n                </Link>\n              )}\n            </div>\n          </aside>',
    "deals hero actions",
  );
  source = replaceOnce(
    source,
    '<article className="deal-card" key={opportunity.projectId}>',
    '<article\n                  className="deal-card"\n                  data-sector={opportunity.sector}\n                  key={opportunity.projectId}\n                >',
    "deal card attributes",
  );
  return source;
});

update("app/routes/deal-room.tsx", (initial) => {
  let source = replaceOnce(
    initial,
    'import { SiteHeader } from "~/components/SiteHeader";\n',
    'import { SiteHeader } from "~/components/SiteHeader";\nimport { InvestorHouseSidebar } from "~/components/InvestorHouseSidebar";\n',
    "deal room sidebar import",
  );
  source = replaceOnce(
    source,
    '<div className="site-shell">\n      <SiteHeader user={loaderData.user} />\n      <main id="main-content" className="deal-room-main">\n        <header className="deal-room-hero">',
    '<div className="site-shell investor-house-shell">\n      <SiteHeader user={loaderData.user} />\n      <InvestorHouseSidebar user={loaderData.user} />\n      <main id="main-content" className="deal-room-main investor-house-content">\n        <div className="deal-room-topbar">\n          <Link to="/deals">← Back to opportunities</Link>\n          <Link to="/settings/investor">Investor Preferences</Link>\n        </div>\n        <header className="deal-room-hero">',
    "deal room shell",
  );
  source = replaceOnce(
    source,
    '<span className="chapter">Approved opportunity preview</span>',
    '<span className="chapter">Investor Deal Room</span>',
    "deal room chapter",
  );
  source = replaceOnce(
    source,
    '        </section>\n\n        <section className="deal-public-story">',
    '        </section>\n\n        <nav className="deal-room-tabs" aria-label="Deal Room sections">\n          <a href="#overview">Overview</a>\n          <a href="#information">Information</a>\n          <a href="#activity">Activity</a>\n          {loaderData.fullAccess && <a href="#documents">Documents</a>}\n          {loaderData.verifiedInvestor && !loaderData.founder && (\n            <a href="#decision-space">Decision space</a>\n          )}\n        </nav>\n\n        <section id="overview" className="deal-public-story">',
    "deal room tabs",
  );
  source = replaceOnce(
    source,
    '            className="deal-room-sections"\n            aria-labelledby="deal-sections-title"',
    '            id="information"\n            className="deal-room-sections"\n            aria-labelledby="deal-sections-title"',
    "information section id",
  );
  source = replaceOnce(
    source,
    '<section className="deal-updates">',
    '<section id="activity" className="deal-updates">',
    "activity section id",
  );
  source = replaceOnce(
    source,
    '<section className="deal-investor-actions">',
    '<section id="decision-space" className="deal-investor-actions">',
    "decision section id",
  );
  source = replaceOnce(
    source,
    '            className="private-deal-room"\n            aria-labelledby="private-room-title"',
    '            id="documents"\n            className="private-deal-room"\n            aria-labelledby="private-room-title"',
    "documents section id",
  );
  return source;
});
