import { PageHero } from '../components/PageHero';
import { LinkButton, Reveal } from '../components/ui';
import { useTitle } from '../lib/useTitle';

export function LoginPage() {
  useTitle('Login');
  return (
    <>
      <PageHero pill="Accounts" title={[{ accent: 'Login' }, ' is on the way']} lead="Accounts will let you save your matches and progress across devices. They are not open yet, and you do not need one to use AfriPath AI." />
      <section className="wrap" style={{ paddingBottom: 'clamp(60px,8vw,130px)' }}>
        <Reveal className="panel login-card">
          <form onSubmit={(e) => e.preventDefault()} aria-describedby="login-note">
            <div className="form-field"><label htmlFor="em">Email</label><input id="em" type="email" placeholder="you@example.com" disabled /></div>
            <div className="form-field"><label htmlFor="pw">Password</label><input id="pw" type="password" placeholder="••••••••" disabled /></div>
            <button className="btn btn--ink" type="button" disabled>Login (not open yet)</button>
          </form>
          <p className="small" id="login-note" style={{ marginTop: 16 }}>AfriPath AI is not asking for any account details yet.</p>
          <LinkButton to="/afripath-ai" variant="primary" arrow>Continue without an account</LinkButton>
        </Reveal>
      </section>
    </>
  );
}
