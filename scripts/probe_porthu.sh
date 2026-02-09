#!/usr/bin/env bash
set -u

BASE_URL="${1:-https://port.hu}"
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

run_step() {
  local title="$1"
  shift
  echo "\n$title"
  if ! "$@"; then
    echo "[WARN] step failed"
  fi
}

run_step "[1/4] Homepage headers" bash -lc "curl -sSI -A '$UA' '$BASE_URL' | sed -n '1,20p'"
run_step "[2/4] robots.txt" bash -lc "curl -sS -A '$UA' '$BASE_URL/robots.txt' | sed -n '1,80p'"
run_step "[3/4] HTML probe (first 120 lines)" bash -lc "curl -sS -A '$UA' '$BASE_URL' | sed -n '1,120p'"
run_step "[4/4] Candidate API hints" bash -lc "curl -sS -A '$UA' '$BASE_URL' | rg -o 'https?://[^\"\x27 ]+|/[a-zA-Z0-9_\-/]+\.(json|js)' | head -n 80"
