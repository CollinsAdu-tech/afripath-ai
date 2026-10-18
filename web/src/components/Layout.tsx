import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Arrow, Hills, Logo } from './Icons';
import { SITE } from '../lib/useTitle';

export const NAV = [
  { to: '/opportunities', label: 'Opportunities' },
  { to: '/mentorship', label: 'Live Mentorship' },
  { to: '/about', label: 'About' },
  { to: '/afripath-ai', label: SITE, ai: true },
] as const;

function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className={`site-header${scrolled ? ' scrolled' : ''}${open ? ' menu-open' : ''}`} id="top">
      <div className="wrap nav">
        <Link className="brand" to="/" aria-label={`${SITE} home`}><Logo /><span>{SITE}</span></Link>
        <ul className="nav-links" id="nav-links">
          {NAV.map((n) => (
            <li key={n.to}><NavLink to={n.to} className={'ai' in n ? 'is-ai' : undefined}>{n.label}</NavLink></li>
          ))}
        </ul>
        <div className="nav-cta">
          <Link className="btn btn--steel" to="/login">Login</Link>
          <button className="menu-btn" type="button" aria-label="Menu" aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((o) => !o)}><span /><span /><span /></button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const links = [{ to: '/', label: 'Home', end: true }, ...NAV, { to: '/login', label: 'Login' }, { to: '/privacy', label: 'Privacy' }];
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <Link className="brand" to="/"><Logo /><span>{SITE}</span></Link>
            <p className="muted">Find your career path. Online, built for students in Ghana and beyond.</p>
          </div>
          <nav aria-label="Footer"><h4>Pages</h4>
            <ul className="foot-links">{links.map((l) => <li key={l.to}><NavLink to={l.to} end={'end' in l}>{l.label}</NavLink></li>)}</ul>
          </nav>
          <div className="foot-cta">
            <p>Not sure where to start? Take the quick survey.</p>
            <Link className="btn btn--primary" to="/afripath-ai">Start the survey <span className="arrow" aria-hidden="true"><Arrow width={18} height={18} /></span></Link>
          </div>
        </div>
        <div className="foot-bar"><span>© 2026 {SITE}</span><Link to="/privacy">Privacy</Link></div>
      </div>
      <div className="hills"><Hills /></div>
    </footer>
  );
}

/** Scroll to the top on navigation (or to the #anchor when there is one). */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) { document.getElementById(hash.slice(1))?.scrollIntoView(); return; }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export function Layout() {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main"><Outlet /></main>
      <Footer />
      <ScrollToTop />
    </>
  );
}
