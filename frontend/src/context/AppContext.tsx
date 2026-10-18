import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, getTokens, setTokens } from '../api';
import type { Config, MeResponse, Tokens, User } from '../types';

type ToastKind = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface AppValue {
  user: User | null;
  me: MeResponse | null;
  config: Config | null;
  booting: boolean;
  signIn: (tokens: Tokens, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  loadMe: () => Promise<MeResponse | null>;
  setUser: (user: User) => void;
  toast: (message: string, kind?: ToastKind) => void;
  refreshConfig: () => Promise<void>;
}

const AppContext = createContext<AppValue | null>(null);

const defaultConfig: Config = {
  productName: '练迹 FitLog',
  communityVisible: true,
  communityNote: '社区功能正在规划中，暂未开放',
  quotaGb: 50,
  publicDailyQuota: 20,
  publicListingEnabled: false,
  brandWatermarkText: '练迹',
  budget: { level: 'normal', ratio: 0, capCny: 20, spentCny: 0, videoUploadAllowed: true, message: '' },
  reviewPolicy: {},
  features: {},
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [booting, setBooting] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 3600);
  }, []);

  const loadMe = useCallback(async () => {
    try {
      let data = await api.get<MeResponse>('/api/auth/me');
      const deviceTz = new Date().getTimezoneOffset();
      if (data.user.tzOffset !== deviceTz) {
        try {
          const updated = await api.patch<{ user: User }>('/api/auth/me', { tzOffset: deviceTz });
          data = { ...data, user: updated.user };
        } catch {
          /* 时区同步失败不阻塞使用 */
        }
      }
      setMe(data);
      setUserState(data.user);
      return data;
    } catch {
      setUserState(null);
      setMe(null);
      return null;
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const data = await api.get<Config>('/api/config', { auth: false });
      setConfig(data);
    } catch {
      setConfig(defaultConfig);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshConfig();
      if (getTokens()?.accessToken) await loadMe();
      setBooting(false);
      if (!sessionStorage.getItem('fitlog.app_open')) {
        sessionStorage.setItem('fitlog.app_open', '1');
        api
          .post(
            '/api/config/events',
            { name: 'app_open', props: { platform: 'web', referrer: document.referrer.slice(0, 200) } },
            { auth: !!getTokens()?.accessToken },
          )
          .catch(() => undefined);
      }
    })();
  }, [loadMe, refreshConfig]);

  const signIn = useCallback(
    async (tokens: Tokens, nextUser: User) => {
      setTokens(tokens);
      setUserState(nextUser);
      await loadMe();
    },
    [loadMe],
  );

  const signOut = useCallback(async () => {
    const tokens = getTokens();
    try {
      if (tokens?.refreshToken) await api.post('/api/auth/logout', { refreshToken: tokens.refreshToken });
    } catch {
      /* ignore */
    }
    setTokens(null);
    setUserState(null);
    setMe(null);
  }, []);

  const setUser = useCallback((next: User) => setUserState(next), []);

  const value = useMemo<AppValue>(
    () => ({
      user,
      me,
      config: config ?? defaultConfig,
      booting,
      signIn,
      signOut,
      loadMe,
      setUser,
      toast,
      refreshConfig,
    }),
    [user, me, config, booting, signIn, signOut, loadMe, setUser, toast, refreshConfig],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast toast-${item.kind}`}>
            {item.message}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp(): AppValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
