import { api } from '../api/client';
import { PageHero } from '../components/PageHero';
import { StoryCard } from './HomePage';
import { Photo } from '../components/Photo';
import { Accent, LinkButton, Reveal, Tile } from '../components/ui';
import { useAsync } from '../lib/useAsync';
import { useTitle } from '../lib/useTitle';

export function AboutPage() {
  useTitle('About');
  const health = useAsync((s) => api.health(s), 'health');
  const careers = health.status === 'ready' ? health.data.knowledgeBase?.counts?.careers : undefined;
  return (
    <>
      <PageHero pill="About AfriPath AI" title={['Every student deserves a ', { accent: 'clear' }, ' path']} lead="AfriPath AI helps students who feel lost about their future find a direction they can act on, starting with a short survey and a roadmap that is explained, not mysterious." />

      <section className="section" style={{ paddingTop: 0 }}><div className="wrap">
        <div className="story"><StoryCard /><Photo className="story-photo" delay={0.15} src="/img/story.jpg" alt="A student writing in a notebook" label="Story photo" /></div>
      </div></section>

      <section className="section" style={{ paddingTop: 0 }}><div className="wrap">
        <div className="sec-head">
          <Reveal as="span" className="pill">The vision</Reveal>
          <Reveal as="h2" delay={0.06} className="display h-lg">Where we are <Accent>going</Accent></Reveal>
          <Reveal as="p" delay={0.12} className="lead">AfriPath AI is the first step. It is the MVP of something bigger, and it will grow in stages. We are not promising dates, only direction.</Reveal>
        </div>
        <div className="vision">
          <Reveal as="article" className="panel panel--lime"><span className="status-pill">Live now</span><Tile tone="lime">01</Tile><h3>AfriPath AI</h3><p>Students take a survey about their interests, strengths, ways of working, background and goals. The survey feeds our recommendation engine, which matches them to career paths, explains every match, and builds a roadmap from real courses and projects. Today the engine covers <b data-count="careers">{careers ?? 'a first set of'}</b> career paths.</p></Reveal>
          <Reveal as="article" delay={0.08} className="panel panel--blue"><span className="status-pill status-pill--soon">Next</span><Tile>02</Tile><h3>More career fields</h3><p>We will keep adding career paths to the engine, so more students find a field that fits them, in areas well beyond technology.</p></Reveal>
          <Reveal as="article" delay={0.16} className="panel panel--pink"><span className="status-pill status-pill--soon">Next</span><Tile tone="pink">03</Tile><h3>More opportunities</h3><p>Scholarships, internships, summer programmes, certifications, communities and grants, each one labelled with how far it has been checked, so students know what to trust.</p></Reveal>
          <Reveal as="article" delay={0.24} className="panel panel--peach"><span className="status-pill status-pill--soon">Next</span><Tile tone="peach">04</Tile><h3>More live mentorship</h3><p>Connecting students with mentors and with organisations that offer mentorship, so a path on paper becomes someone to walk it with.</p></Reveal>
        </div>
      </div></section>

      <section className="section band-lime"><div className="wrap">
        <div className="sec-head"><Reveal as="h2" className="display h-lg">How we <Accent>build</Accent> it</Reveal></div>
        <div className="grid-3">
          <Reveal as="article" className="panel"><h3>Explained, not a black box</h3><p>Every match shows the answers behind it and how the score was worked out. The score is a guide for exploring, never a prediction of success.</p></Reveal>
          <Reveal as="article" delay={0.08} className="panel"><h3>Honest about what we know</h3><p>Courses and opportunities come from a source list we have not independently verified, and we say so. We never call something free or open unless the source does.</p></Reveal>
          <Reveal as="article" delay={0.16} className="panel"><h3>Private by default</h3><p>No account is needed and the survey asks for no name, email or phone number. The engine does not store your answers.</p></Reveal>
        </div>
      </div></section>

      <section className="section center"><div className="wrap">
        <Reveal as="h2" className="display h-lg">Start with <Accent>AfriPath AI</Accent></Reveal>
        <Reveal as="p" delay={0.1} className="lead">It takes about five minutes.</Reveal>
        <Reveal delay={0.18} style={{ marginTop: 28 }}><LinkButton to="/afripath-ai" variant="primary" size="lg" arrow>Take the survey</LinkButton></Reveal>
      </div></section>
    </>
  );
}
