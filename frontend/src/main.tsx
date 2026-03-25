import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './components/ui/Toast';
import { Layout } from './components/layout/Layout';
import { LayoutViewer } from './components/layout/LayoutViewer';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import AgentsPage from './pages/Agents';
import { CampagnesPage, CampagneDetailPage, NouvelleCampagnePage } from './pages/Campagnes';
import HistoriquePage from './pages/Historique';
import UtilisateursPage from './pages/Utilisateurs';
import RolesMetierPage from './pages/RolesMetier';
import CampagnesLecteurPage from './pages/CampagnesLecteur';
import CampagneDetailLecteurPage from './pages/CampagneDetailLecteur';
import ComptePage from './pages/Compte';
import './index.css';



function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace/>;
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage/>}/>

              {/* Interface principale (admin + responsables) */}
              <Route path="/" element={<ProtectedRoute><LayoutWrapper/></ProtectedRoute>}>
                <Route index element={<DashboardPage/>}/>
                <Route path="agents" element={<AgentsPage/>}/>
                <Route path="campagnes" element={<CampagnesPage/>}/>
                <Route path="campagnes/nouvelle" element={<NouvelleCampagnePage/>}/>
                <Route path="campagnes/:id" element={<CampagneDetailPage/>}/>
                <Route path="historique" element={<HistoriquePage/>}/>
                <Route path="compte" element={<ComptePage/>}/>
                <Route path="utilisateurs" element={<UtilisateursPage/>}/>
                <Route path="roles-metier" element={<RolesMetierPage/>}/>
                {/* Routes lecteur accessibles aussi depuis le layout principal */}
                <Route path="campagnes-viewer" element={<CampagnesLecteurPage/>}/>
                <Route path="campagnes-viewer/:id" element={<CampagneDetailLecteurPage/>}/>
              </Route>

              <Route path="*" element={<Navigate to="/" replace/>}/>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Wrapper qui choisit le bon layout selon le type d'utilisateur
function LayoutWrapper() {
  const { isViewer } = useAuth();
  return isViewer ? <LayoutViewer/> : <Layout/>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App/></React.StrictMode>
);
