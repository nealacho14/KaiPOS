// CloudFront Function for the `/pos/*` behavior (NOT Node.js / Lambda) —
// runs at VIEWER_REQUEST in the cloudfront-js 2.0 runtime: no `let`/`const`
// rules, no module imports, no async, no fetch, ~1ms budget.
//
// Two responsibilities:
//   1. Strip the `/pos` prefix before forwarding to the POS S3 bucket, whose
//      assets are deployed at the bucket root (NOT under a `pos/` prefix).
//      Without this strip, S3 returns 404 for every request.
//   2. SPA fallback: any URI without a file extension is rewritten to
//      `/index.html` so React Router takes over for deep-links like
//      `/pos/select-business`.
//
// The default `/*` behavior has its own SPA router (`spa-router.js`) for the
// admin app, which we deliberately do NOT share — admin assets live at the
// bucket root and need no prefix-stripping.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.indexOf('/pos') === 0) {
    uri = uri.substring(4) || '/';
  }
  if (!/\.[a-zA-Z0-9]+$/.test(uri)) {
    uri = '/index.html';
  }

  request.uri = uri;
  return request;
}
