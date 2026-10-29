import { api } from '../api/client';
import { Faq } from '../components/Faq';
import { Arrow, Book, Cap, Check, Notebook, Notes, Pencil, Trail } from '../components/Icons';
import { Cut, Photo } from '../components/Photo';
import { Accent, LinkButton, Reveal, RevealLink } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { useTitle } from '../lib/useTitle';

const FAQ = [
  { q: 'How does the free mentorship work?', a: 'Mentorship comes from organisations that offer free mentorship. It will be featured here for you to apply to. Live Mentorship is still being built.' },
  { q: 'Is mentorship guaranteed?', a: 'No. We will list mentorship programmes that exist and point you to them, but places are decided by the people who run each programme, not by AfriPath AI.' },
  { q: 'Who are the mentors?', a: 'We have not announced any mentors yet. When Live Mentorship opens, each programme and mentor will be shown on its own page so you can see who is offering what before you apply.' },
  { q: 'How do I track my progress?', a: 'Your roadmap lists every stage and step. Tick items off as you finish them. Your ticks are saved in this browser only, so they stay private to you.' },
];

export function StoryCard() {
  return (
    <Reveal className="story-card">
      <div className="story-row"><span className="big">Early - 2026</span><small>Started as an idea</small></div>
      <div className="story-row right"><span className="big">Mid - 2026</span><small>Evaluated and saw the need</small></div>
      <div className="story-row"><span className="big">Now</span><small>Confused paths replaced with clarity</small></div>
      <div className="story-live">AfriPath AI is now live</div>
    </Reveal>
  );
}

const STEPS = [
  { n: '01', tone: '', h: 'Brain Dump & Dig', em: 'session one', p: 'Take a short survey that digs into your interests, strengths and qualities.' },
  { n: '02', tone: ' tile--lime', h: 'Learn & match', em: 'the AI phase', p: 'AfriPath AI studies your answers and matches you with career paths that fit, and tells you exactly why.' },
  { n: '03', tone: ' tile--pink', h: 'Verify & plan', em: 'you and the future', p: 'You receive your suggestions, check them for yourself, and start the journey with a roadmap built for you.' },
  { n: '04', tone: ' tile--pink', h: 'Discover Opportunities', em: 'the accelerators', p: 'Courses, scholarships, internships, certifications, communities and grants — each one labelled with how far it has been checked.' },
];

const ASSURE = [
  ['Real Data', 'Paths are built from a curated knowledge base of real courses and projects.'],
  ['Clear Enough', 'Every suggestion is backed by evidence from your survey and explained clearly.'],
  ['A Path you can track', 'Your roadmap is a list of exactly what to do next, and you can tick things off.'],
  ['Opportunities which accelerate', 'From live mentorship to scholarships, there is more to explore as AfriPath grows.'],
];

export function HomePage() {
  useTitle();
  const health = useAsync((s) => api.health(s), 'health');
  const counts = health.status === 'ready' ? health.data.knowledgeBase?.counts : undefined;
  // Only real numbers from the engine are shown; if it is unreachable these tiles stay hidden.
  const stat = (k: 'careers' | 'stages' | 'resources') => (Number.isFinite(counts?.[k]) ? String(counts?.[k]) : null);
  const careers = stat('careers'), stages = stat('stages'), resources = stat('resources');

  return (
    <>
      <section className="hero"><div className="wrap">
        <Reveal as="span" className="pill">since 2026</Reveal>
        <Reveal as="h1" delay={0.08} className="display h-xl">Find the career path that <Accent>fits</Accent> you</Reveal>
        <Reveal as="p" delay={0.16} className="lead">Answer a short survey about your interests, strengths and goals. AfriPath AI matches you with career paths, explains why, and gives you a step-by-step roadmap to start.</Reveal>
        <Reveal delay={0.24} className="hero-cta">
          <LinkButton to="/afripath-ai" variant="primary" size="lg" arrow>Take the survey</LinkButton>
          <a className="btn btn--lg" href="#how">See how it works</a>
        </Reveal>
        <Photo className="hero-photo" delay={0.2} src="/img/hero.jpg" alt="Students learning together" label="Hero photo"/>
        <div className="stats" id="stats" aria-live="polite">
          <Reveal pop className="stat stat--blue"><strong>Survey first</strong><span>Your answers drive every suggestion</span></Reveal>
          {careers && <Reveal pop delay={0.08} className="stat stat--lime"><strong>{careers}</strong><span>Career paths in the engine today</span></Reveal>}
          {stages && <Reveal pop delay={0.16} className="stat stat--pink"><strong>{stages}</strong><span>Roadmap stages to follow</span></Reveal>}
          {resources && <Reveal pop delay={0.24} className="stat stat--peach"><strong>{resources}</strong><span>Learning resources listed</span></Reveal>}
        </div>
      </div></section>

      <section className="section" id="story"><div className="wrap">
        <div className="story"><StoryCard /><Photo className="story-photo" delay={0.15} src="/img/story.jpg" alt="A student writing in a notebook" label="Story photo"/></div>
      </div></section>

      <section className="section" id="how" style={{ paddingTop: 0 }}>
        <div className="wrap how">
          <div className="how-left">
            <Reveal><h2 className="display h-lg">How it <Accent>works</Accent></h2><p className="lead">Three steps, then the hidden potential gets a clear direction.</p></Reveal>
            <Photo src="/img/how.jpg" alt="A student thinking with a pencil" label="How-it-works photo"/>
          </div>
          <div className="how-list">
            {STEPS.map((s) => (
              <Reveal as="article" key={s.n} className="step"><span className={`tile${s.tone}`}>{s.n}</span><div><h3>{s.h} <em>— {s.em}</em></h3><p>{s.p}</p></div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 'clamp(64px,8vw,130px)' }}>
        <Reveal className="assure">
          {ASSURE.map(([h, p]) => <div key={h}><h3><span><Check /></span>{h}</h3><p>{p}</p></div>)}
        </Reveal>
      </section>

      <section className="wrap" style={{ paddingBottom: 'clamp(64px,9vw,150px)' }}>
        <div className="discover-head">
          <Reveal><span className="pill">Levels</span><h2 className="display h-lg">Discover where <Accent>you are</Accent></h2></Reveal>
          <Reveal as="p" delay={0.1}>Every student is different. Let's find the right starting point, then tackle the need.</Reveal>
        </div>
        <div className="choices">
          {[
            ['/afripath-ai', '', <Pencil key="i" />, 'Just starting', 'Just finished SHS and confused', 0],
            ['/afripath-ai', ' tile--lime', <Book key="i" />, 'Already with something in mind', 'There is a career but no clear path', 0.08],
            ['/mentorship', ' tile--pink', <Notes key="i" />, 'Need a mentor', 'Have a path but need a mentor to guide me', 0.16],
            ['/opportunities', ' tile--peach', <Cap key="i" />, 'What can accelerate', 'Want to discover opportunities that accelerate', 0.24],
          ].map(([to, tone, icon, h, p, d]) => (
            <RevealLink key={String(h)} delay={Number(d)} className="choice" to={String(to)}><span className={`tile${tone}`}>{icon}</span><div><h3>{h}</h3><p>{p}</p></div><span className="go"><Arrow /></span></RevealLink>
          ))}
        </div>
      </section>

      <section className="band-lime section"><div className="wrap split">
        <Photo src="/img/opportunities.jpg" alt="A magnifying glass over a globe" label="Opportunities photo"/>
        <div>
          <Reveal as="span" className="pill">Scholarships & Activities</Reveal>
          <Reveal as="h2" delay={0.06} className="display h-lg">What Opportunities are <Accent>Available to explore</Accent></Reveal>
          <Reveal as="p" delay={0.12} className="lead">Browse the opportunities to see a fit. Don't quit when you don't see one now; there is always one in a million for only you.</Reveal>
          <Reveal delay={0.18} className="chips"><span className="chip">Scholarships</span><span className="chip">Internships</span><span className="chip">Summer Programs</span><span className="chip">Many More</span></Reveal>
          <Reveal delay={0.24}><LinkButton to="/opportunities" variant="ink" arrow>Explore opportunities</LinkButton></Reveal>
        </div>
      </div></section>

      <section className="section"><div className="wrap">
        <Reveal as="h2" className="display h-lg center" style={{ maxWidth: '13ch', marginInline: 'auto' }}>Check Out, some <Accent>surprises</Accent></Reveal>
        <Faq items={FAQ} />
      </div></section>

      <section className="cta">
        <div className="arch" aria-hidden="true" /><div className="blob" aria-hidden="true" />
        <Notebook className="notebook" /><Trail className="trail" />
        <Cut className="cut-l" src="/img/cta-left.png" alt="A mentor holding a tablet" />
        <Cut className="cut-r" src="/img/cta-right.png" alt="A student reading on a stack of books" />
        <div className="wrap">
          <Reveal as="span" className="pill pill--plain">Your Future Has More Than One Path</Reveal>
          <Reveal as="h2" delay={0.08} className="display h-xl">Ready To Find Your Path <Accent>In Ghana</Accent></Reveal>
          <Reveal as="p" delay={0.16} className="lead">Have a quick survey with AfriPath AI to explore your career match.</Reveal>
          <Reveal delay={0.24}><LinkButton to="/afripath-ai" size="lg">I am ready AfriPath</LinkButton></Reveal>
        </div>
      </section>
    </>
  );
}
