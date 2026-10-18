import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './context/AppContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/Ui';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Sessions } from './pages/Sessions';
import { SessionDetail } from './pages/SessionDetail';
import { SessionEditor } from './pages/SessionEditor';
import { Exercises } from './pages/Exercises';
import { ExerciseDetail } from './pages/ExerciseDetail';
import { Checkin } from './pages/Checkin';
import { DataPage } from './pages/DataPage';
import { Posts } from './pages/Posts';
import { PostEditor } from './pages/PostEditor';
import { PublicPost } from './pages/PublicPost';
import { Settings } from './pages/Settings';
import { Community } from './pages/Community';
import { Admin } from './pages/Admin';

function RequireAuth() {
  const { user, booting } = useApp();
  const location = useLocation();
  if (booting) return <Spinner label="正在载入练迹" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Layout />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/p/:id" element={<PublicPost />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Home />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/sessions/new" element={<SessionEditor />} />
        <Route path="/sessions/:id/edit" element={<SessionEditor />} />
        <Route path="/sessions/:id" element={<SessionDetail />} />
        <Route path="/exercises" element={<Exercises />} />
        <Route path="/exercises/:id" element={<ExerciseDetail />} />
        <Route path="/checkin" element={<Checkin />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="/posts" element={<Posts />} />
        <Route path="/posts/new" element={<PostEditor />} />
        <Route path="/posts/:id/edit" element={<PostEditor />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/community" element={<Community />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
