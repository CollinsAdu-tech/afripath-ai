import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AboutPage } from './pages/AboutPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MentorshipPage } from './pages/MentorshipPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ResultsPage } from './pages/ResultsPage';
import { RoadmapPage } from './pages/RoadmapPage';
import { SurveyPage } from './pages/SurveyPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="afripath-ai" element={<SurveyPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="roadmap/:careerId" element={<RoadmapPage />} />
        <Route path="opportunities" element={<OpportunitiesPage />} />
        <Route path="mentorship" element={<MentorshipPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
