// Kitchen Display System — dark, high-contrast, color-coded ticket wall

function KDSDisplay() {
  const t = window.posTokens;
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const tickets = [
    {
      id: '0042',
      table: 'T14',
      server: 'MK',
      state: 'fired',
      firedAt: now - 18_000,
      sla: 600,
      items: [
        { qty: 2, name: 'Bun pho', mods: ['extra lime'] },
        { qty: 1, name: 'Sourdough grilled cheese', mods: [] },
        { qty: 1, name: 'Sparkling water (btl)', mods: [] },
      ],
    },
    {
      id: '0041',
      table: 'Pickup',
      server: 'AL',
      state: 'cooking',
      firedAt: now - 222_000,
      sla: 600,
      items: [
        { qty: 1, name: 'Spicy ramen', mods: ['no egg', 'soft noodle'] },
        { qty: 2, name: 'Edamame', mods: [] },
      ],
    },
    {
      id: '0040',
      table: 'T6',
      server: 'AL',
      state: 'cooking',
      firedAt: now - 340_000,
      sla: 600,
      items: [
        { qty: 4, name: 'Flat white', mods: [] },
        { qty: 2, name: 'Almond croissant', mods: ['warmed'] },
      ],
    },
    {
      id: '0039',
      table: 'Pickup',
      server: 'MK',
      state: 'overdue',
      firedAt: now - 552_000,
      sla: 360,
      items: [{ qty: 2, name: 'Banh mi', mods: ['no cilantro', 'ALLERGY: peanut'] }],
    },
    {
      id: '0038',
      table: 'T3',
      server: 'JN',
      state: 'ready',
      firedAt: now - 48_000,
      sla: 600,
      readyAt: now - 6_000,
      items: [
        { qty: 1, name: 'Affogato', mods: [] },
        { qty: 2, name: 'Canelé', mods: [] },
      ],
    },
    {
      id: '0037',
      table: 'T9',
      server: 'JN',
      state: 'ready',
      firedAt: now - 60_000,
      sla: 600,
      readyAt: now - 12_000,
      items: [{ qty: 3, name: 'Iced oat latte', mods: ['1x decaf'] }],
    },
  ];

  return (
    <div
      data-touch-surface
      style={{
        width: '100%',
        height: '100%',
        background: '#0A0A09',
        fontFamily: t.sans,
        color: '#F7F7F5',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '16px 24px',
          borderBottom: '1px solid rgba(247,247,245,.1)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 650,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: '#9A9A93',
          }}
        >
          Kitchen · Hot line
        </div>
        <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-0.005em' }}>
          6 on the pass · <span style={{ color: '#E5484D' }}>1 overdue</span>
        </div>
        <div style={{ flex: 1 }} />
        <StatPill label="FIRED" count={1} color="#3B82F6" />
        <StatPill label="COOKING" count={2} color="#E8833A" />
        <StatPill label="READY" count={2} color="#2FA84F" />
        <StatPill label="OVERDUE" count={1} color="#E5484D" />
      </div>

      {/* Ticket wall */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
          alignContent: 'start',
        }}
      >
        {tickets.map((tk) => (
          <Ticket key={tk.id} tk={tk} now={now} />
        ))}
      </div>
    </div>
  );
}

function StatPill({ label, count, color }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        background: 'rgba(247,247,245,.04)',
        border: `1px solid ${color}55`,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 11, fontWeight: 650, letterSpacing: '.08em', color: '#C4C4BE' }}>
        {label}
      </span>
      <span
        style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 14, fontWeight: 700, color }}
      >
        {count}
      </span>
    </div>
  );
}

function Ticket({ tk, now }) {
  const stateColors = {
    fired: { border: '#3B82F6', label: 'FIRED' },
    cooking: { border: '#E8833A', label: 'COOKING' },
    ready: { border: '#2FA84F', label: 'READY' },
    overdue: { border: '#E5484D', label: 'OVERDUE' },
  }[tk.state];
  const elapsed = Math.floor((now - tk.firedAt) / 1000);
  const mm = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0');
  const ss = (elapsed % 60).toString().padStart(2, '0');
  const pct = Math.min(1, elapsed / tk.sla);
  const isOverdue = tk.state === 'overdue';

  return (
    <div
      style={{
        background: '#1E1E1B',
        border: `2px solid ${stateColors.border}`,
        borderRadius: 14,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: isOverdue ? `0 0 24px ${stateColors.border}55` : 'none',
        animation: isOverdue ? 'kdsFlash 1.2s ease-in-out infinite alternate' : 'none',
        position: 'relative',
      }}
    >
      <style>{`@keyframes kdsFlash { from{box-shadow:0 0 0 0 rgba(229,72,77,0)} to{box-shadow:0 0 28px 2px rgba(229,72,77,.6)} }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: '"JetBrains Mono",monospace', fontWeight: 700, fontSize: 17 }}>
            #{tk.id}
          </div>
          <div style={{ fontSize: 11, color: '#9A9A93', fontWeight: 600, letterSpacing: '.04em' }}>
            {tk.table} · {tk.server}
          </div>
        </div>
        <div
          style={{
            fontFamily: '"JetBrains Mono",monospace',
            fontWeight: 700,
            fontSize: isOverdue ? 22 : 18,
            color: isOverdue ? stateColors.border : '#F7F7F5',
            letterSpacing: '-0.01em',
          }}
        >
          {mm}:{ss}
        </div>
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
        {tk.items.map((it, i) => (
          <div key={i}>
            <div style={{ display: 'flex', gap: 10, fontSize: 15, lineHeight: 1.3 }}>
              <span
                style={{
                  fontFamily: '"JetBrains Mono",monospace',
                  fontWeight: 700,
                  color: '#E8833A',
                  minWidth: 24,
                }}
              >
                {it.qty}×
              </span>
              <span style={{ fontWeight: 550 }}>{it.name}</span>
            </div>
            {it.mods.map((m, j) => {
              const isAllergy = m.startsWith('ALLERGY');
              return (
                <div
                  key={j}
                  style={{
                    fontSize: 12,
                    marginLeft: 34,
                    fontWeight: 600,
                    color: isAllergy ? '#E5484D' : '#C4C4BE',
                    textTransform: isAllergy ? 'uppercase' : 'none',
                    letterSpacing: isAllergy ? '.04em' : 0,
                  }}
                >
                  · {m}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* SLA bar */}
      <div style={{ marginTop: 'auto' }}>
        <div
          style={{
            height: 3,
            background: 'rgba(247,247,245,.1)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              background: stateColors.border,
              transition: 'width .5s linear',
            }}
          />
        </div>
      </div>

      {/* Action */}
      <button
        style={{
          appearance: 'none',
          cursor: 'pointer',
          border: 0,
          width: '100%',
          minHeight: 48,
          marginTop: 4,
          borderRadius: 10,
          background: tk.state === 'ready' ? '#2FA84F' : 'rgba(247,247,245,.08)',
          color: tk.state === 'ready' ? '#0A0A09' : '#F7F7F5',
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 650,
          letterSpacing: '.02em',
          textTransform: 'uppercase',
        }}
      >
        {tk.state === 'fired' && '▶ Start cooking'}
        {tk.state === 'cooking' && '✓ Mark ready'}
        {tk.state === 'ready' && '🛎 Bump to served'}
        {tk.state === 'overdue' && '✓ Mark ready now'}
      </button>
    </div>
  );
}

Object.assign(window, { KDSDisplay });
