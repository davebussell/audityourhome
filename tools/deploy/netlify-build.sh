#!/usr/bin/env bash
# One build command for all three Netlify projects when they deploy from GitHub (linked 2026-11-28).
# Netlify sets SITE_NAME; it decides which site this build publishes. The manual route (netlify.ca.toml /
# netlify.bu.toml copied over netlify.toml in an upload) still works and sets AYH_SITE itself.
set -euo pipefail
if [ -z "${AYH_SITE:-}" ]; then
  case "${SITE_NAME:-}" in
    audityourhome-ca) AYH_SITE=ca ;;
    audityourbuilding) AYH_SITE=bu ;;
    audityourhome) AYH_SITE=us ;;
    *) echo "netlify-build: unknown SITE_NAME '${SITE_NAME:-}'; set AYH_SITE" >&2; exit 1 ;;
  esac
fi
export AYH_SITE FORMS="${FORMS:-netlify}"
npm run build
rm -rf dist-site
cp -r "dist-${AYH_SITE}" dist-site
echo "netlify-build: published dist-${AYH_SITE} for ${SITE_NAME:-local} as dist-site"
