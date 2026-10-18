import { Faq } from '../components/Faq';
import { PageHero } from '../components/PageHero';
import { Accent, LinkButton, Reveal, Tile } from '../components/ui';
import { useTitle } from '../lib/useTitle';

export const MENTORSHIP_FAQ = [
  { q: 'How does the free mentorship work?', a: 'Mentorship comes from organisations that offer free mentorship. It will be featured here for you to apply to. Live Mentorship is still being built.' },
  { q: 'Is mentorship guaranteed?', a: 'No. We will list mentorship programmes that exist and point you to them, but places are decided by the people who run each programme, not by AfriPath AI.' },
  { q: 'Who are the mentors?', a: 'We have not announced any mentors yet. When Live Mentorship opens, each programme and mentor will be shown on its own page so you can see who is offering what before you apply.' },
];

export function MentorshipPage() {
  useTitle('Live Mentorship');
  return (
    <>
      <PageHero pill="Coming soon" title={['Live ', { accent: 'Mentorship' }]} lead="Learn from people who have walked the path. Live Mentorship is not open yet. Here is how we plan it to work." />
      <section className="wrap" style={{ paddingBottom: 'clamp(40px,5vw,80px)' }}>
        <div className="grid-3">
          <Reveal as="article" className="panel panel--blue"><Tile>01</Tile><h3>Find your path</h3><p>Take the AfriPath AI survey so you know which career path to look for a mentor in.</p></Reveal>
          <Reveal as="article" delay={0.08} className="panel panel--lime"><Tile tone="lime">02</Tile><h3>Find a programme</h3><p>We will list mentorship programmes offered by organisations. You apply to them directly.</p></Reveal>
          <Reveal as="article" delay={0.16} className="panel panel--pink"><Tile tone="pink">03</Tile><h3>Meet your mentor</h3><p>Sessions are run by each programme. We will show who is offering what before you apply.</p></Reveal>
        </div>
        <Reveal className="notice" style={{ marginTop: 28 }}><b>To be clear:</b> no mentors have been announced yet and no places are guaranteed. We will update this page when programmes are ready.</Reveal>
        <Reveal as="p" className="center" style={{ marginTop: 32 }}><LinkButton to="/afripath-ai" variant="primary" size="lg" arrow>Start with the survey</LinkButton></Reveal>
      </section>
      <section className="section"><div className="wrap">
        <h2 className="display h-lg center">Questions about <Accent>mentorship</Accent></h2>
        <Faq items={MENTORSHIP_FAQ} animate={false} />
      </div></section>
    </>
  );
}
