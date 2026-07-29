from pathlib import Path


def replace_once(path: str, old: str, new: str) -> bool:
    file_path = Path(path)
    source = file_path.read_text()
    if new in source:
        return False
    matches = source.count(old)
    if matches != 1:
        raise SystemExit(f"Expected one match in {path}, found {matches}")
    file_path.write_text(source.replace(old, new, 1))
    return True


dashboard = "app/routes/dashboard.tsx"
replace_once(
    dashboard,
    '''  const validContactVisibility = [
    "private",
    "connections",
    "project_interests",
    "connections_and_project_interests",
  ].includes(contactVisibility);
  if (
''',
    '''  const validContactVisibility = [
    "private",
    "connections",
    "project_interests",
    "connections_and_project_interests",
  ].includes(contactVisibility);
  if (
    (xScore !== null &&
      (!Number.isFinite(xScore) || xScore < 0 || xScore > 1_000)) ||
    (sorsaScore !== null &&
      (!Number.isFinite(sorsaScore) || sorsaScore < 0 || sorsaScore > 100))
  ) {
    return {
      error:
        "XScore must be between 0 and 1,000. Sorsa score must be between 0 and 100.",
      errorCode: "reputation" as const,
    };
  }
  if (
''',
)
replace_once(
    dashboard,
    '''    [xScore, sorsaScore].some(
      (score) =>
        score !== null && (!Number.isFinite(score) || score < 0 || score > 100),
    ) ||
''',
    "",
)
replace_once(
    dashboard,
    '''                Creators need a primary X profile plus current XScore and Sorsa
                score before applying to a campaign. Member-reported scores are
                clearly labelled until a partner or Admin verifies them.
              </p>
              <div className="form-row">
''',
    '''                Creators need a primary X profile plus current XScore and Sorsa
                score before applying to a campaign. Member-reported scores are
                clearly labelled until a partner or Admin verifies them.
              </p>
              {actionData &&
                "errorCode" in actionData &&
                actionData.errorCode === "reputation" && (
                  <p className="field-error" role="alert">
                    {actionData.error}
                  </p>
                )}
              <div className="form-row">
''',
)
replace_once(
    dashboard,
    '''                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={loaderData.reputationSignals.xScore ?? ""}
                    placeholder="0 to 100"
                  />
''',
    '''                    min={0}
                    max={1_000}
                    step="0.01"
                    defaultValue={loaderData.reputationSignals.xScore ?? ""}
                    placeholder="0 to 1,000"
                    aria-describedby="x-score-help"
                  />
                  <small id="x-score-help">
                    Enter your current XScore on its 0–1,000 scale.
                  </small>
''',
)

sidebar = "app/components/HouseWorkspaceSidebar.tsx"
replace_once(
    sidebar,
    '''function isActive(pathname: string, item: WorkspaceItem) {
  const [path] = item.href.split("#");
  if (item.exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}
''',
    '''function isActive(pathname: string, hash: string, item: WorkspaceItem) {
  const [path, itemHash] = item.href.split("#");
  if (itemHash) return pathname === path && hash === `#${itemHash}`;
  if (item.exact) return pathname === path && hash === "";
  return pathname === path || pathname.startsWith(`${path}/`);
}
''',
)
replace_once(
    sidebar,
    '''  pathname,
}: {
  item: WorkspaceItem;
  pathname: string;
}) {
  const active = isActive(pathname, item);
''',
    '''  pathname,
  hash,
}: {
  item: WorkspaceItem;
  pathname: string;
  hash: string;
}) {
  const active = isActive(pathname, hash, item);
''',
)
replace_once(
    sidebar,
    '''  user,
  pathname,
}: {
  user: SessionUser;
  pathname: string;
}) {
''',
    '''  user,
  pathname,
  hash = "",
}: {
  user: SessionUser;
  pathname: string;
  hash?: string;
}) {
''',
)
replace_once(
    sidebar,
    '''        to="/app"
        aria-label="AKARI House dashboard"
''',
    '''        to="/"
        aria-label="AKARI House home"
''',
)
replace_once(
    sidebar,
    '''        {houseItems.map((item) => (
          <SidebarLink key={item.label} item={item} pathname={pathname} />
        ))}
''',
    '''        {houseItems.map((item) => (
          <SidebarLink
            key={item.label}
            item={item}
            pathname={pathname}
            hash={hash}
          />
        ))}
''',
)
replace_once(
    sidebar,
    '''            {roleItems.map((item) => (
              <SidebarLink key={item.label} item={item} pathname={pathname} />
            ))}
''',
    '''            {roleItems.map((item) => (
              <SidebarLink
                key={item.label}
                item={item}
                pathname={pathname}
                hash={hash}
              />
            ))}
''',
)
replace_once(
    sidebar,
    '''        {profileItems.map((item) => (
          <SidebarLink key={item.label} item={item} pathname={pathname} />
        ))}
''',
    '''        {profileItems.map((item) => (
          <SidebarLink
            key={item.label}
            item={item}
            pathname={pathname}
            hash={hash}
          />
        ))}
''',
)
replace_once(
    sidebar,
    '''              pathname={pathname}
            />
            {adminItems.map((item) => (
''',
    '''              pathname={pathname}
              hash={hash}
            />
            {adminItems.map((item) => (
''',
)
replace_once(
    sidebar,
    '''                pathname={pathname}
              />
            ))}
''',
    '''                pathname={pathname}
                hash={hash}
              />
            ))}
''',
)

replace_once(
    "app/components/SiteHeader.tsx",
    '''        <HouseWorkspaceSidebar user={user} pathname={location.pathname} />
''',
    '''        <HouseWorkspaceSidebar
          user={user}
          pathname={location.pathname}
          hash={location.hash}
        />
''',
)

investor = "app/components/InvestorHouseSidebar.tsx"
replace_once(investor, '''  const houseHref = user ? "/app" : "/";
''', "")
replace_once(investor, '''        to={houseHref}
''', '''        to="/"
''')

replace_once(
    "app/components/PublicFooter.tsx",
    '''            <span className="footer-brand">
              <img
                src="/assets/optimized/akari-logo.webp"
                alt="AKARI"
                width={360}
                height={117}
                loading="lazy"
              />
              <span>House</span>
            </span>
''',
    '''            <Link
              className="footer-brand"
              to="/"
              aria-label="AKARI House home"
            >
              <img
                src="/assets/optimized/akari-logo.webp"
                alt="AKARI"
                width={360}
                height={117}
                loading="lazy"
              />
              <span>House</span>
            </Link>
''',
)

Path("tests/profile-score-navigation.test.ts").write_text('''import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync("app/routes/dashboard.tsx", "utf8");
const houseSidebar = readFileSync(
  "app/components/HouseWorkspaceSidebar.tsx",
  "utf8",
);
const investorSidebar = readFileSync(
  "app/components/InvestorHouseSidebar.tsx",
  "utf8",
);
const siteHeader = readFileSync("app/components/SiteHeader.tsx", "utf8");
const authLayout = readFileSync("app/layouts/AuthLayout.tsx", "utf8");
const publicFooter = readFileSync("app/components/PublicFooter.tsx", "utf8");

describe("profile score and AKARI navigation consistency", () => {
  it("accepts the complete XScore scale in the browser and server action", () => {
    expect(dashboard).toContain("xScore > 1_000");
    expect(dashboard).toContain("sorsaScore > 100");
    expect(dashboard).toContain("max={1_000}");
    expect(dashboard).toContain('placeholder="0 to 1,000"');
    expect(dashboard).toContain('errorCode: "reputation" as const');
    expect(dashboard).toContain('actionData.errorCode === "reputation"');
  });

  it("uses the URL hash so only the correct sidebar destination is active", () => {
    expect(houseSidebar).toContain(
      "function isActive(pathname: string, hash: string, item: WorkspaceItem)",
    );
    expect(houseSidebar).toContain(
      "if (itemHash) return pathname === path && hash === `#${itemHash}`",
    );
    expect(houseSidebar).toContain(
      'if (item.exact) return pathname === path && hash === ""',
    );
    expect(siteHeader).toContain("hash={location.hash}");
  });

  it("makes every AKARI brand mark return to the public House home", () => {
    expect(houseSidebar).toContain('className="house-workspace-sidebar-brand"');
    expect(houseSidebar).toContain('to="/"');
    expect(investorSidebar).toContain(
      'className="investor-house-sidebar-brand"',
    );
    expect(investorSidebar).toContain('to="/"');
    expect(siteHeader).toContain('className="wordmark"');
    expect(siteHeader).toContain('to="/"');
    expect(authLayout).toContain('className="auth-brand" to="/"');
    expect(publicFooter).toContain('className="footer-brand"');
    expect(publicFooter).toContain('aria-label="AKARI House home"');
  });
});
''')
