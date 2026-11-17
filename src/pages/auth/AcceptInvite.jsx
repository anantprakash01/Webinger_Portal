import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { homePath, useAuth } from '@/auth/AuthContext';
import { AuthLayout, FormError, NewPasswordFields, validateNewPassword } from '@/components/auth';
import { Button } from '@/components/ui';
import { AREA_BY_ROLE, ROLE_LABEL } from '@/types';

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { acceptInvite, user } = useAuth();
  const invite = useQuery({ queryKey: ['invite', token], queryFn: () => api.auth.getInvite(token), enabled: !!token, retry: false });
  const [value, setValue] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const next = validateNewPassword(value);
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const u = await acceptInvite(token, value.password);
      navigate(homePath(AREA_BY_ROLE[u.role]), { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not set up your account.');
      setBusy(false);
    }
  };

  const info = invite.data;
  return (
    <AuthLayout
      title={info ? `Welcome, ${info.name.split(' ')[0]}.` : 'Welcome to Webinger.'}
      tagline="Set a password to finish setting up your account. Nobody at Webinger will ever see it."
    >
      <div className="auth__form">
        {!token || invite.isError ? (
          <>
            <h2>This invite can’t be used</h2>
            <p className="muted small">{invite.error?.message ?? 'The link is incomplete.'} Contact the person who invited you for a new link.</p>
            <Link to="/login" className="btn btn--secondary">
              Go to sign in
            </Link>
          </>
        ) : invite.isPending ? (
          <div className="grid">
            <div className="skeleton" style={{ height: 32, width: '60%' }} />
            <div className="skeleton" style={{ height: 160 }} />
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
            <div>
              <h2>Set up your account</h2>
              <p className="muted small">
                {ROLE_LABEL[info.role]} at <strong>{info.organisationName}</strong>
              </p>
            </div>
            {user && (
              <div className="alert alert--info" role="status">
                You are signed in as {user.name}. Finishing this invite signs you in as {info.name} instead.
              </div>
            )}
            <FormError>{formError}</FormError>
            <div className="field">
              <span className="field__label">Email</span>
              <span className="small">{info.email}</span>
            </div>
            <NewPasswordFields value={value} onChange={setValue} errors={errors} />
            <Button type="submit" block loading={busy}>
              Create account and sign in
            </Button>
            <p className="list__meta">By continuing you agree to the portal’s terms and privacy policy.</p>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
