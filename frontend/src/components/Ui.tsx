import {
  useEffect,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

/* ------------------------------- Button ------------------------------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'soft';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = 'outline', size = 'md', loading, icon, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

/* -------------------------------- Card -------------------------------- */
export function Card({
  children,
  className = '',
  padded = true,
  style,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section className={`card ${padded ? 'card-padded' : ''} ${className}`} style={style}>
      {children}
    </section>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  action,
  description,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && <p className="muted small">{description}</p>}
      </div>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}

/* -------------------------------- Form -------------------------------- */
export function Field({ label, hint, error, children, className = '' }: { label?: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input textarea ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`input select ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-track">
        <span className="switch-dot" />
      </span>
      {label && <span className="switch-label">{label}</span>}
    </button>
  );
}

/* ------------------------------- Overlay ------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <header className="modal-head">
          <div>
            <h3>{title}</h3>
            {description && <p className="muted small">{description}</p>}
          </div>
          <IconButton label="关闭" onClick={onClose}>
            ✕
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="dialog-message">{message}</p>
    </Modal>
  );
}

/* -------------------------------- Misc -------------------------------- */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  size = 'md',
}: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ value: T; label: string; count?: number }>;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`tabs tabs-${size}`} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          className={`tab ${value === item.value ? 'active' : ''}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && <span className="tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action, icon = '◌' }: { title: string; description?: string; action?: ReactNode; icon?: string }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading">
      <span className="spinner lg" />
      {label && <span className="muted small">{label}</span>}
    </div>
  );
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'accent' | 'warn' | 'danger' | 'info' | 'muted' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Progress({ value, max = 100, tone = 'accent' }: { value: number; max?: number; tone?: 'accent' | 'warn' | 'danger' }) {
  const ratio = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={`progress progress-${tone}`}>
      <div className="progress-fill" style={{ width: `${ratio}%` }} />
    </div>
  );
}

export function Stat({ label, value, unit, hint, tone }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: 'accent' | 'muted' | 'danger' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ? `stat-${tone}` : ''}`}>
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  if (src) return <img className="avatar" src={src} alt={name} style={{ width: size, height: size }} />;
  return (
    <span className="avatar avatar-text" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name.slice(0, 1)}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="segmented">
      {items.map((item) => (
        <button key={item.value} className={value === item.value ? 'active' : ''} onClick={() => onChange(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
