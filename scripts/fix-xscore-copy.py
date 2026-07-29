from pathlib import Path

path = Path("app/routes/dashboard.tsx")
source = path.read_text()
old = "Enter your current XScore on its 0–1,000 scale."
new = "Enter your current XScore on its 0 to 1,000 scale."

if new in source:
    raise SystemExit(0)
if source.count(old) != 1:
    raise SystemExit(f"Expected one XScore help-text match, found {source.count(old)}")
path.write_text(source.replace(old, new, 1))
