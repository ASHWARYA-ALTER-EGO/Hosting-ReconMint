#!/bin/sh
set -e

PORT="${PORT:-8080}"
BACKEND_URL="${BACKEND_URL:?Set BACKEND_URL to your Railway backend URL, e.g. https://reconmint-api.up.railway.app}"
# Strip trailing slash so nginx proxy_pass behaves predictably.
BACKEND_URL="${BACKEND_URL%/}"

# Optional override: set API_BASE_URL to call the backend directly (skip nginx proxy).
# Leave unset (default) so the browser uses same-origin requests proxied by nginx.
API_BASE="${API_BASE_URL:-}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__RECONMINT_CONFIG__ = { apiBaseUrl: "${API_BASE}" };
EOF

export PORT BACKEND_URL
envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'
