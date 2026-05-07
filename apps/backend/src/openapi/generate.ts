// Writes `apps/backend/openapi.json` from the registry. Invoked by:
//   pnpm --filter @kaipos/backend openapi:generate
// CI runs the same script and fails if `git diff` reports a change, so the
// committed file always matches the Zod schemas.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateOpenApiDocument } from './registry.js';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, '../../openapi.json');

const document = generateOpenApiDocument();
const json = `${JSON.stringify(document, null, 2)}\n`;

writeFileSync(outputPath, json);

// Use a single line of stdout so CI logs stay terse. Not console.log to keep
// the lint rule (`no-console`) happy — process.stdout is the structured way
// for one-shot scripts that don't go through Pino.
process.stdout.write(`openapi.json written: ${outputPath}\n`);
