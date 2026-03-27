"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) setMessage(error.message);
      else setMessage("Check your email for a confirmation link.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setMessage(error.message);
      else router.push("/dashboard");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bb-bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold tracking-widest" style={{ color: 'var(--bb-amber)' }}>
            LEXQUANT
          </h1>
          <p style={{ color: 'var(--bb-gray)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.25rem' }}>
            Court Terminal Access
          </p>
        </div>

        {/* Login Panel */}
        <div className="bb-panel">
          <div className="bb-panel-header">
            <span className="bb-panel-title">
              {isSignUp ? "Create Account" : "Authenticate"}
            </span>
            <span className="live-dot" />
          </div>

          <div className="bb-panel-body" style={{ padding: '1.25rem' }}>
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 600, color: 'var(--bb-gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 600, color: 'var(--bb-gray)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  style={{ width: '100%' }}
                />
              </div>

              {message && (
                <div
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    border: `1px solid ${message.includes("Check your email") ? 'var(--bb-green)' : 'var(--bb-red)'}`,
                    color: message.includes("Check your email") ? 'var(--bb-green)' : 'var(--bb-red)',
                    background: message.includes("Check your email") ? 'rgba(0,210,106,0.05)' : 'rgba(255,59,59,0.05)',
                  }}
                >
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="bb-btn bb-btn-primary"
                style={{ width: '100%', opacity: loading ? 0.6 : 1 }}
              >
                {loading
                  ? "PLEASE WAIT..."
                  : isSignUp
                  ? "CREATE ACCOUNT"
                  : "AUTHENTICATE"}
              </button>
            </form>

            <div className="text-center mt-4">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setMessage("");
                }}
                style={{ fontSize: '0.7rem', color: 'var(--bb-amber)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {isSignUp
                  ? "EXISTING USER? [SIGN IN]"
                  : "NEW USER? [CREATE ACCOUNT]"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
