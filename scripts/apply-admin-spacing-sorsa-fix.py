from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    source = file_path.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:80]!r}")
    file_path.write_text(source.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    file_path = Path(path)
    source = file_path.read_text()
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.MULTILINE)
    if count != 1:
        raise SystemExit(f"Expected one regex match in {path}, found {count}: {pattern}")
    file_path.write_text(updated)


# Sorsa is an open-ended reputation score. Keep finite/non-negative validation,
# but do not impose the previous 100-point ceiling.
regex_once(
    "app/routes/dashboard.tsx",
    r"\(sorsaScore !== null &&\s*\(!Number\.isFinite\(sorsaScore\) \|\| sorsaScore < 0 \|\| sorsaScore > 100\)\)",
    "(sorsaScore !== null &&\n      (!Number.isFinite(sorsaScore) || sorsaScore < 0))",
)
replace_once(
    "app/routes/dashboard.tsx",
    '"XScore must be between 0 and 1,000. Sorsa score must be between 0 and 100.",',
    '"XScore must be between 0 and 1,000. Sorsa score must be zero or higher.",',
)
regex_once(
    "app/routes/dashboard.tsx",
    r'(name="sorsaScore"[\s\S]{0,240}?min=\{0\}\n)\s*max=\{100\}\n',
    r"\1",
)
replace_once(
    "app/routes/dashboard.tsx",
    '''                    placeholder="0 to 100"
                  />
                </label>''',
    '''                    placeholder="0 or higher"
                    aria-describedby="sorsa-score-help"
                  />
                  <small id="sorsa-score-help">
                    Enter the current Sorsa score. Values can exceed 100.
                  </small>
                </label>''',
)

# Give the operations route its own spacing hook, then apply one consistent gap
# between direct major sections so adjacent panel borders never merge.
replace_once(
    "app/routes/admin-operations.tsx",
    '<main id="main-content" className="admin-main">',
    '<main id="main-content" className="admin-main admin-operations-main">',
)
replace_once(
    "app/root.tsx",
    'import "./styles/house-workspace-polish.css";\n',
    'import "./styles/house-workspace-polish.css";\nimport "./styles/admin-operations-spacing.css";\n',
)

Path("app/styles/admin-operations-spacing.css").write_text(
    '''/* Route-specific rhythm for the superadmin operations overview. */
.admin-operations-main > section + section {
  margin-top: var(--app-section-gap);
}

@media (max-width: 720px) {
  .admin-operations-main > section + section {
    margin-top: 1rem;
  }
}
'''
)

# Update the score regression and add a focused visual-spacing regression.
replace_once(
    "tests/profile-score-navigation.test.ts",
    '    expect(dashboard).toContain("sorsaScore > 100");\n',
    '    expect(dashboard).not.toContain("sorsaScore > 100");\n',
)
replace_once(
    "tests/profile-score-navigation.test.ts",
    "    expect(dashboard).toContain('placeholder=\"0 to 1,000\"');\n",
    "    expect(dashboard).toContain('placeholder=\"0 to 1,000\"');\n    expect(dashboard).toContain('placeholder=\"0 or higher\"');\n    expect(dashboard).toContain(\"Values can exceed 100.\");\n",
)

Path("tests/admin-operations-spacing.test.ts").write_text(
    '''import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/routes/admin-operations.tsx", "utf8");
const styles = readFileSync(
  "app/styles/admin-operations-spacing.css",
  "utf8",
);
const root = readFileSync("app/root.tsx", "utf8");

describe("admin operations section rhythm", () => {
  it("keeps direct operations panels visually separated", () => {
    expect(route).toContain("admin-main admin-operations-main");
    expect(styles).toContain(
      ".admin-operations-main > section + section",
    );
    expect(styles).toContain("margin-top: var(--app-section-gap)");
    expect(root).toContain(
      'import "./styles/admin-operations-spacing.css";',
    );
  });
});
'''
)
