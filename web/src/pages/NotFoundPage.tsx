import { PageHero } from '../components/PageHero';
import { LinkButton } from '../components/ui';
import { useTitle } from '../lib/useTitle';

export function NotFoundPage() {
  useTitle('Page not found');
  return (
    <>
      <PageHero pill="404" title={['That page ', { accent: 'wandered' }, ' off']} lead="We could not find what you were looking for.">
        <p style={{ marginTop: 24 }}><LinkButton to="/" variant="primary">Back to the home page</LinkButton></p>
      </PageHero>
    </>
  );
}
