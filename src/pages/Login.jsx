import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LuCircleAlert, LuEye, LuEyeOff } from 'react-icons/lu';
import { isMock } from '@/api/client';
import { demoAccounts, DEMO_PASSWORD } from '@/api/mock/data';
import { homePath, useAuth } from '@/auth/AuthContext';
import { Logo } from '@/components/Logo';
import { Button, Input } from '@/components/ui';
import { AREA_BY_ROLE, ROLE_LABEL } from '@/types';
import '@/layout/shell.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { user, area, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user && area) return <Navigate to={homePath(area)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < 8) next.password = 'Password must be at least 8 characters.';
    setErrors(next);
    setFormError(null);
    if (next.email || next.password) return;

    setBusy(true);
    try {
      const u = await login(email, password);
      const home = homePath(AREA_BY_ROLE[u.role]);
      // Only return to the page they came from if it belongs to their own area.
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = (demoEmail) => {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setErrors({});
    setFormError(null);
  };

  return (
    <div className="auth">
      <section className="auth__panel">
        <Logo height={30} inverse />
        <div>
          <h1>Everything about your work, in one place.</h1>
          <p className="auth__tag">Projects, approvals, reports and conversations with the Webinger team, from any device.</p>
        </div>
        <span className="auth__dot" aria-hidden />
      </section>

      <section className="auth__form-wrap">
        <form className="auth__form" onSubmit={submit} noValidate>
          <div>
            <h2>Sign in</h2>
            <p className="muted small">Use the login your Webinger account manager sent you.</p>
          </div>

          {formError && (
            <div className="alert alert--error" role="alert">
              <LuCircleAlert aria-hidden style={{ marginTop: 2 }} /> {formError}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />

          <div className="pw">
            <Input
              label="Password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              style={{ paddingRight: 44, width: '100%' }}
            />
            {!errors.password && (
              <button
                type="button"
                className="pw__toggle"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <LuEyeOff size={18} /> : <LuEye size={18} />}
              </button>
            )}
          </div>

          <Button type="submit" block loading={busy}>
            Sign in
          </Button>

          <p className="small muted">
            Forgot your password? Ask your account manager to send a reset link.
            {/* Week 3: self-service reset via emailed link. */}
          </p>

          {isMock && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="small" style={{ fontWeight: 600 }}>
                Prototype: try a demo account
              </div>
              <div className="demo-list">
                {demoAccounts.map((a) => (
                  <button key={a.email} type="button" onClick={() => fillDemo(a.email)}>
                    <strong>{ROLE_LABEL[a.role]}{a.note ? ` · ${a.note}` : ''}</strong>
                    {a.email}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
