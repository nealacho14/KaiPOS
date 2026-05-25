import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBarcodeScanner } from './useBarcodeScanner.js';

function fireKey(key: string, opts: { target?: EventTarget | null; ts?: number } = {}) {
  const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  if (opts.target) {
    Object.defineProperty(evt, 'target', { value: opts.target });
  }
  if (typeof opts.ts === 'number') {
    Object.defineProperty(evt, 'timeStamp', { value: opts.ts });
  }
  window.dispatchEvent(evt);
  return evt;
}

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires onScan when a fast burst terminates with Enter and meets the min length', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 6, maxIntervalMs: 30 }));

    const code = '012345';
    let ts = 1000;
    for (const ch of code) {
      fireKey(ch, { ts });
      ts += 10;
    }
    fireKey('Enter', { ts: ts + 10 });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('012345');
  });

  it('ignores bursts that fall under the minimum length', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 6, maxIntervalMs: 30 }));

    let ts = 1000;
    for (const ch of 'abc') {
      fireKey(ch, { ts });
      ts += 10;
    }
    fireKey('Enter', { ts: ts + 10 });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('resets the buffer when keystrokes arrive slower than the burst threshold', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 4, maxIntervalMs: 30 }));

    fireKey('a', { ts: 1000 });
    fireKey('b', { ts: 1010 });
    fireKey('c', { ts: 1500 }); // gap > 30 ms → reset; this seeds a new burst
    fireKey('d', { ts: 1510 });
    fireKey('e', { ts: 1520 });
    fireKey('f', { ts: 1530 });
    fireKey('Enter', { ts: 1540 });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('cdef');
  });

  it('ignores keystrokes when the target is an input without the scanner-target opt-in', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 4, maxIntervalMs: 30 }));

    const input = document.createElement('input');
    document.body.appendChild(input);
    let ts = 2000;
    for (const ch of 'abcd') {
      fireKey(ch, { target: input, ts });
      ts += 10;
    }
    fireKey('Enter', { target: input, ts: ts + 10 });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('consumes scans when the target has data-scanner-target="true"', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, minLength: 4, maxIntervalMs: 30 }));

    const input = document.createElement('input');
    input.setAttribute('data-scanner-target', 'true');
    document.body.appendChild(input);

    let ts = 3000;
    for (const ch of 'wxyz') {
      fireKey(ch, { target: input, ts });
      ts += 10;
    }
    fireKey('Enter', { target: input, ts: ts + 10 });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('wxyz');
  });
});
