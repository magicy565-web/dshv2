#!/bin/sh
set -eu
export DSH_SITES_SERVICES_JSON="$(cat /config/site-services.json)"
export DSH_SITES_AGENT_JSON="$(node -e 'console.log(JSON.stringify({provider:"site-local",model:process.env.SITE_MODEL,requestTimeoutMs:Number(process.env.SITE_MODEL_TIMEOUT_MS||180000)}))')"
if [ -f "$DSH_HOME/profiles/trade/package.json" ]; then
  exec node /app/apps/cli/lib/bin.js --profile trade --patch /app/trade/cordis.patch.yml --patch /app/trade/enterprise/sites/deploy/model.patch.yml --host 0.0.0.0 --port 3080 --no-open
fi
exec node /app/apps/cli/lib/bin.js --profile trade --from-default-profile web --patch /app/trade/cordis.patch.yml --patch /app/trade/enterprise/sites/deploy/model.patch.yml --host 0.0.0.0 --port 3080 --no-open
