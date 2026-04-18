// POS Terminal — checkout screen
// Menu grid + running cart + total + payment CTA

const posTokens = {
  teal500: '#0B7A75',
  teal600: '#086560',
  teal700: '#06504C',
  teal50: '#E6F2F1',
  tealSoft: 'rgba(11,122,117,.1)',
  amber400: '#E8833A',
  amber700: '#8A4514',
  red500: '#CE2C31',
  redSoft: 'rgba(206,44,49,.1)',
  green500: '#1F8A3D',
  greenSoft: 'rgba(31,138,61,.12)',
  slate0: '#FFFFFF',
  slate50: '#F7F7F5',
  slate100: '#EEEEEB',
  slate200: '#DEDEDA',
  slate300: '#C4C4BE',
  slate400: '#9A9A93',
  slate500: '#6E6E67',
  slate600: '#4E4E48',
  slate700: '#383833',
  slate900: '#141412',
  sans: '"Inter",-apple-system,BlinkMacSystemFont,sans-serif',
  mono: '"JetBrains Mono",monospace',
};

const MENU = {
  Coffee: [
    { id: 1, name: 'Espresso', price: 3.5 },
    { id: 2, name: 'Flat White', price: 4.75 },
    { id: 3, name: 'Cortado', price: 4.25 },
    { id: 4, name: 'Cappuccino', price: 4.5 },
    { id: 5, name: 'Iced Oat Latte', price: 5.5 },
    { id: 6, name: 'Cold Brew', price: 5.0 },
  ],
  Food: [
    { id: 10, name: 'Avocado Toast', price: 12.0 },
    { id: 11, name: 'Grilled Cheese', price: 11.5 },
    { id: 12, name: 'Seasonal Tart', price: 6.0 },
    { id: 13, name: 'Bun Pho', price: 16.5, hot: true },
    { id: 14, name: 'Banh Mi', price: 13.0 },
    { id: 15, name: 'Kimchi Bowl', price: 14.0 },
  ],
  Pastry: [
    { id: 20, name: 'Almond Croissant', price: 4.75 },
    { id: 21, name: 'Pain au Chocolat', price: 4.25 },
    { id: 22, name: 'Morning Bun', price: 4.5 },
    { id: 23, name: 'Canelé', price: 3.75 },
  ],
  Drinks: [
    { id: 30, name: 'Sparkling Water', price: 3.5 },
    { id: 31, name: 'Fresh OJ', price: 6.0 },
    { id: 32, name: 'Kombucha', price: 5.5 },
  ],
};

function POSTerminal() {
  const [cat, setCat] = React.useState('Coffee');
  const [cart, setCart] = React.useState([
    { id: 2, name: 'Flat White', price: 4.75, qty: 2 },
    { id: 10, name: 'Avocado Toast', price: 12.0, qty: 1, mods: ['+ egg'] },
    { id: 13, name: 'Bun Pho', price: 16.5, qty: 1, mods: ['no cilantro', 'extra lime'] },
  ]);

  const add = (item) => {
    setCart((c) => {
      const i = c.findIndex((x) => x.id === item.id && !x.mods);
      if (i >= 0) {
        const next = [...c];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...c, { ...item, qty: 1 }];
    });
  };
  const inc = (idx, d) => {
    setCart((c) => {
      const n = [...c];
      const q = n[idx].qty + d;
      if (q <= 0) return c.filter((_, i) => i !== idx);
      n[idx] = { ...n[idx], qty: q };
      return n;
    });
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = subtotal * 0.08875;
  const total = subtotal + tax;

  return (
    <div
      data-touch-surface
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '1fr 420px',
        fontFamily: posTokens.sans,
        background: posTokens.slate50,
        color: posTokens.slate900,
        fontSize: 14,
      }}
    >
      {/* LEFT — menu */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '16px 24px',
            background: posTokens.slate0,
            borderBottom: `1px solid rgba(20,20,18,.09)`,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: posTokens.teal500,
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            k
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.005em' }}>
              Order #A7F2–0042
            </div>
            <div style={{ fontSize: 12, color: posTokens.slate500, fontFamily: posTokens.mono }}>
              Table 14 · Server MK · 7:42 pm
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button style={tileBtnStyle(false, true)}>✕ Clear</button>
        </div>

        {/* Category tabs */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '12px 24px',
            background: posTokens.slate0,
            borderBottom: `1px solid rgba(20,20,18,.09)`,
          }}
        >
          {Object.keys(MENU).map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              style={{
                appearance: 'none',
                border: 0,
                cursor: 'pointer',
                padding: '10px 18px',
                minHeight: 44,
                borderRadius: 10,
                fontFamily: 'inherit',
                fontSize: 15,
                fontWeight: 600,
                background: cat === c ? posTokens.teal500 : 'transparent',
                color: cat === c ? '#fff' : posTokens.slate600,
                transition: 'background .12s',
              }}
            >
              {c}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <input
            placeholder="Search menu…"
            style={{
              padding: '0 14px',
              minHeight: 44,
              width: 220,
              borderRadius: 10,
              border: `1px solid rgba(20,20,18,.09)`,
              fontFamily: 'inherit',
              fontSize: 14,
              background: posTokens.slate50,
            }}
          />
        </div>

        {/* Menu grid */}
        <div
          style={{
            padding: 24,
            overflow: 'auto',
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            alignContent: 'start',
          }}
        >
          {MENU[cat].map((item) => (
            <button
              key={item.id}
              onClick={() => add(item)}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                background: posTokens.slate0,
                border: `1px solid rgba(20,20,18,.09)`,
                borderRadius: 10,
                padding: 16,
                minHeight: 110,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                fontFamily: 'inherit',
                color: 'inherit',
                boxShadow: '0 1px 2px rgba(15,23,23,.06)',
                transition: 'box-shadow .12s, transform .08s',
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{item.name}</div>
                {item.hot && (
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: 6,
                      fontSize: 10,
                      fontWeight: 650,
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      color: posTokens.amber700,
                      background: 'rgba(232,131,58,.15)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    Popular
                  </span>
                )}
              </div>
              <div
                style={{
                  fontFamily: posTokens.mono,
                  fontWeight: 700,
                  fontSize: 16,
                  color: posTokens.slate900,
                }}
              >
                ${item.price.toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT — cart */}
      <div
        style={{
          background: posTokens.slate0,
          borderLeft: `1px solid rgba(20,20,18,.09)`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '18px 20px', borderBottom: `1px solid rgba(20,20,18,.09)` }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 650,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: posTokens.slate500,
            }}
          >
            Current order
          </div>
          <div style={{ fontSize: 19, fontWeight: 650, marginTop: 2, letterSpacing: '-0.005em' }}>
            Table 14 · 4 guests
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '12px 8px' }}>
          {cart.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                padding: '12px',
                gap: 10,
                borderRadius: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 }}>{item.name}</div>
                {item.mods?.map((m, i) => (
                  <div key={i} style={{ fontSize: 12, color: posTokens.slate500, marginTop: 2 }}>
                    · {m}
                  </div>
                ))}
                <div
                  style={{
                    fontFamily: posTokens.mono,
                    fontSize: 12,
                    color: posTokens.slate500,
                    marginTop: 4,
                  }}
                >
                  ${item.price.toFixed(2)} ea
                </div>
              </div>
              <div
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}
              >
                <div
                  style={{
                    fontFamily: posTokens.mono,
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  ${(item.price * item.qty).toFixed(2)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={() => inc(idx, -1)} style={qtyBtnStyle}>
                    −
                  </button>
                  <span
                    style={{
                      fontFamily: posTokens.mono,
                      fontWeight: 600,
                      minWidth: 24,
                      textAlign: 'center',
                    }}
                  >
                    {item.qty}
                  </span>
                  <button onClick={() => inc(idx, 1)} style={qtyBtnStyle}>
                    +
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div style={{ padding: 12, borderTop: `1px dashed rgba(20,20,18,.12)`, marginTop: 8 }}>
            <button
              style={{
                width: '100%',
                appearance: 'none',
                cursor: 'pointer',
                padding: '10px',
                minHeight: 40,
                borderRadius: 8,
                background: 'transparent',
                color: posTokens.teal600,
                border: `1.5px dashed ${posTokens.teal500}`,
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              + Add modifier / note
            </button>
          </div>
        </div>

        {/* Totals + CTA */}
        <div
          style={{
            padding: 20,
            borderTop: `1px solid rgba(20,20,18,.09)`,
            background: posTokens.slate50,
          }}
        >
          <Row label="Subtotal" value={subtotal} />
          <Row label="Tax (8.875%)" value={tax} />
          <div style={{ borderTop: `1px solid rgba(20,20,18,.09)`, margin: '10px 0 8px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, fontWeight: 650 }}>Total</span>
            <span
              style={{
                fontFamily: posTokens.mono,
                fontWeight: 700,
                fontSize: 28,
                letterSpacing: '-0.01em',
              }}
            >
              ${total.toFixed(2)}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <button style={outlineBtnStyle}>Hold</button>
            <button style={outlineBtnStyle}>Split</button>
          </div>
          <button
            style={{
              width: '100%',
              marginTop: 10,
              minHeight: 56,
              borderRadius: 10,
              border: 0,
              cursor: 'pointer',
              background: posTokens.teal500,
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: 17,
              fontWeight: 650,
              letterSpacing: '.01em',
              boxShadow: '0 2px 4px rgba(15,23,23,.05)',
            }}
          >
            Charge ${total.toFixed(2)} →
          </button>
          <button
            style={{
              width: '100%',
              marginTop: 6,
              minHeight: 44,
              borderRadius: 10,
              border: 0,
              cursor: 'pointer',
              background: 'transparent',
              color: posTokens.slate600,
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Send to kitchen without charging
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}
    >
      <span style={{ color: posTokens.slate600 }}>{label}</span>
      <span style={{ fontFamily: posTokens.mono, fontWeight: 550 }}>${value.toFixed(2)}</span>
    </div>
  );
}

const qtyBtnStyle = {
  appearance: 'none',
  cursor: 'pointer',
  border: `1px solid rgba(20,20,18,.12)`,
  width: 28,
  height: 28,
  borderRadius: 6,
  background: '#fff',
  fontFamily: 'inherit',
  fontSize: 16,
  fontWeight: 600,
  display: 'grid',
  placeItems: 'center',
};
const outlineBtnStyle = {
  appearance: 'none',
  cursor: 'pointer',
  minHeight: 44,
  borderRadius: 10,
  background: '#fff',
  border: `1.5px solid rgba(20,20,18,.12)`,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
};
function tileBtnStyle(active, danger) {
  return {
    appearance: 'none',
    cursor: 'pointer',
    padding: '8px 14px',
    minHeight: 36,
    borderRadius: 8,
    border: 0,
    background: danger ? 'rgba(206,44,49,.08)' : 'transparent',
    color: danger ? posTokens.red500 : posTokens.slate600,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
  };
}

Object.assign(window, { POSTerminal, posTokens });
