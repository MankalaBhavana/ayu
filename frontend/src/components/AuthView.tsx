import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button, Input } from "./ui";
import BrandLogo from "./BrandLogo";

type Props = {
  onLogin: (username: string, password: string) => Promise<void>;
};

export default function AuthView({ onLogin }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdminNote, setShowAdminNote] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    setSubmitting(true);
    setError(null);
    try {
      await onLogin(username, password);
    } catch {
      // Generic on purpose -- never reveal which field was wrong.
      setError("Invalid credentials");
    } finally {
      setSubmitting(false);
    }
  };

  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === "function") {
      setCapsLockOn(event.getModifierState("CapsLock"));
    }
  };

  return (
    <div className="login-page">
      <div className="login-hero" aria-hidden="true">
        <svg className="login-hero-waves" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 120 C 160 40, 340 200, 520 130 S 820 60, 800 180 L 800 0 L 0 0 Z" fill="#7dd8c8" opacity="0.08" />
          <path d="M0 300 C 200 220, 380 380, 600 300 S 860 260, 800 400 L 800 900 L 0 900 Z" fill="#3fb8c9" opacity="0.06" />
          <path d="M-50 520 C 150 470, 320 620, 560 540 S 780 470, 850 600" stroke="#8fe3d3" strokeWidth="2" fill="none" opacity="0.12" />
          <path d="M-50 700 C 180 640, 360 780, 620 700 S 820 640, 860 760" stroke="#6fd0d8" strokeWidth="1.5" fill="none" opacity="0.1" />
          <circle cx="680" cy="150" r="140" fill="#9fe6da" opacity="0.05" />
          <circle cx="90" cy="760" r="180" fill="#5fc9d6" opacity="0.05" />
        </svg>
        <div className="login-hero-content">
          <h1 className="login-hero-headline">
            Care starts with <span className="login-hero-accent">connection.</span>
          </h1>
          <p className="login-hero-quote">
            Behind every patient record is a person who deserves care, clarity, and compassion.
          </p>
        </div>
        <p className="login-hero-footer">One connected workspace for every step of the patient journey.</p>
      </div>

      <div className="login-panel">
        <div className="login-panel-inner">
          <div className="login-help">
            <span className="login-help-label">Need help?</span>
            <button
              type="button"
              className="link login-help-link"
              onClick={() => setShowAdminNote((value) => !value)}
              aria-expanded={showAdminNote}
            >
              Contact your administrator
            </button>
          </div>
          {showAdminNote && (
            <div className="login-admin-note" role="note">
              Access to Ayu Polyclinic is managed by your hospital's admin team. Reach out to them to get a username set up
              or your password reset.
            </div>
          )}

          <div className="login-brand">
            <BrandLogo />
          </div>

          <h2 className="login-title">Welcome to Ayu Polyclinic</h2>
          <p className="login-subtitle">Sign in to your hospital workspace.</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label className="ui-label" htmlFor="login-username">
              Username
              <Input
                id="login-username"
                name="username"
                placeholder="username"
                autoFocus
                required
                autoComplete="username"
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const pwField = document.getElementById("login-password") as HTMLInputElement | null;
                    pwField?.focus();
                  }
                }}
              />
            </label>
            <label className="ui-label" htmlFor="login-password">
              Password
              <div className="login-password-wrap">
                <Input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••"
                  required
                  autoComplete="current-password"
                  onKeyUp={trackCapsLock}
                  onKeyDown={trackCapsLock}
                  style={{ paddingRight: "44px" }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="login-password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12a19.9 19.9 0 0 1 5.06-7.06" />
                      <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                      <path d="M9.9 4.24A10.7 10.7 0 0 1 12 4c5 0 9.27 3.11 11 8a19.8 19.8 0 0 1-2.16 3.19" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {capsLockOn && (
                <span className="login-capslock-hint" role="alert">
                  Caps Lock is on
                </span>
              )}
            </label>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" className="login-submit" disabled={submitting}>
              {submitting ? "Signing in..." : <>Sign in <span aria-hidden="true">→</span></>}
            </Button>
          </form>

          <div className="login-footer">
            <p>Access is based on your assigned role.</p>
            <p className="login-footer-brand">Ayu Polyclinic • Connected care, simplified</p>
          </div>
        </div>
      </div>
    </div>
  );
}
