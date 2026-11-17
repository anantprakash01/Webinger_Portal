import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCheck, LuCircleAlert, LuEye, LuEyeOff, LuMail } from 'react-icons/lu';
import { isMock } from '@/api/client';
import { useDemoOutbox } from '@/api/queries';
import { Logo } from './Logo';
import { Input, cx } from './ui';
import '@/layout/shell.css';

/** Split screen used by every signed-out page. */
export function AuthLayout({ title, tagline, children }) {
  return (
    <div className="auth">
      <section className="auth__panel">
        <Logo height={30} inverse />
        <div>
          <h1>{title ?? 'Everything about your work, in one place.'}</h1>
          <p className="auth__tag">
            {tagline ?? 'Projects, approvals, reports and conversations with the Webinger team, from any device.'}
          </p>
        </div>
        <span className="auth__dot" aria-hidden />
      </section>
      <section className="auth__form-wrap">{children}</section>
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <div className="alert alert--error" role="alert">
      <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{children}</span>
    </div>
  );
}

/** Mirrors the server policy in src/api/mock/accounts.ts (passwordProblem). The server still decides. */
export const PASSWORD_RULES = [
  { id: 'len', text: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'mix', text: 'A letter and a number', test: (p) => /[A-Za-z]/.test(p) && /\d/.test(p) },
];

/** New password + confirm, with live rule checks. Calls onChange({ password, confirm }). */
export function NewPasswordFields({ value, onChange, errors = {} }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <div className="pw">
        <Input
          label="New password"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={value.password}
          onChange={(e) => onChange({ ...value, password: e.target.value })}
          error={errors.password}
          aria-describedby="pw-rules"
          style={{ paddingRight: 44, width: '100%' }}
        />
        {!errors.password && (
          <button type="button" className="pw__toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <LuEyeOff size={18} /> : <LuEye size={18} />}
          </button>
        )}
      </div>
      <ul id="pw-rules" className="pw-rules">
        {PASSWORD_RULES.map((r) => {
          const met = r.test(value.password);
          return (
            <li key={r.id} className={cx(met && 'is-met')}>
              <LuCheck aria-hidden /> {r.text}
              <span className="sr-only">{met ? ' (done)' : ' (not yet)'}</span>
            </li>
          );
        })}
      </ul>
      <Input
        label="Confirm password"
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        value={value.confirm}
        onChange={(e) => onChange({ ...value, confirm: e.target.value })}
        error={errors.confirm}
      />
    </>
  );
}

export function validateNewPassword({ password, confirm }) {
  const errors = {};
  const broken = PASSWORD_RULES.find((r) => !r.test(password));
  if (broken) errors.password = `${broken.text} is required.`;
  else if (confirm !== password) errors.confirm = 'Passwords do not match.';
  return errors;
}

/**
 * Prototype only. There is no inbox in the demo, so this shows the email the
 * system would have sent and lets the reviewer open its link.
 */
export function DemoEmail({ to, refreshKey }) {
  const { data } = useDemoOutbox(to, isMock && !!to);
  if (!isMock || !to) return null;
  const mail = data?.[0];
  return (
    <div className="demo-email" role="note" key={refreshKey}>
      <div className="row small" style={{ fontWeight: 700 }}>
        <LuMail aria-hidden /> Demo inbox for {to}
      </div>
      {mail ? (
        <>
          <div className="small">{mail.subject}</div>
          <div className="list__meta">{mail.body}</div>
          {mail.link && (
            <Link to={mail.link} className="small" style={{ fontWeight: 600 }}>
              Open the link from this email
            </Link>
          )}
        </>
      ) : (
        <div className="list__meta">No email was sent. In the real system the reply is the same either way, so nobody can test which emails have accounts.</div>
      )}
    </div>
  );
}
