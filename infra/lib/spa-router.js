// CloudFront Function (NOT Node.js / Lambda) — runs at the edge during
// VIEWER_REQUEST. The runtime is a constrained ECMAScript subset (cloudfront-js
// 2.0): no `let`/`const` rules, no module imports, no async, no fetch, ~1ms
// budget. Keep this file dependency-free and side-effect-free.
//
// Why this exists: the SPA uses client-side routing, so deep links like
// `/dashboard/products/123` must serve `/index.html` for React Router to
// take over. We attach this function only to the frontend behavior — the
// `/api/*` behavior must propagate Lambda 4xx responses untouched.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  // Anything ending in a file extension (.js, .css, .ico, .png, ...) is a
  // real asset and must hit S3 as-is — let S3 return 404 if it is missing.
  // Everything else is treated as a client-side route and rewritten so the
  // SPA boots from /index.html and React Router picks up the URL.
  if (!/\.[a-zA-Z0-9]+$/.test(uri)) {
    request.uri = '/index.html';
  }
  return request;
}
