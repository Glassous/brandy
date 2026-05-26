import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ToastType = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
}

interface ToastCtx {
  showToast: (text: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((text: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.text}
        </div>
      ))}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
