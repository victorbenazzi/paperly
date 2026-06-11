#!/bin/sh
# Fails the build if an em-dash or en-dash sneaks into source or locales.
# House rule: commas, colons, parentheses; never typographic dashes.
matches=$(grep -rn --include='*.ts' --include='*.tsx' --include='*.json' --include='*.css' -e '—' -e '–' src/ 2>/dev/null)
if [ -n "$matches" ]; then
  echo "em-dash/en-dash found (use comma, colon or parentheses instead):"
  echo "$matches"
  exit 1
fi
exit 0
