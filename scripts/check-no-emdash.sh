#!/bin/sh
# Fails the build if forbidden dash punctuation sneaks into repo text.
# House rule: commas, colons, parentheses; never typographic dashes.
pattern="$(printf '\342\200\224')|$(printf '\342\200\223')"
matches=$(
  find . \
    \( -path './.git' -o -path './node_modules' -o -path './dist' -o -path './src-tauri/target' \) -prune -o \
    -type f \
    ! -name 'pnpm-lock.yaml' \
    ! -name 'Cargo.lock' \
    ! -name '*.png' \
    ! -name '*.jpg' \
    ! -name '*.jpeg' \
    ! -name '*.gif' \
    ! -name '*.webp' \
    ! -name '*.icns' \
    ! -name '*.ico' \
    ! -name '*.woff2' \
    -print0 |
    xargs -0 grep -InE "$pattern" 2>/dev/null
)
if [ -n "$matches" ]; then
  echo "forbidden dash punctuation found (use comma, colon or parentheses instead):"
  echo "$matches"
  exit 1
fi
exit 0
