import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Layout } from './components/Layout';
import { AccountPage } from './pages/AccountPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { ExperimentalAnalysisPage } from './pages/ExperimentalAnalysisPage';
import { WhaleFinderPage } from './pages/WhaleFinderPage';
import { LoginPage } from './pages/LoginPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-background text-foreground">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/callback" element={<OAuthCallbackPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <AccountPage />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analysis"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <AnalysisPage />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/experimental-analysis"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <ExperimentalAnalysisPage />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/whale-finder"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <WhaleFinderPage />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
