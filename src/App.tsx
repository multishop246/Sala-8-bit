import { Navigate, Route, Routes } from 'react-router-dom';
import { configured, isDemo } from './lib/supabase';
import { useAuth } from './lib/auth';
import { Setup } from './pages/Setup';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Invite } from './pages/Invite';
import { WorkspaceShell } from './pages/WorkspaceShell';
import { Office } from './pages/Office';
import { Settings } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { Loading } from './components/Loading';
import { DemoBar } from './components/DemoBar';

export function App() {
  const { session, loading } = useAuth();
  if (!configured) return <Setup />;
  if (loading) return <Loading />;
  return (
    <>
    {isDemo && <DemoBar />}
    <Routes>
      <Route path="/convite/:token" element={<Invite />} />
      {!session ? (
        <Route path="*" element={<Login />} />
      ) : (
        <>
          <Route path="/" element={<Home />} />
          <Route path="/w/:slug" element={<WorkspaceShell />}>
            <Route index element={<Office />} />
            <Route path="personagem" element={<Onboarding edit />} />
            <Route path="config" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
    </>
  );
}
