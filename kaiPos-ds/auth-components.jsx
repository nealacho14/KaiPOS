// Login & Register screens for kaiPOS
// Two contexts: staff PIN login (for POS terminal) + merchant account login/register (admin web)

const authTokens = {
  teal500: '#0B7A75',
  teal400: '#2E8B85',
  teal600: '#086560',
  teal700: '#06504C',
  teal50: '#E6F2F1',
  tealSoft: 'rgba(11,122,117,.1)',
  amber400: '#E8833A',
  red500: '#CE2C31',
  redSoft: 'rgba(206,44,49,.08)',
  green500: '#1F8A3D',
  slate0: '#FFFFFF',
  slate50: '#F7F7F5',
  slate100: '#EEEEEB',
  slate200: '#DEDEDA',
  slate300: '#C4C4BE',
  slate400: '#9A9A93',
  slate500: '#6E6E67',
  slate600: '#4E4E48',
  slate700: '#383833',
  slate800: '#1E1E1B',
  slate900: '#141412',
  slate950: '#0A0A09',
  sans: '"Inter",-apple-system,BlinkMacSystemFont,sans-serif',
  mono: '"JetBrains Mono",monospace',
  border: 'rgba(20,20,18,.09)',
  borderStrong: 'rgba(20,20,18,.15)',
  shadowXs: '0 1px 2px rgba(15,23,23,.06)',
  shadowSm: '0 2px 4px rgba(15,23,23,.05), 0 2px 6px rgba(15,23,23,.06)',
  shadowLg: '0 8px 16px rgba(15,23,23,.08), 0 16px 32px rgba(15,23,23,.10)',
  shadowXl: '0 16px 32px rgba(15,23,23,.10), 0 32px 64px rgba(15,23,23,.14)',
  focus: '0 0 0 3px rgba(11,122,117,.35)',
};

// ─────────────────────────────────────────────────────────────
// 01 — Staff PIN Login (POS terminal; touch; runs on 1280×800)
// ─────────────────────────────────────────────────────────────
function StaffPinLogin() {
  const t = authTokens;
  const [selected, setSelected] = React.useState(null);
  const [pin, setPin] = React.useState('');
  const [err, setErr] = React.useState(false);

  const staff = [
    { id: 1, name: 'Mika K.', role: 'Manager', color: '#0B7A75', initials: 'MK' },
    { id: 2, name: 'Alex L.', role: 'Barista', color: '#E8833A', initials: 'AL' },
    { id: 3, name: 'Jun N.', role: 'Server', color: '#2563EB', initials: 'JN' },
    { id: 4, name: 'Priya S.', role: 'Server', color: '#1F8A3D', initials: 'PS' },
    { id: 5, name: 'Sam R.', role: 'Barback', color: '#8A4514', initials: 'SR' },
    { id: 6, name: 'Zoe T.', role: 'Kitchen', color: '#4E4E48', initials: 'ZT' },
  ];

  const pad = (d) => {
    if (d === 'back') {
      setPin((p) => p.slice(0, -1));
      setErr(false);
      return;
    }
    if (d === 'clr') {
      setPin('');
      setErr(false);
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setErr(false);
    if (next.length === 4) {
      // fake: any 4-digit pin fails for staff #2 to showcase error state
      if (selected?.id === 2 && next !== '1234') {
        setTimeout(() => {
          setErr(true);
          setPin('');
        }, 300);
      }
    }
  };

  return (
    <div
      data-touch-surface
      style={{
        width: '100%',
        height: '100%',
        fontFamily: t.sans,
        background: t.slate50,
        color: t.slate900,
        display: 'grid',
        gridTemplateColumns: '1fr 460px',
      }}
    >
      {/* LEFT — staff roster */}
      <div style={{ padding: '48px 56px', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: t.teal500,
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            k
          </span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.005em' }}>
              Kaiju Street Kitchen
            </div>
            <div style={{ fontSize: 12, color: t.slate500, fontFamily: t.mono }}>
              Midtown East · Terminal 02
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              padding: '6px 12px',
              borderRadius: 999,
              background: 'rgba(31,138,61,.1)',
              color: '#0F4F22',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.green500 }} />
            Online · synced 3s ago
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            fontWeight: 650,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: t.slate500,
          }}
        >
          Shift start
        </div>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: '8px 0 8px',
            lineHeight: 1.1,
          }}
        >
          Good evening.
          <br />
          Who's on tonight?
        </h1>
        <p style={{ fontSize: 15, color: t.slate600, maxWidth: 480, margin: 0 }}>
          Tap your name, then enter your 4-digit PIN to clock in.
        </p>

        <div
          style={{
            marginTop: 40,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          {staff.map((s) => {
            const sel = selected?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSelected(s);
                  setPin('');
                  setErr(false);
                }}
                style={{
                  appearance: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: sel ? '#fff' : t.slate0,
                  border: sel ? `2px solid ${t.teal500}` : `1px solid ${t.border}`,
                  borderRadius: 12,
                  padding: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontFamily: 'inherit',
                  color: 'inherit',
                  boxShadow: sel ? t.shadowSm : t.shadowXs,
                  transition: 'box-shadow .12s',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: s.color,
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 700,
                    fontSize: 15,
                    letterSpacing: '.02em',
                  }}
                >
                  {s.initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.2 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: t.slate500, marginTop: 2 }}>{s.role}</div>
                </div>
                {sel && (
                  <span style={{ marginLeft: 'auto', color: t.teal500, fontSize: 18 }}>●</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT — PIN pad */}
      <div
        style={{
          background: t.slate0,
          borderLeft: `1px solid ${t.border}`,
          padding: '48px 40px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {selected ? (
          <>
            <div
              style={{
                fontSize: 11,
                fontWeight: 650,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: t.slate500,
              }}
            >
              Signing in
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: selected.color,
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: 17,
                }}
              >
                {selected.initials}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-0.005em' }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: 13, color: t.slate500 }}>{selected.role}</div>
              </div>
            </div>

            {/* PIN dots */}
            <div
              style={{
                margin: '40px auto 20px',
                display: 'flex',
                gap: 18,
                transform: err ? 'translateX(0)' : 'none',
                animation: err ? 'shake .4s ease' : 'none',
              }}
            >
              <style>{`@keyframes shake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-8px)}40%,60%{transform:translateX(8px)}}`}</style>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: pin.length > i ? (err ? t.red500 : t.teal500) : 'transparent',
                    border: `2px solid ${err ? t.red500 : pin.length > i ? t.teal500 : t.borderStrong}`,
                    transition: 'background .15s, border-color .15s',
                  }}
                />
              ))}
            </div>
            <div
              style={{
                textAlign: 'center',
                fontSize: 13,
                fontWeight: 550,
                color: err ? t.red500 : t.slate500,
                minHeight: 20,
              }}
            >
              {err ? 'PIN incorrecto. Intenta de nuevo.' : 'Ingresa tu PIN de 4 dígitos'}
            </div>

            {/* Keypad */}
            <div
              style={{
                marginTop: 24,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'back'].map((k) => (
                <button
                  key={k}
                  onClick={() => pad(k)}
                  style={{
                    appearance: 'none',
                    cursor: 'pointer',
                    border: `1px solid ${t.border}`,
                    background: k === 'back' || k === 'clr' ? 'transparent' : t.slate0,
                    fontFamily: t.mono,
                    fontSize: k.length > 1 ? 13 : 24,
                    fontWeight: k.length > 1 ? 600 : 550,
                    color: k === 'clr' ? t.red500 : t.slate900,
                    minHeight: 64,
                    borderRadius: 12,
                    boxShadow: k.length > 1 ? 'none' : t.shadowXs,
                    letterSpacing: k.length > 1 ? '.02em' : 0,
                    textTransform: k.length > 1 ? 'uppercase' : 'none',
                  }}
                >
                  {k === 'clr' ? 'CLR' : k === 'back' ? '⌫' : k}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSelected(null)}
              style={{
                marginTop: 'auto',
                appearance: 'none',
                cursor: 'pointer',
                border: 0,
                background: 'transparent',
                color: t.slate600,
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                padding: '12px',
                borderRadius: 8,
              }}
            >
              ← Elegir otra persona
            </button>
          </>
        ) : (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              maxWidth: 280,
              color: t.slate500,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                background: t.slate50,
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 20px',
                fontSize: 28,
                border: `1px dashed ${t.borderStrong}`,
              }}
            >
              ◉
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: t.slate700 }}>Elige tu perfil</div>
            <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
              Selecciona tu nombre en el panel izquierdo para ingresar tu PIN.
            </div>
            <div
              style={{
                marginTop: 32,
                padding: 16,
                borderRadius: 10,
                background: t.slate50,
                border: `1px solid ${t.border}`,
                fontSize: 12,
                color: t.slate600,
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 650, color: t.slate900, marginBottom: 6 }}>
                ¿Olvidaste tu PIN?
              </div>
              Pide al manager de turno que restablezca tu PIN desde Ajustes → Personal.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 02 — Merchant Account Login (admin web; desktop)
// ─────────────────────────────────────────────────────────────
function MerchantLogin() {
  const t = authTokens;
  const [email, setEmail] = React.useState('alex@kaiju.co');
  const [pw, setPw] = React.useState('••••••••');
  const [show, setShow] = React.useState(false);
  const [remember, setRemember] = React.useState(true);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        fontFamily: t.sans,
        background: t.slate50,
        color: t.slate900,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
      }}
    >
      {/* LEFT — editorial brand panel */}
      <div
        style={{
          background: t.teal700,
          color: '#fff',
          padding: '48px 56px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* subtle grid bg */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
            pointerEvents: 'none',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#fff',
              display: 'grid',
              placeItems: 'center',
              color: t.teal700,
              fontWeight: 700,
              fontSize: 17,
            }}
          >
            k
          </span>
          <span style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-0.005em' }}>kaiPOS</span>
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              fontWeight: 650,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              padding: '3px 8px',
              borderRadius: 4,
              background: 'rgba(255,255,255,.12)',
              color: 'rgba(255,255,255,.85)',
            }}
          >
            Merchant
          </span>
        </div>

        <div style={{ marginTop: 'auto', position: 'relative' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 650,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,.65)',
            }}
          >
            Panel de administración
          </div>
          <h1
            style={{
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '14px 0 16px',
              lineHeight: 1.08,
            }}
          >
            Un solo lugar
            <br />
            para tu servicio.
          </h1>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.5,
              color: 'rgba(255,255,255,.75)',
              maxWidth: 420,
              margin: 0,
            }}
          >
            Menú, inventario, turnos, reportes y tienda online — conectados en tiempo real a cada
            terminal, cocina y mesero.
          </p>

          {/* Stats strip */}
          <div
            style={{
              marginTop: 32,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 24,
              paddingTop: 24,
              borderTop: '1px solid rgba(255,255,255,.15)',
            }}
          >
            <Stat v="12,400+" l="restaurantes" />
            <Stat v="$2.4B" l="procesado / año" />
            <Stat v="99.99%" l="uptime" />
          </div>
        </div>
      </div>

      {/* RIGHT — form */}
      <div
        style={{
          padding: '48px 56px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <div style={{ marginLeft: 'auto', fontSize: 13, color: t.slate600 }}>
          ¿Nuevo en kaiPOS?{' '}
          <a href="#register" style={{ color: t.teal500, fontWeight: 600, textDecoration: 'none' }}>
            Crea una cuenta →
          </a>
        </div>

        <div style={{ margin: 'auto 0', maxWidth: 420, width: '100%' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 650,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: t.slate500,
            }}
          >
            Bienvenido de vuelta
          </div>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '8px 0 28px',
              lineHeight: 1.15,
            }}
          >
            Inicia sesión en tu panel
          </h2>

          {/* SSO buttons */}
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}
          >
            <SSOButton label="Google" />
            <SSOButton label="Apple" />
          </div>
          <Divider text="o con email" />

          {/* Form */}
          <Field label="Email">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              style={inputStyle()}
            />
          </Field>
          <div style={{ height: 16 }} />
          <Field
            label="Contraseña"
            action={
              <a
                href="#forgot"
                style={{ fontSize: 12, color: t.teal500, fontWeight: 600, textDecoration: 'none' }}
              >
                ¿Olvidaste?
              </a>
            }
          >
            <div style={{ position: 'relative' }}>
              <input
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                type={show ? 'text' : 'password'}
                style={{ ...inputStyle(), paddingRight: 72 }}
              />
              <button
                onClick={() => setShow(!show)}
                type="button"
                style={{
                  position: 'absolute',
                  right: 8,
                  top: 6,
                  appearance: 'none',
                  cursor: 'pointer',
                  border: 0,
                  background: 'transparent',
                  color: t.slate600,
                  fontFamily: 'inherit',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '8px 12px',
                  borderRadius: 6,
                }}
              >
                {show ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </Field>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 20,
              fontSize: 13,
              color: t.slate600,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ accentColor: t.teal500, width: 18, height: 18 }}
            />
            Mantener sesión en este dispositivo (30 días)
          </label>

          <button
            style={{
              width: '100%',
              marginTop: 24,
              minHeight: 48,
              borderRadius: 10,
              border: 0,
              cursor: 'pointer',
              background: t.teal500,
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: 15,
              fontWeight: 650,
              boxShadow: t.shadowXs,
            }}
          >
            Iniciar sesión
          </button>

          <div
            style={{
              marginTop: 20,
              padding: 14,
              borderRadius: 10,
              background: t.slate0,
              border: `1px solid ${t.border}`,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              fontSize: 13,
              color: t.slate600,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: t.tealSoft,
                color: t.teal600,
                display: 'grid',
                placeItems: 'center',
                fontSize: 15,
                flexShrink: 0,
              }}
            >
              ⌘
            </span>
            <div>
              <div style={{ color: t.slate900, fontWeight: 600 }}>¿Eres miembro del staff?</div>
              <div>Ingresa directamente en la terminal con tu PIN de 4 dígitos.</div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 40,
            paddingTop: 20,
            borderTop: `1px solid ${t.border}`,
            fontSize: 12,
            color: t.slate500,
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>
            Términos
          </a>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>
            Privacidad
          </a>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>
            Estado del sistema
          </a>
          <div style={{ marginLeft: 'auto', fontFamily: t.mono }}>v 2.8.14</div>
        </div>
      </div>
    </div>
  );
}

function Stat({ v, l }) {
  return (
    <div>
      <div
        style={{
          fontFamily: authTokens.mono,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.01em',
        }}
      >
        {v}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,.6)',
          marginTop: 2,
        }}
      >
        {l}
      </div>
    </div>
  );
}

function SSOButton({ label }) {
  const t = authTokens;
  return (
    <button
      style={{
        appearance: 'none',
        cursor: 'pointer',
        minHeight: 44,
        borderRadius: 10,
        background: t.slate0,
        border: `1px solid ${t.border}`,
        fontFamily: 'inherit',
        fontSize: 14,
        fontWeight: 600,
        color: t.slate900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        boxShadow: t.shadowXs,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: t.slate200,
          fontSize: 10,
          display: 'grid',
          placeItems: 'center',
          color: t.slate600,
          fontWeight: 700,
        }}
      >
        {label[0]}
      </span>
      Continuar con {label}
    </button>
  );
}

function Divider({ text }) {
  const t = authTokens;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: t.slate400,
        margin: '4px 0 20px',
      }}
    >
      <div style={{ flex: 1, height: 1, background: t.border }} />
      {text}
      <div style={{ flex: 1, height: 1, background: t.border }} />
    </div>
  );
}

function Field({ label, action, children, help, err }) {
  const t = authTokens;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <label style={{ fontSize: 13, fontWeight: 550, color: t.slate900 }}>{label}</label>
        {action}
      </div>
      {children}
      {help && <div style={{ fontSize: 12, color: t.slate500, marginTop: 6 }}>{help}</div>}
      {err && <div style={{ fontSize: 12, color: t.red500, marginTop: 6 }}>{err}</div>}
    </div>
  );
}

function inputStyle(isErr) {
  const t = authTokens;
  return {
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    fontSize: 15,
    padding: '12px 14px',
    minHeight: 44,
    borderRadius: 8,
    border: `1px solid ${isErr ? t.red500 : t.border}`,
    background: t.slate0,
    color: t.slate900,
    outline: 'none',
  };
}

// ─────────────────────────────────────────────────────────────
// 03 — Merchant Register (multi-step, with side stepper)
// ─────────────────────────────────────────────────────────────
function MerchantRegister() {
  const t = authTokens;
  const [step, setStep] = React.useState(1);
  const [biz, setBiz] = React.useState('restaurant');

  const steps = [
    { n: 1, label: 'Cuenta', desc: 'Tu email y contraseña' },
    { n: 2, label: 'Negocio', desc: 'Nombre, tipo y ubicación' },
    { n: 3, label: 'Plan', desc: 'Elige cómo facturar' },
    { n: 4, label: 'Confirmar', desc: 'Revisa y comienza' },
  ];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        fontFamily: t.sans,
        background: t.slate50,
        color: t.slate900,
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
      }}
    >
      {/* LEFT — stepper */}
      <aside
        style={{
          background: t.slate0,
          borderRight: `1px solid ${t.border}`,
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: t.teal500,
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            k
          </span>
          <span style={{ fontSize: 15, fontWeight: 650 }}>kaiPOS</span>
        </div>

        <div
          style={{
            fontSize: 11,
            fontWeight: 650,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: t.slate500,
            marginBottom: 20,
          }}
        >
          Crea tu cuenta · {step}/4
        </div>

        <div style={{ position: 'relative' }}>
          {/* vertical line */}
          <div
            style={{
              position: 'absolute',
              left: 15,
              top: 8,
              bottom: 8,
              width: 2,
              background: t.border,
            }}
          />
          {steps.map((s) => {
            const done = s.n < step;
            const active = s.n === step;
            return (
              <div
                key={s.n}
                style={{
                  position: 'relative',
                  display: 'flex',
                  gap: 14,
                  padding: '10px 0',
                  marginBottom: 6,
                  opacity: s.n > step ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: active ? t.teal500 : done ? t.teal500 : t.slate0,
                    border: `2px solid ${active || done ? t.teal500 : t.borderStrong}`,
                    color: active || done ? '#fff' : t.slate500,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    position: 'relative',
                    zIndex: 1,
                    flexShrink: 0,
                  }}
                >
                  {done ? '✓' : s.n}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: active ? t.slate900 : t.slate700,
                    }}
                  >
                    {s.label}
                  </div>
                  <div style={{ fontSize: 12, color: t.slate500, marginTop: 2 }}>{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 'auto',
            padding: 16,
            borderRadius: 10,
            background: t.slate50,
            border: `1px solid ${t.border}`,
            fontSize: 12,
            color: t.slate600,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 650, color: t.slate900, marginBottom: 6 }}>14 días gratis</div>
          Sin tarjeta de crédito. Cancela cuando quieras. Soporte humano incluido.
        </div>
      </aside>

      {/* RIGHT — form area */}
      <div style={{ padding: '48px 64px', overflow: 'auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13,
            color: t.slate600,
            marginBottom: 48,
          }}
        >
          <a href="#login" style={{ color: t.slate600, textDecoration: 'none', fontWeight: 600 }}>
            ← Ya tengo cuenta
          </a>
          <div>
            ¿Preguntas?{' '}
            <a href="#" style={{ color: t.teal500, fontWeight: 600, textDecoration: 'none' }}>
              Habla con ventas
            </a>
          </div>
        </div>

        <div style={{ maxWidth: 560 }}>
          {step === 1 && <StepAccount onNext={() => setStep(2)} />}
          {step === 2 && (
            <StepBusiness
              biz={biz}
              setBiz={setBiz}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && <StepPlan onNext={() => setStep(4)} onBack={() => setStep(2)} />}
          {step === 4 && <StepConfirm onBack={() => setStep(3)} />}
        </div>
      </div>
    </div>
  );
}

function StepAccount({ onNext }) {
  const t = authTokens;
  const [pw, setPw] = React.useState('Strong1!pass');
  const pwScore = Math.min(4, Math.floor(pw.length / 3));
  return (
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
        Paso 1
      </div>
      <h2
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '8px 0 8px',
          lineHeight: 1.15,
        }}
      >
        Crea tu cuenta
      </h2>
      <p style={{ fontSize: 15, color: t.slate600, maxWidth: 480, margin: '0 0 32px' }}>
        Usa el email con el que quieres recibir facturas y accesos. Podrás invitar a tu equipo más
        adelante.
      </p>

      <Field label="Nombre completo">
        <input defaultValue="Alex Mendoza" style={inputStyle()} />
      </Field>
      <div style={{ height: 16 }} />
      <Field label="Email de trabajo" help="Enviaremos un código para verificar.">
        <input defaultValue="alex@kaiju.co" style={inputStyle()} />
      </Field>
      <div style={{ height: 16 }} />
      <Field label="Contraseña">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          style={inputStyle()}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i < pwScore ? (pwScore >= 3 ? t.green500 : t.amber400) : t.slate200,
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 12, color: t.slate500, marginTop: 8 }}>
          Mínimo 8 caracteres · {pwScore >= 3 ? '✓ Fuerte' : 'Agrega números y símbolos'}
        </div>
      </Field>

      <label
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 24,
          fontSize: 13,
          color: t.slate600,
          cursor: 'pointer',
          lineHeight: 1.5,
        }}
      >
        <input
          type="checkbox"
          defaultChecked
          style={{ accentColor: t.teal500, width: 18, height: 18, marginTop: 1 }}
        />
        <span>
          Acepto los{' '}
          <a href="#" style={{ color: t.teal500, fontWeight: 600, textDecoration: 'none' }}>
            Términos
          </a>{' '}
          y la{' '}
          <a href="#" style={{ color: t.teal500, fontWeight: 600, textDecoration: 'none' }}>
            Política de privacidad
          </a>
          .
        </span>
      </label>

      <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onNext} style={ctaStyle()}>
          Continuar →
        </button>
      </div>
    </div>
  );
}

function StepBusiness({ biz, setBiz, onNext, onBack }) {
  const t = authTokens;
  const types = [
    { id: 'restaurant', icon: '🍜', label: 'Restaurante', desc: 'Mesas, meseros, cocina completa' },
    { id: 'cafe', icon: '☕', label: 'Café', desc: 'Mostrador, rotación rápida' },
    { id: 'retail', icon: '🛍', label: 'Retail', desc: 'Inventario por SKU, tallas' },
    { id: 'bar', icon: '🍸', label: 'Bar', desc: 'Tabs, propinas separadas' },
  ];
  return (
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
        Paso 2
      </div>
      <h2
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '8px 0 8px',
          lineHeight: 1.15,
        }}
      >
        Cuéntanos de tu negocio
      </h2>
      <p style={{ fontSize: 15, color: t.slate600, maxWidth: 480, margin: '0 0 32px' }}>
        Usamos esto para prepararte plantillas de menú y flujos apropiados.
      </p>

      <div style={{ fontSize: 13, fontWeight: 550, marginBottom: 10 }}>Tipo de negocio</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
          marginBottom: 24,
        }}
      >
        {types.map((ty) => {
          const sel = biz === ty.id;
          return (
            <button
              key={ty.id}
              onClick={() => setBiz(ty.id)}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                background: sel ? t.tealSoft : t.slate0,
                border: sel ? `2px solid ${t.teal500}` : `1px solid ${t.border}`,
                borderRadius: 10,
                padding: 14,
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                fontFamily: 'inherit',
                color: 'inherit',
              }}
            >
              <span style={{ fontSize: 24 }}>{ty.icon}</span>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 650 }}>{ty.label}</div>
                <div style={{ fontSize: 12, color: t.slate600, marginTop: 2 }}>{ty.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      <Field label="Nombre del negocio">
        <input defaultValue="Kaiju Street Kitchen" style={inputStyle()} />
      </Field>
      <div style={{ height: 16 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Field label="Ciudad">
          <input defaultValue="New York" style={inputStyle()} />
        </Field>
        <Field label="País">
          <select defaultValue="US" style={{ ...inputStyle(), appearance: 'auto' }}>
            <option value="US">Estados Unidos</option>
            <option value="MX">México</option>
            <option value="ES">España</option>
            <option value="CA">Canadá</option>
          </select>
        </Field>
      </div>
      <div style={{ height: 16 }} />
      <Field label="Número de ubicaciones">
        <div style={{ display: 'flex', gap: 8 }}>
          {['1', '2-5', '6-20', '20+'].map((n, i) => (
            <button
              key={n}
              style={{
                flex: 1,
                appearance: 'none',
                cursor: 'pointer',
                minHeight: 44,
                borderRadius: 8,
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                background: i === 0 ? t.tealSoft : t.slate0,
                border: i === 0 ? `2px solid ${t.teal500}` : `1px solid ${t.border}`,
                color: i === 0 ? t.teal700 : t.slate700,
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>

      <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={ghostStyle()}>
          ← Atrás
        </button>
        <button onClick={onNext} style={ctaStyle()}>
          Continuar →
        </button>
      </div>
    </div>
  );
}

function StepPlan({ onNext, onBack }) {
  const t = authTokens;
  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: 49,
      desc: '1 terminal, 1 KDS. Ideal para cafés pequeños.',
      feats: ['POS + KDS', 'Menú ilimitado', 'Reportes básicos'],
    },
    {
      id: 'growth',
      name: 'Growth',
      price: 99,
      desc: 'Hasta 3 terminales y tienda online.',
      feats: ['Todo Starter', 'Tienda online', 'App de mesero', 'Inventario'],
      popular: true,
    },
    {
      id: 'scale',
      name: 'Scale',
      price: 249,
      desc: 'Multi-ubicación, API y soporte dedicado.',
      feats: ['Todo Growth', 'Multi-sede', 'API + webhooks', 'SLA 24/7'],
    },
  ];
  const [sel, setSel] = React.useState('growth');
  return (
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
        Paso 3
      </div>
      <h2
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '8px 0 8px',
          lineHeight: 1.15,
        }}
      >
        Elige tu plan
      </h2>
      <p style={{ fontSize: 15, color: t.slate600, maxWidth: 480, margin: '0 0 32px' }}>
        Todos los planes comienzan con 14 días gratis. Cambia o cancela cuando quieras.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {plans.map((p) => {
          const selected = sel === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSel(p.id)}
              style={{
                appearance: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                background: selected ? t.tealSoft : t.slate0,
                border: selected ? `2px solid ${t.teal500}` : `1px solid ${t.border}`,
                borderRadius: 12,
                padding: 18,
                fontFamily: 'inherit',
                color: 'inherit',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 12,
                alignItems: 'center',
                position: 'relative',
              }}
            >
              {p.popular && (
                <span
                  style={{
                    position: 'absolute',
                    top: -10,
                    left: 18,
                    background: t.amber400,
                    color: '#1E1E1B',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    padding: '3px 8px',
                    borderRadius: 4,
                  }}
                >
                  Más popular
                </span>
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 17, fontWeight: 650 }}>{p.name}</span>
                  <span style={{ fontFamily: t.mono, fontSize: 15, fontWeight: 700 }}>
                    ${p.price}
                    <span style={{ fontSize: 12, color: t.slate500, fontWeight: 500 }}>/mes</span>
                  </span>
                </div>
                <div style={{ fontSize: 13, color: t.slate600, margin: '4px 0 8px' }}>{p.desc}</div>
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                    fontSize: 12,
                    color: t.slate600,
                  }}
                >
                  {p.feats.map((f) => (
                    <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: t.teal500, fontWeight: 700 }}>✓</span> {f}
                    </span>
                  ))}
                </div>
              </div>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: selected ? t.teal500 : 'transparent',
                  border: `2px solid ${selected ? t.teal500 : t.borderStrong}`,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {selected && '✓'}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={ghostStyle()}>
          ← Atrás
        </button>
        <button onClick={onNext} style={ctaStyle()}>
          Continuar →
        </button>
      </div>
    </div>
  );
}

function StepConfirm({ onBack }) {
  const t = authTokens;
  return (
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
        Paso 4 · Último
      </div>
      <h2
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          margin: '8px 0 8px',
          lineHeight: 1.15,
        }}
      >
        Todo listo, Alex.
      </h2>
      <p style={{ fontSize: 15, color: t.slate600, maxWidth: 480, margin: '0 0 32px' }}>
        Revisa los detalles. Crearemos tu panel y enviaremos un código de verificación a
        alex@kaiju.co.
      </p>

      <div
        style={{
          background: t.slate0,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <SummaryRow label="Cuenta" value="Alex Mendoza · alex@kaiju.co" />
        <SummaryRow label="Negocio" value="Kaiju Street Kitchen · Restaurante" />
        <SummaryRow label="Ubicación" value="New York · 1 sede" />
        <SummaryRow
          label="Plan"
          value={
            <span>
              Growth · <span style={{ fontFamily: t.mono, fontWeight: 700 }}>$99/mes</span>
            </span>
          }
        />
        <SummaryRow label="Prueba" value="14 días gratis — no cobraremos hasta May 1, 2026" last />
      </div>

      <div
        style={{
          padding: 14,
          borderRadius: 10,
          background: 'rgba(31,138,61,.08)',
          border: `1px solid rgba(31,138,61,.2)`,
          display: 'flex',
          gap: 12,
          fontSize: 13,
          color: '#0F4F22',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 16 }}>✓</span>
        <div>
          <div style={{ fontWeight: 650 }}>Tu terminal llegará en 3–5 días.</div>
          <div style={{ marginTop: 2, color: '#176B2F' }}>
            Mientras tanto, puedes usar kaiPOS en cualquier iPad o laptop.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={ghostStyle()}>
          ← Atrás
        </button>
        <button style={{ ...ctaStyle(), minHeight: 48, fontSize: 15 }}>Crear mi cuenta →</button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, last }) {
  const t = authTokens;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: last ? 0 : `1px solid ${t.border}`,
        fontSize: 14,
      }}
    >
      <span style={{ color: t.slate600 }}>{label}</span>
      <span style={{ color: t.slate900, fontWeight: 550, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function ctaStyle() {
  const t = authTokens;
  return {
    appearance: 'none',
    cursor: 'pointer',
    border: 0,
    minHeight: 44,
    padding: '0 22px',
    borderRadius: 10,
    background: t.teal500,
    color: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 650,
    boxShadow: t.shadowXs,
  };
}
function ghostStyle() {
  const t = authTokens;
  return {
    appearance: 'none',
    cursor: 'pointer',
    border: 0,
    minHeight: 44,
    padding: '0 16px',
    borderRadius: 10,
    background: 'transparent',
    color: t.slate600,
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 600,
  };
}

Object.assign(window, { StaffPinLogin, MerchantLogin, MerchantRegister });
