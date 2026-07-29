from pathlib import Path

path = Path("app/routes/dashboard.tsx")
source = path.read_text()
legacy = '''    [xScore, sorsaScore].some(
      (score) =>
        score !== null && (!Number.isFinite(score) || score < 0 || score > 100),
    ) ||
'''

if legacy in source:
    path.write_text(source.replace(legacy, "", 1))
elif "xScore > 1_000" not in source:
    raise SystemExit("Expected the widened XScore validation before removing the legacy cap.")
