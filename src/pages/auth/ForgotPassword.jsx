import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LuArrowLeft, LuMailCheck } from 'react-icons/lu';
import { api } from '@/api/client';
import { AuthLayout, DemoEmail, FormError } from '@/components/auth';
import { Button, Input } from '@/components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordPage() {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.auth.forgotPassword(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not send the link. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Forgot your password?" tagline="We will email you a link to choose a new one. Webinger staff never ask for your password.">
      <div className="auth__form">
        <Link to="/login" className="back-link">
          <LuArrowLeft aria-hidden /> Back to sign in
        </Link>
        {sentTo ? (
          <>
            <div>
              <LuMailCheck size={28} aria-hidden />
              <h2 style={{ marginTop: 8 }}>Check your email</h2>
              <p className="muted small">
                If <strong>{sentTo}</strong> has a Webinger account, a reset link is on its way. It works once and expires in 30 minutes.
              </p>
            </div>
            <DemoEmail to={sentTo} />
            <Button variant="secondary" onClick={() => setSentTo(null)}>
              Use a different email
            </Button>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
            <div>
              <h2>Reset password</h2>
              <p className="muted small">Enter the email you sign in with.</p>
            </div>
            <FormError>{formError}</FormError>
            <Input label="Email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
            <Button type="submit" block loading={busy}>
              Send reset link
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
