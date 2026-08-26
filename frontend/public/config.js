// Runtime API base URL. Overwritten at container start on Railway (see docker-entrypoint.sh).
// Leave empty to use same-origin requests (nginx proxies /reconcile, /health, etc. to the backend).
window.__RECONMINT_CONFIG__ = window.__RECONMINT_CONFIG__ || { apiBaseUrl: "" };
