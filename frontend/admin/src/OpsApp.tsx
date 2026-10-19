import { Navigate, Route, Routes } from 'react-router-dom';
import { OpsAuthProvider, OpsGuard } from './OpsAuth';
import { OpsLogin } from './OpsLogin';
import { OpsLayout } from './OpsLayout';
import { OpsToastProvider } from './OpsToast';
import { OpsDashboard } from './OpsDashboard';
import { OpsExercisesPage, OpsExerciseEditorPage, OpsExerciseVersionsPage, OpsImportPage, OpsMergePage, OpsSearchQualityPage } from './OpsExercises';
import { OpsBannersPage, OpsContentEditorPage, OpsContentsPage, OpsHelpPages, OpsTemplatesPage } from './OpsContent';
import { OpsReportsPage, OpsReviewQueuePage, OpsRulesPage, OpsSpotcheckPage } from './OpsReview';
import { OpsConfigDetailPage, OpsConfigsPage } from './OpsConfig';
import { OpsUsersPage } from './OpsUsers';
import { OpsAnalyticsPage } from './OpsAnalytics';
import { OpsSystemPage } from './OpsSystem';
import { OpsTestAccountPage } from './OpsTestAccount';

export function OpsApp() {
  return (
    <OpsAuthProvider>
      <OpsToastProvider>
        <Routes>
          <Route path="login" element={<OpsLogin />} />
          <Route
            element={
              <OpsGuard>
                <OpsLayout />
              </OpsGuard>
            }
          >
            <Route index element={<OpsDashboard />} />
            <Route path="exercises" element={<OpsExercisesPage />} />
            <Route path="exercises/new" element={<OpsExerciseEditorPage />} />
            <Route path="exercises/import" element={<OpsImportPage />} />
            <Route path="exercises/merge" element={<OpsMergePage />} />
            <Route path="exercises/search-quality" element={<OpsSearchQualityPage />} />
            <Route path="exercises/:id" element={<OpsExerciseEditorPage />} />
            <Route path="exercises/:id/versions" element={<OpsExerciseVersionsPage />} />
            <Route path="official" element={<OpsContentsPage />} />
            <Route path="official/new" element={<OpsContentEditorPage />} />
            <Route path="official/templates" element={<OpsTemplatesPage />} />
            <Route path="official/help" element={<OpsHelpPages />} />
            <Route path="official/banners" element={<OpsBannersPage />} />
            <Route path="official/:id" element={<OpsContentEditorPage />} />
            <Route path="review" element={<OpsReviewQueuePage />} />
            <Route path="review/reports" element={<OpsReportsPage />} />
            <Route path="review/rules" element={<OpsRulesPage />} />
            <Route path="review/spotcheck" element={<OpsSpotcheckPage />} />
            <Route path="configs" element={<OpsConfigsPage />} />
            <Route path="configs/:key" element={<OpsConfigDetailPage />} />
            <Route path="users" element={<OpsUsersPage />} />
            <Route path="analytics" element={<OpsAnalyticsPage />} />
            <Route path="system" element={<OpsSystemPage />} />
            <Route path="test-account" element={<OpsTestAccountPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </OpsToastProvider>
    </OpsAuthProvider>
  );
}
