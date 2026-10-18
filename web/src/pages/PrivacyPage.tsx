import { PageHero } from '../components/PageHero';
import { useTitle } from '../lib/useTitle';

export function PrivacyPage() {
  useTitle('Privacy');
  return (
    <>
      <PageHero pill="Privacy" title={['Your answers stay ', { accent: 'yours' }]} />
      <section className="wrap" style={{ paddingBottom: 'clamp(60px,8vw,130px)' }}><div className="prose">
        <h2>What the survey asks</h2>
        <p>Only the questions you see: interests, strengths, how you like to work, subjects and level of study, goals, and practical details such as budget, internet, device and study hours. It does not ask for your name, email, phone number or location, and every question is optional.</p>
        <h2>Where your answers go</h2>
        <p>When you ask for your matches or a roadmap, your answers are sent to the AfriPath AI engine to calculate them. The engine does not store your answers and does not write them to its logs.</p>
        <h2>What stays in your browser</h2>
        <ul><li>Your survey answers are kept in this browser tab only, so you can go back and change them. They are cleared when you close the tab.</li><li>Roadmap ticks are saved in this browser so they are still there when you return. Nobody else can see them.</li></ul>
        <p>We do not use cookies or analytics on these pages.</p>
        <h2>Other websites</h2>
        <p>Roadmaps link to courses and opportunities on other sites. Those sites have their own privacy practices, and we have not independently verified them.</p>
        <h2>Server logs</h2>
        <p>Whoever hosts this site may keep standard server logs, such as the time of a visit and your network address. Ask your host for details.</p>
      </div></section>
    </>
  );
}
