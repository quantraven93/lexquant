"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState({
    email_alerts: true,
    telegram_alerts: false,
    telegram_chat_id: "",
    alert_before_hearing_hours: 24,
  });

  useEffect(() => {
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((data) => {
        if (data.preferences) {
          setPrefs({
            email_alerts: data.preferences.email_alerts ?? true,
            telegram_alerts: data.preferences.telegram_alerts ?? false,
            telegram_chat_id: data.preferences.telegram_chat_id || "",
            alert_before_hearing_hours:
              data.preferences.alert_before_hearing_hours ?? 24,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) {
    return (
      <DashboardShell>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <span style={{ color: "var(--bb-amber)", fontSize: "0.75rem", letterSpacing: "0.1em", fontWeight: 600 }}>[LOADING CONFIG...]</span>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div style={{ maxWidth: "640px", padding: "1rem", display: "flex", flexDirection: "column", gap: "1px", background: "var(--bb-border)" }}>
        {/* Header */}
        <div className="bb-panel-header">
          <span className="bb-panel-title">TERMINAL SETTINGS</span>
        </div>

        {/* Email Alerts */}
        <div className="bb-panel">
          <div className="bb-panel-header">
            <span className="bb-panel-title" style={{ fontSize: "0.6rem" }}>EMAIL ALERTS</span>
          </div>
          <div className="bb-panel-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.75rem" }}>
            <div>
              <p style={{ fontSize: "0.78rem", color: "var(--bb-white)" }}>Receive case updates via email</p>
            </div>
            <div
              onClick={() => setPrefs({ ...prefs, email_alerts: !prefs.email_alerts })}
              style={{
                width: "36px",
                height: "18px",
                borderRadius: "9px",
                background: prefs.email_alerts ? "var(--bb-amber)" : "var(--bb-gray-dim)",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.15s",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  background: prefs.email_alerts ? "var(--bb-bg)" : "var(--bb-gray)",
                  position: "absolute",
                  top: "2px",
                  left: prefs.email_alerts ? "20px" : "2px",
                  transition: "left 0.15s",
                }}
              />
            </div>
          </div>
        </div>

        {/* Telegram Alerts */}
        <div className="bb-panel">
          <div className="bb-panel-header">
            <span className="bb-panel-title" style={{ fontSize: "0.6rem" }}>TELEGRAM ALERTS</span>
          </div>
          <div className="bb-panel-body" style={{ padding: "0.6rem 0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: prefs.telegram_alerts ? "0.75rem" : 0 }}>
              <p style={{ fontSize: "0.78rem", color: "var(--bb-white)" }}>Receive instant updates via Telegram</p>
              <div
                onClick={() => setPrefs({ ...prefs, telegram_alerts: !prefs.telegram_alerts })}
                style={{
                  width: "36px",
                  height: "18px",
                  borderRadius: "9px",
                  background: prefs.telegram_alerts ? "var(--bb-amber)" : "var(--bb-gray-dim)",
                  cursor: "pointer",
                  position: "relative",
                  transition: "background 0.15s",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: prefs.telegram_alerts ? "var(--bb-bg)" : "var(--bb-gray)",
                    position: "absolute",
                    top: "2px",
                    left: prefs.telegram_alerts ? "20px" : "2px",
                    transition: "left 0.15s",
                  }}
                />
              </div>
            </div>

            {prefs.telegram_alerts && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "0.3rem" }}>
                    TELEGRAM CHAT ID
                  </label>
                  <input
                    type="text"
                    value={prefs.telegram_chat_id}
                    onChange={(e) =>
                      setPrefs({ ...prefs, telegram_chat_id: e.target.value })
                    }
                    placeholder="e.g., 123456789"
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ padding: "0.5rem", background: "var(--bb-bg)", border: "1px solid var(--bb-border)", fontFamily: "var(--bb-font)" }}>
                  <p style={{ fontSize: "0.6rem", color: "var(--bb-amber)", fontWeight: 600, marginBottom: "0.4rem" }}>
                    HOW TO GET YOUR CHAT ID:
                  </p>
                  <div style={{ fontSize: "0.6rem", color: "var(--bb-gray)", lineHeight: "1.6" }}>
                    <div>1. Open Telegram and search for @BotFather</div>
                    <div>2. Send /newbot and follow the steps</div>
                    <div>3. Copy the bot token to your env vars</div>
                    <div>4. Send any message to your new bot</div>
                    <div>5. Visit <code style={{ color: "var(--bb-amber-dim)", fontSize: "0.58rem" }}>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code></div>
                    <div>6. Find your chat_id in the response</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Hearing Reminders */}
        <div className="bb-panel">
          <div className="bb-panel-header">
            <span className="bb-panel-title" style={{ fontSize: "0.6rem" }}>HEARING REMINDERS</span>
          </div>
          <div className="bb-panel-body" style={{ padding: "0.6rem 0.75rem" }}>
            <label style={{ display: "block", fontSize: "0.6rem", color: "var(--bb-gray)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "0.3rem" }}>
              ALERT BEFORE HEARING
            </label>
            <select
              value={prefs.alert_before_hearing_hours}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  alert_before_hearing_hours: Number(e.target.value),
                })
              }
              style={{ width: "100%", boxSizing: "border-box" }}
            >
              <option value={1}>1 hour before</option>
              <option value={6}>6 hours before</option>
              <option value={12}>12 hours before</option>
              <option value={24}>24 hours before (1 day)</option>
              <option value={48}>48 hours before (2 days)</option>
            </select>
          </div>
        </div>

        {/* Save button */}
        <div style={{ background: "var(--bb-panel)", padding: "0.75rem" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bb-btn bb-btn-primary"
            style={{ opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saved ? "[SAVED]" : saving ? "[SAVING...]" : "[SAVE CONFIG]"}
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}
