import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LuArrowLeft } from 'react-icons/lu';
import { api } from '@/api/client';
import { AuthLayout, FormError, NewPasswordFields, validateNewPassword } from '@/components/auth';
import { Button } from '@/components/ui';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
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
      await api.auth.resetPassword(token, value.password);
      navigate('/login', { replace: true, state: { notice: 'Password changed. Sign in with your new password. Other devices were signed out.' } });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Choose a new password" tagline="After the change, every other device signed in to your account is signed out.">
      <div className="auth__form">
        <Link to="/login" className="back-link">
          <LuArrowLeft aria-hidden /> Back to sign in
        </Link>
        {!token ? (
          <>
            <h2>Link incomplete</h2>
            <p className="muted small">Open the link from the email again, or request a new one.</p>
            <Link to="/forgot-password" className="btn btn--primary">
              Request a new link
            </Link>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
            <h2>New password</h2>
            <FormError>
              {formError}
              {formError && /expired|used/i.test(formError) && (
                <>
                  {' '}
                  <Link to="/forgot-password">Request a new link</Link>
                </>
              )}
            </FormError>
            <NewPasswordFields value={value} onChange={setValue} errors={errors} />
            <Button type="submit" block loading={busy}>
              Change password
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
