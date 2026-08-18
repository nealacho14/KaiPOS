// CloudFront Function for the `/pos/*` behavior (NOT Node.js / Lambda) —
// runs at VIEWER_REQUEST in the cloudfront-js 2.0 runtime: no `let`/`const`
// rules, no module imports, no async, no fetch, ~1ms budget.
//
// SPA fallback only: any URI without a file extension is rewritten to
// `/pos/index.html` so React Router takes over for deep-links like
// `/pos/select-business`. Asset URIs (`/pos/assets/...`) pass through as-is —
// the POS bucket stores everything under a `pos/` key prefix
// (`destinationKeyPrefix` in the stack), so viewer URIs map 1:1 to S3 keys.
//
// The rewritten URI MUST keep the `/pos` prefix. The URI rewrite happens
// BEFORE the cache lookup and the cache key is the rewritten URI — it does
// not include the behavior or origin. An earlier version stripped the prefix
// and rewrote to `/index.html`, colliding with the admin app's cache entry
// for the same key: whichever index.html an edge cached first was then served
// for BOTH apps.
function handler(event) {
  var request = event.request;

  if (!/\.[a-zA-Z0-9]+$/.test(request.uri)) {
    request.uri = '/pos/index.html';
  }

  return request;
}
