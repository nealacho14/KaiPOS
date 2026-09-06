import {
  DEFAULT_MURA_IMAGE_BASE_URL,
  MURA_ADMIN_USER_ID,
  buildMuraDocuments,
} from '../src/db/seed-data/mura-menu.js';

// Dumps the Mura seed as deterministic JSON on stdout — the fixture handed to
// the external app "Ferna". No DB connection, no logger output: only the JSON
// goes to stdout so it can be piped straight into a file or `jq`.
//
//   pnpm --filter @kaipos/backend menu:export > mura-menu.json
//
// `MURA_IMAGE_BASE_URL` overrides the CDN base used for `imageUrl`.

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

const documents = buildMuraDocuments({
  now: FIXED_NOW,
  imageBaseUrl: (process.env.MURA_IMAGE_BASE_URL ?? DEFAULT_MURA_IMAGE_BASE_URL).replace(
    /\/+$/,
    '',
  ),
  createdBy: MURA_ADMIN_USER_ID,
});

// Dates serialize as ISO strings through `Date.prototype.toJSON`.
process.stdout.write(`${JSON.stringify(documents, null, 2)}\n`);
