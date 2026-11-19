import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LuArrowLeft, LuMailCheck } from 'react-icons/lu';
import { api } from '@/api/client';
import { homePath, useAuth } from '@/auth/AuthContext';
import { AuthLayout, DemoEmail, FormError, NewPasswordFields, validateNewPassword } from '@/components/auth';
import { NICHES, PLATFORM_OPTIONS } from '@/components/creators';
import { Button, Input, cx } from '@/components/ui';
import { AREA_BY_ROLE } from '@/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Public page: the only self sign-up in the portal (creators). Everyone else is invited by an admin. */
export function InfluencerSignupPage() {
  const [f, setF] = useState({ name: '', email: '', phone: '', city: '', niches: [], platform: 'INSTAGRAM', handle: '', followers: '', acceptTerms: false, consentToShare: true });
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (n) => setF({ ...f, niches: f.niches.includes(n) ? f.niches.filter((x) => x !== n) : [...f.niches, n].slice(0, 4) });

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const next = { ...validateNewPassword(pw) };
    if (f.name.trim().length < 2) next.name = 'Enter your name.';
    if (!EMAIL_RE.test(f.email.trim())) next.email = 'Enter a valid email address.';
    if (!/^\+?[0-9 ]{10,15}$/.test(f.phone.trim())) next.phone = 'Mobile number, like +91 98765 43210.';
    if (!f.city.trim()) next.city = 'Enter your city.';
    if (!f.niches.length) next.niches = 'Choose at least one.';
    if (!/^@?[A-Za-z0-9._-]{2,40}$/.test(f.handle.trim())) next.handle = 'Your handle, without spaces.';
    if (!(Number(f.followers) >= 1000)) next.followers = 'At least 1,000 followers.';
    if (!f.acceptTerms) next.acceptTerms = 'Accept the terms to continue.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const r = await api.influencers.signUp({ ...f, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), city: f.city.trim(), handle: f.handle.trim(), followers: Number(f.followers), password: pw.password });
      setSentTo(r.email);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not sign you up. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Work with brands through Webinger" tagline="Join our creator network. We verify every profile, keep your contact details private and pay on time, with TDS handled.">
      <div className="auth__form">
        <Link to="/login" className="back-link">
          <LuArrowLeft aria-hidden /> Already a member? Sign in
        </Link>
        {sentTo ? (
          <>
            <div>
              <LuMailCheck size={28} aria-hidden />
              <h2 style={{ marginTop: 8 }}>Confirm your email</h2>
              <p className="muted small">
                We sent a link to <strong>{sentTo}</strong>. Open it within 24 hours to finish your profile.
              </p>
            </div>
            <DemoEmail to={sentTo} />
          </>
        ) : (
          <form onSubmit={submit} noValidate className="grid" style={{ gap: 14 }}>
            <div>
              <h2>Join as a creator</h2>
              <p className="muted small">Takes two minutes. You finish your profile after confirming your email.</p>
            </div>
            <FormError>{formError}</FormError>
            <Input label="Full name" value={f.name} onChange={set('name')} error={errors.name} autoComplete="name" />
            <Input label="Email" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} error={errors.email} />
            <div className="grid grid--pair">
              <Input label="Mobile" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} error={errors.phone} />
              <Input label="City" value={f.city} onChange={set('city')} error={errors.city} />
            </div>
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field__label">What do you create? (up to 4)</legend>
              <div className="row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
                {NICHES.map((n) => (
                  <button key={n} type="button" className={cx('chip', f.niches.includes(n) && 'chip--on')} aria-pressed={f.niches.includes(n)} onClick={() => toggle(n)}>
                    {n}
                  </button>
                ))}
              </div>
              {errors.niches && <span className="field__error">{errors.niches}</span>}
            </fieldset>
            <div className="grid grid--pair">
              <label className="field">
                <span className="field__label">Main platform</span>
                <select className="field__input" value={f.platform} onChange={set('platform')}>
                  {PLATFORM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <Input label="Handle" value={f.handle} onChange={set('handle')} error={errors.handle} placeholder="@yourname" />
            </div>
            <Input label="Followers on that platform" inputMode="numeric" value={f.followers} onChange={set('followers')} error={errors.followers} />
            <NewPasswordFields value={pw} onChange={setPw} errors={errors} />
            <label className="check">
              <input type="checkbox" checked={f.consentToShare} onChange={(e) => setF({ ...f, consentToShare: e.target.checked })} />
              <span className="small">Show my profile (without contact details) to brands that work with Webinger.</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} />
              <span className="small">
                I accept the creator terms: brands are contacted only through Webinger, and paid posts carry a clear #ad or paid-partnership label.
              </span>
            </label>
            {errors.acceptTerms && <span className="field__error">{errors.acceptTerms}</span>}
            <Button type="submit" block loading={busy}>
              Create my account
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}

/** The link is single use; React may run the effect twice in development, so each token is sent once. */
const verifying = new Map();

/** /verify-email?token=… : confirms the email and signs the creator in. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { verifyEmail } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    if (!verifying.has(token)) verifying.set(token, verifyEmail(token));
    verifying
      .get(token)
      .then((u) => live && navigate(`${homePath(AREA_BY_ROLE[u.role])}/profile?welcome=1`, { replace: true }))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'This link did not work.'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthLayout title="Confirming your email" tagline="One moment.">
      <div className="auth__form">
        {error ? (
          <>
            <FormError>{error}</FormError>
            <Link to="/join">Sign up again</Link>
            <Link to="/login">Sign in</Link>
          </>
        ) : (
          <p className="muted">Checking your link…</p>
        )}
      </div>
    </AuthLayout>
  );
}
