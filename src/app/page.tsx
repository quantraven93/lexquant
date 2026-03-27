import Link from "next/link";

const features = [
  {
    tag: "ALT",
    title: "Instant Alerts",
    desc: "Telegram + Email notifications within minutes of status changes, new orders, or hearing updates.",
  },
  {
    tag: "CAL",
    title: "Hearing Calendar",
    desc: "Visual calendar of all upcoming hearings. Generate daily cause lists across court complexes.",
  },
  {
    tag: "SCH",
    title: "Court Search",
    desc: "Search across all Indian courts by party name. Find and track any case instantly.",
  },
  {
    tag: "UPD",
    title: "Auto-Updates",
    desc: "Cases checked every 30 minutes. CAPTCHA solved automatically via GPT-4o Vision.",
  },
  {
    tag: "COV",
    title: "All Courts",
    desc: "Supreme Court, High Courts, District Courts, NCLT, Consumer Forums — unified terminal.",
  },
  {
    tag: "SEC",
    title: "Secure Access",
    desc: "Row-level security. Your tracked cases are visible only to you. Zero data leakage.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bb-bg)', color: 'var(--bb-white)' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid var(--bb-amber)', background: '#060a12' }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <span className="text-base font-bold tracking-widest" style={{ color: 'var(--bb-amber)' }}>
            LEXQUANT
          </span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--bb-gray)', letterSpacing: '0.08em' }}
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="bb-btn bb-btn-primary"
              style={{ fontSize: '0.65rem', padding: '0.4rem 0.8rem' }}
            >
              Get Access
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero - Terminal Boot Screen */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <div className="bb-panel" style={{ padding: '2.5rem' }}>
          <div style={{ fontFamily: 'var(--bb-font)', lineHeight: 2 }}>
            <p style={{ color: 'var(--bb-amber)', fontSize: '1.1rem', fontWeight: 700 }}>
              {'>'} LEXQUANT v1.0
            </p>
            <p style={{ color: 'var(--bb-white)', fontSize: '0.9rem' }}>
              {'>'} INDIAN COURT CASE INTELLIGENCE TERMINAL
            </p>
            <p style={{ color: 'var(--bb-gray)', fontSize: '0.8rem' }}>{'>'}</p>
            <p style={{ color: 'var(--bb-gray)', fontSize: '0.8rem' }}>
              {'>'} MONITORING: <span style={{ color: 'var(--bb-green)' }}>SUPREME COURT</span> | <span style={{ color: 'var(--bb-green)' }}>HIGH COURTS</span> | <span style={{ color: 'var(--bb-green)' }}>DISTRICT COURTS</span> | <span style={{ color: 'var(--bb-green)' }}>NCLT</span> | <span style={{ color: 'var(--bb-green)' }}>CONSUMER FORUMS</span>
            </p>
            <p style={{ color: 'var(--bb-gray)', fontSize: '0.8rem' }}>
              {'>'} UPDATE FREQUENCY: <span style={{ color: 'var(--bb-amber)' }}>30 MIN</span>
            </p>
            <p style={{ color: 'var(--bb-gray)', fontSize: '0.8rem' }}>
              {'>'} ALERT CHANNELS: <span style={{ color: 'var(--bb-cyan, #4af6c3)' }}>TELEGRAM + EMAIL</span>
            </p>
            <p style={{ color: 'var(--bb-gray)', fontSize: '0.8rem' }}>
              {'>'} AI ENGINE: <span style={{ color: 'var(--bb-amber)' }}>GPT-4o CASE ANALYSIS + CAPTCHA SOLVING</span>
            </p>
            <p style={{ color: 'var(--bb-gray)', fontSize: '0.8rem' }}>{'>'}</p>
          </div>
          <div className="flex gap-3 mt-6">
            <Link href="/login" className="bb-btn bb-btn-primary">
              START TRACKING
            </Link>
            <Link href="/login" className="bb-btn bb-btn-secondary">
              LEARN MORE
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px" style={{ background: 'var(--bb-border)' }}>
          {features.map((f) => (
            <div key={f.tag} className="bb-panel" style={{ border: 'none' }}>
              <div className="bb-panel-header">
                <span className="bb-panel-title">{f.title}</span>
                <span className="bb-panel-tag">{f.tag}</span>
              </div>
              <div className="bb-panel-body">
                <p style={{ fontSize: '0.75rem', color: 'var(--bb-gray)', lineHeight: 1.6 }}>
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="bb-panel text-center" style={{ padding: '2rem' }}>
          <p className="bb-panel-title" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            READY TO ACCESS THE TERMINAL?
          </p>
          <p style={{ color: 'var(--bb-gray)', fontSize: '0.75rem', marginBottom: '1rem' }}>
            Free to use. No credit card required.
          </p>
          <Link href="/login" className="bb-btn bb-btn-primary">
            GET STARTED FREE
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--bb-border)', padding: '1rem 0' }}>
        <p className="text-center" style={{ color: 'var(--bb-gray)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          LexQuant — Indian Court Case Intelligence Terminal | Open Source
        </p>
      </footer>
    </div>
  );
}
