import { useEffect, useRef } from 'react';

export interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  minLength?: number;
  maxIntervalMs?: number;
  terminator?: string;
}

const DEFAULTS = {
  minLength: 6,
  maxIntervalMs: 30,
  terminator: 'Enter',
};

const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'AltGraph',
  'Fn',
  'FnLock',
  'Hyper',
  'Super',
  'Symbol',
  'SymbolLock',
]);

// HID barcode-scanner heuristic. A handheld scanner emits a tight burst of
// keystrokes (each `keydown` arriving within `maxIntervalMs` of the previous
// one) terminated by `Enter`. Anything that doesn't fit that pattern resets
// the buffer.
//
// Intentionally side-effect-only — the calling component is responsible for
// keeping `onScan` ref-stable (memoize it).
export function useBarcodeScanner(options: UseBarcodeScannerOptions): void {
  const {
    onScan,
    minLength = DEFAULTS.minLength,
    maxIntervalMs = DEFAULTS.maxIntervalMs,
    terminator = DEFAULTS.terminator,
  } = options;

  // Stash the latest callback / options on a ref so we don't have to
  // re-attach the keydown listener every render.
  const cfgRef = useRef({ onScan, minLength, maxIntervalMs, terminator });
  useEffect(() => {
    cfgRef.current = { onScan, minLength, maxIntervalMs, terminator };
  }, [onScan, minLength, maxIntervalMs, terminator]);

  useEffect(() => {
    let buffer = '';
    let lastEventTs = 0;

    function reset() {
      buffer = '';
      lastEventTs = 0;
    }

    function handler(event: KeyboardEvent) {
      const cfg = cfgRef.current;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const isScannerTarget = target?.dataset?.scannerTarget === 'true';

      // Ignore typing in any input that isn't the search field. The search
      // field opts in via `data-scanner-target="true"`; we still consume the
      // scan there. Note the first keystroke of a burst is allowed through so
      // manual typing keeps working — the calling component clears the field
      // on a successful scan (see lines 103–112).
      if (isField && !isScannerTarget) {
        reset();
        return;
      }

      // Modifier-only events (Shift, Alt, Control, Meta, CapsLock, etc.)
      // aren't useful for the barcode buffer and must not reset it — scanners
      // emitting uppercase ASCII send `Shift` between burst characters, and
      // resetting on that would truncate every shifted scan mid-burst.
      if (event.key.length === 0 || MODIFIER_KEYS.has(event.key)) return;

      const now = event.timeStamp || performance.now();
      const sinceLast = now - lastEventTs;

      if (event.key === cfg.terminator) {
        // Terminator only counts if it's part of an active burst.
        if (
          buffer.length >= cfg.minLength &&
          (lastEventTs === 0 || sinceLast <= cfg.maxIntervalMs * 4)
        ) {
          const code = buffer;
          // Always consume the Enter so the surrounding form / autofocused
          // search field doesn't react to it.
          event.preventDefault();
          event.stopPropagation();
          reset();
          cfg.onScan(code);
          return;
        }
        reset();
        return;
      }

      // Single-char printable keys feed the buffer; everything else resets it.
      if (event.key.length !== 1) {
        reset();
        return;
      }

      if (lastEventTs > 0 && sinceLast > cfg.maxIntervalMs) {
        // Slower than a scanner — the user is typing. Start over with this
        // character as the seed of a potential new burst.
        buffer = event.key;
        lastEventTs = now;
        return;
      }

      // Inside scanner-aware fields we only swallow when we're confidently in
      // a fast burst — i.e. the previous keystroke landed within
      // `maxIntervalMs`. The very first keystroke (or any "slow" follow-up)
      // is allowed through so manual typing still feeds the input. The
      // calling component clears the field after a successful scan so the
      // first character of the burst doesn't linger.
      if (isScannerTarget && lastEventTs > 0 && sinceLast <= cfg.maxIntervalMs) {
        event.preventDefault();
        event.stopPropagation();
      }

      buffer += event.key;
      lastEventTs = now;
    }

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
    // Configuration values are read off the ref so we don't need to listen
    // for option changes — re-attaching the global listener mid-session would
    // drop in-flight bursts.
  }, []);
}
