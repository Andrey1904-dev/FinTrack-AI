#!/usr/bin/env bash
# Reproducible pre-deploy checks. This script never creates a second git history,
# force-pushes to main, or bypasses the branch/PR workflow.
set -euo pipefail

node build.mjs
node tests/static.mjs
node tests/telegram.mjs
git diff --check

cat <<'MSG'
Build and static checks passed.
Deploy the committed files through the configured static-hosting pipeline.
Do not publish secrets or backend service-role credentials in this repository.
MSG
