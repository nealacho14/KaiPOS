// Table Floor Plan — admin/host view

function FloorPlan() {
  const t = window.posTokens;
  const tables = [
    // pos: x/y in % of canvas, shape, seats, state
    { id: 1, x: 10, y: 14, seats: 2, state: 'open', label: 'T1' },
    { id: 2, x: 24, y: 14, seats: 2, state: 'seated', label: 'T2', guests: 2, tot: 38.5, time: 22 },
    {
      id: 3,
      x: 38,
      y: 14,
      seats: 4,
      state: 'ordered',
      label: 'T3',
      guests: 3,
      tot: 62.0,
      time: 14,
    },
    { id: 4, x: 56, y: 14, seats: 6, state: 'open', label: 'T4', big: true },
    { id: 5, x: 78, y: 14, seats: 4, state: 'ready', label: 'T5', guests: 4, tot: 84.25, time: 31 },

    { id: 6, x: 10, y: 42, seats: 2, state: 'paid', label: 'T6', guests: 2, tot: 44.0, time: 58 },
    { id: 7, x: 24, y: 42, seats: 2, state: 'seated', label: 'T7', guests: 2, tot: 12.0, time: 4 },
    {
      id: 8,
      x: 42,
      y: 42,
      seats: 8,
      state: 'ordered',
      label: 'T8',
      guests: 7,
      tot: 247.8,
      time: 26,
      big: true,
      xl: true,
    },
    {
      id: 9,
      x: 68,
      y: 42,
      seats: 4,
      state: 'overdue',
      label: 'T9',
      guests: 4,
      tot: 102.5,
      time: 82,
    },
    { id: 10, x: 82, y: 42, seats: 4, state: 'open', label: 'T10' },

    { id: 11, x: 10, y: 72, seats: 2, state: 'reserved', label: 'T11', resAt: '8:15 PM' },
    { id: 12, x: 24, y: 72, seats: 2, state: 'open', label: 'T12' },
    {
      id: 13,
      x: 38,
      y: 72,
      seats: 4,
      state: 'ordered',
      label: 'T13',
      guests: 4,
      tot: 78.0,
      time: 18,
    },
    {
      id: 14,
      x: 56,
      y: 72,
      seats: 6,
      state: 'seated',
      label: 'T14',
      guests: 4,
      tot: 0,
      time: 2,
      big: true,
    },
    { id: 15, x: 78, y: 72, seats: 4, state: 'reserved', label: 'T15', resAt: '8:30 PM' },
  ];

  const states = {
    open: {
      bg: '#FFFFFF',
      fg: t.slate500,
      bd: 'rgba(20,20,18,.15)',
      tagBg: t.slate100,
      tagFg: t.slate600,
    },
    seated: {
      bg: 'rgba(37,99,235,.06)',
      fg: t.slate900,
      bd: 'rgba(37,99,235,.4)',
      tagBg: 'rgba(37,99,235,.12)',
      tagFg: '#1E40AF',
    },
    ordered: {
      bg: 'rgba(232,131,58,.08)',
      fg: t.slate900,
      bd: 'rgba(232,131,58,.5)',
      tagBg: 'rgba(232,131,58,.18)',
      tagFg: '#8A4514',
    },
    ready: {
      bg: 'rgba(31,138,61,.08)',
      fg: t.slate900,
      bd: 'rgba(31,138,61,.5)',
      tagBg: 'rgba(31,138,61,.15)',
      tagFg: '#0F4F22',
    },
    paid: {
      bg: 'rgba(110,110,103,.08)',
      fg: t.slate500,
      bd: 'rgba(20,20,18,.2)',
      tagBg: t.slate100,
      tagFg: t.slate600,
    },
    overdue: {
      bg: 'rgba(206,44,49,.08)',
      fg: t.slate900,
      bd: '#E5484D',
      tagBg: 'rgba(206,44,49,.14)',
      tagFg: '#8E1A1D',
    },
    reserved: {
      bg: '#FFFFFF',
      fg: t.slate700,
      bd: 'rgba(20,20,18,.15)',
      tagBg: t.slate100,
      tagFg: t.slate600,
      dashed: true,
    },
  };

  const counts = tables.reduce((a, x) => ({ ...a, [x.state]: (a[x.state] || 0) + 1 }), {});

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        fontFamily: t.sans,
        background: t.slate50,
        color: t.slate900,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top summary bar */}
      <div
        style={{
          display: 'flex',
          gap: 24,
          padding: '18px 24px',
          background: t.slate0,
          borderBottom: `1px solid rgba(20,20,18,.09)`,
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 650,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: t.slate500,
            }}
          >
            Floor
          </div>
          <div style={{ fontSize: 19, fontWeight: 650, letterSpacing: '-0.005em', marginTop: 2 }}>
            Main dining · Friday service
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <LegendPill label="Open" color="#9A9A93" count={counts.open || 0} />
        <LegendPill label="Seated" color="#2563EB" count={counts.seated || 0} />
        <LegendPill label="Ordered" color="#E8833A" count={counts.ordered || 0} />
        <LegendPill label="Ready" color="#1F8A3D" count={counts.ready || 0} />
        <LegendPill label="Overdue" color="#CE2C31" count={counts.overdue || 0} />
        <LegendPill label="Reserved" color="#6E6E67" count={counts.reserved || 0} />
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', padding: 24 }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            background: t.slate0,
            border: `1px solid rgba(20,20,18,.09)`,
            borderRadius: 14,
            overflow: 'hidden',
            backgroundImage: `linear-gradient(${t.slate100} 1px, transparent 1px), linear-gradient(90deg, ${t.slate100} 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        >
          {/* Zones */}
          <Zone left="6%" top="6%" w="80%" h="24%" label="WINDOW BAR" />
          <Zone left="6%" top="34%" w="80%" h="30%" label="MAIN FLOOR" />
          <Zone left="6%" top="64%" w="80%" h="30%" label="BACK ROOM" />
          {/* Bar/kitchen strip */}
          <div
            style={{
              position: 'absolute',
              right: '2%',
              top: '6%',
              width: '8%',
              height: '88%',
              background: t.slate100,
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '12px 6px',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 650,
                letterSpacing: '.1em',
                color: t.slate500,
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
              }}
            >
              KITCHEN · PASS · BAR
            </div>
          </div>

          {/* Tables */}
          {tables.map((tb) => {
            const s = states[tb.state];
            const w = tb.xl ? 170 : tb.big ? 130 : 110;
            const h = tb.xl ? 100 : tb.big ? 90 : 80;
            return (
              <div
                key={tb.id}
                style={{
                  position: 'absolute',
                  left: `${tb.x}%`,
                  top: `${tb.y}%`,
                  width: w,
                  height: h,
                  background: s.bg,
                  color: s.fg,
                  border: `${s.dashed ? '1.5px dashed' : '2px solid'} ${s.bd}`,
                  borderRadius: tb.seats >= 6 ? 12 : 14,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  boxShadow:
                    tb.state === 'overdue'
                      ? '0 0 0 3px rgba(229,72,77,.15)'
                      : '0 1px 2px rgba(15,23,23,.05)',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span
                    style={{
                      fontFamily: t.mono,
                      fontWeight: 700,
                      fontSize: 15,
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {tb.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 650,
                      letterSpacing: '.05em',
                      color: s.tagFg,
                      background: s.tagBg,
                      padding: '2px 6px',
                      borderRadius: 4,
                      textTransform: 'uppercase',
                    }}
                  >
                    {tb.seats} seat
                  </span>
                </div>

                {tb.state === 'open' && (
                  <div style={{ fontSize: 11, color: t.slate500, fontWeight: 500 }}>
                    Tap to seat
                  </div>
                )}
                {tb.state === 'reserved' && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 650,
                        color: t.slate600,
                        textTransform: 'uppercase',
                        letterSpacing: '.05em',
                      }}
                    >
                      Reserved
                    </div>
                    <div
                      style={{ fontFamily: t.mono, fontSize: 12, color: t.slate600, marginTop: 1 }}
                    >
                      {tb.resAt}
                    </div>
                  </div>
                )}
                {['seated', 'ordered', 'ready', 'paid', 'overdue'].includes(tb.state) && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-end',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 650,
                          color: s.tagFg,
                          textTransform: 'uppercase',
                          letterSpacing: '.05em',
                        }}
                      >
                        {tb.state}
                      </div>
                      <div
                        style={{
                          fontFamily: t.mono,
                          fontSize: 11,
                          color: t.slate500,
                          marginTop: 1,
                        }}
                      >
                        {tb.guests}g · {tb.time}m
                      </div>
                    </div>
                    {tb.tot > 0 && (
                      <div style={{ fontFamily: t.mono, fontWeight: 700, fontSize: 14 }}>
                        ${tb.tot.toFixed(0)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Zone({ left, top, w, h, label }) {
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: w,
        height: h,
        border: `1px dashed rgba(20,20,18,.08)`,
        borderRadius: 8,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 10,
          fontSize: 10,
          fontWeight: 650,
          letterSpacing: '.1em',
          color: 'rgba(20,20,18,.3)',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function LegendPill({ label, color, count }) {
  const t = window.posTokens;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, opacity: 0.9 }} />
      <span style={{ fontSize: 12, fontWeight: 550, color: t.slate600 }}>{label}</span>
      <span style={{ fontFamily: t.mono, fontSize: 12, fontWeight: 700, color: t.slate900 }}>
        {count}
      </span>
    </div>
  );
}

Object.assign(window, { FloorPlan });
