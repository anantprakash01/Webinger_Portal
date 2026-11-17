import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LuEye, LuEyeOff, LuInfo, LuShieldCheck } from 'react-icons/lu';
import { isMock, takeSignOutReason } from '@/api/client';
import { demoAccounts, DEMO_MFA_CODE, DEMO_PASSWORD } from '@/api/mock/data';
import { homePath, useAuth } from '@/auth/AuthContext';
import { AuthLayout, FormError } from '@/components/auth';
import { Button, Input } from '@/components/ui';
import { AREA_BY_ROLE, ROLE_LABEL } from '@/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { user, area, login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(null);
  const [code, setCode] = useState('');
  // Read once: why the server ended the last session (forced logout, suspension…).
  const [notice] = useState(() => takeSignOutReason() ?? location.state?.notice ?? null);

  if (user && area) return <Navigate to={homePath(area)} replace />;

  const goHome = (u) => {
    const home = homePath(AREA_BY_ROLE[u.role]);
    // Only return to the page they came from if it belongs to their own area.
    navigate(from && from.startsWith(home) ? from : home, { replace: true });
  };

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
      const r = await login(email, password);
      if (r.mfa) {
        setMfa(r.mfa);
        setCode('');
      } else goHome(r.user);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: 'Enter the 6-digit code.' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      goHome(await verifyMfa(mfa.mfaToken, code));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not verify the code.';
      // An expired attempt needs a fresh password step.
      if (/expired/i.test(msg)) setMfa(null);
      setFormError(msg);
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

  if (mfa) {
    return (
      <AuthLayout>
        <form className="auth__form" onSubmit={submitCode} noValidate>
          <div>
            <LuShieldCheck size={28} aria-hidden />
            <h2 style={{ marginTop: 8 }}>Two-step sign-in</h2>
            <p className="muted small">Enter the 6-digit code from your {mfa.method.toLowerCase()}. Admin and manager accounts always need this.</p>
          </div>
          <FormError>{formError}</FormError>
          <Input
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={errors.code}
            className="field__input code-input"
          />
          <Button type="submit" block loading={busy}>
            Verify and sign in
          </Button>
          <div className="auth__links">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setMfa(null);
                setFormError(null);
              }}
            >
              Use a different account
            </button>
          </div>
          {isMock && (
            <p className="list__meta">
              Prototype: the demo code is <strong>{DEMO_MFA_CODE}</strong>.
            </p>
          )}
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form className="auth__form" onSubmit={submit} noValidate>
        <div>
          <h2>Sign in</h2>
          <p className="muted small">Use the login your Webinger account manager sent you.</p>
        </div>

        {notice && !formError && (
          <div className="alert alert--info" role="status">
            <LuInfo aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{notice}</span>
          </div>
        )}
        <FormError>{formError}</FormError>

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
            <button type="button" className="pw__toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <LuEyeOff size={18} /> : <LuEye size={18} />}
            </button>
          )}
        </div>

        <Button type="submit" block loading={busy}>
          Sign in
        </Button>

        <div className="auth__links">
          <Link to="/forgot-password" state={{ email }}>
            Forgot password?
          </Link>
        </div>

        {isMock && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="small" style={{ fontWeight: 600 }}>
              Prototype: try a demo account
            </div>
            <div className="demo-list">
              {demoAccounts.map((a) => (
                <button key={a.email} type="button" onClick={() => fillDemo(a.email)}>
                  <strong>
                    {ROLE_LABEL[a.role]}
                    {a.note ? ` · ${a.note}` : ''}
                  </strong>
                  {a.email}
                </button>
              ))}
            </div>
            <p className="list__meta">Admin and manager accounts ask for a two-step code: {DEMO_MFA_CODE}.</p>
          </div>
        )}
      </form>
    </AuthLayout>
  );
}
