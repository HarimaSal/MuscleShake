import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { clearOpsToken, getOpsToken, ops, setOpsToken, type OpsAdmin, type OpsSession } from './opsApi';
import { Spinner } from '../../src/components/Ui';

interface OpsAuthState {
  admin: OpsAdmin | null;
  booting: boolean;
  signIn: (session: OpsSession) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const OpsAuthContext = createContext<OpsAuthState | null>(null);

export function OpsAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<OpsAdmin | null>(null);
  const [booting, setBooting] = useState(true);

  const refresh = useCallback(async () => {
    if (!getOpsToken()) {
      setAdmin(null);
      setBooting(false);
      return;
    }
    try {
      const data = await ops.get<OpsAdmin>('/auth/me');
      setAdmin(data);
    } catch {
      clearOpsToken();
      setAdmin(null);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<OpsAuthState>(
    () => ({
      admin,
      booting,
      signIn: (session) => {
        setOpsToken(session.token);
        setAdmin(session.admin);
      },
      signOut: async () => {
        try {
          await ops.post('/auth/logout');
        } catch {
          /* token may already be expired */
        }
        clearOpsToken();
        setAdmin(null);
      },
      refresh,
    }),
    [admin, booting, refresh],
  );

  return <OpsAuthContext.Provider value={value}>{children}</OpsAuthContext.Provider>;
}

export function useOpsAuth() {
  const value = useContext(OpsAuthContext);
  if (!value) throw new Error('useOpsAuth must be used inside OpsAuthProvider');
  return value;
}

export function OpsGuard({ children }: { children: ReactNode }) {
  const { admin, booting } = useOpsAuth();
  const location = useLocation();
  if (booting) return <Spinner label="正在验证后台会话" />;
  if (!admin) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
