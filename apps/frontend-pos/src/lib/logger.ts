// Thin browser-side logger so call sites never use `console.log` directly
// (the project lint rule bans it). We route through `console.warn` because
// Vite's dev tooling preserves it and Pino-style structured logging is only
// meaningful server-side. Replace with a richer transport (Sentry / Datadog)
// once the POS gains a frontend observability stack.
type LogPayload = Record<string, unknown>;

function log(level: 'info' | 'warn' | 'error', msg: string, ctx?: LogPayload): void {
  const args: unknown[] = ctx ? [`[pos] ${msg}`, ctx] : [`[pos] ${msg}`];
  // eslint-disable-next-line no-console -- intentional single chokepoint; see file header.
  console.warn(`[${level}]`, ...args);
}

export const logger = {
  info: (msg: string, ctx?: LogPayload) => log('info', msg, ctx),
  warn: (msg: string, ctx?: LogPayload) => log('warn', msg, ctx),
  error: (msg: string, ctx?: LogPayload) => log('error', msg, ctx),
};
