import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';
interface Notice {
  id: number;
  message: string;
  tone: Tone;
}
interface OpsToastState {
  show: (message: string, tone?: Tone) => void;
}

const Ctx = createContext<OpsToastState | null>(null);

export function OpsToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notice[]>([]);
  const show = useCallback((message: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, message, tone }]);
    window.setTimeout(() => setItems((list) => list.filter((item) => item.id !== id)), 3600);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="ops-toasts" aria-live="polite">
        {items.map((item) => <div key={item.id} className={`ops-toast ops-toast-${item.tone}`}>{item.message}</div>)}
      </div>
    </Ctx.Provider>
  );
}

export function useOpsToast() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useOpsToast must be used inside OpsToastProvider');
  return value.show;
}
