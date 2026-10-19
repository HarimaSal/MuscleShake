import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '../../src/components/Ui';
import { formatNumber } from '../../src/lib/format';

export function OpsPageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="ops-page-head">
      <div>
        {eyebrow && <div className="ops-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ops-head-actions">{actions}</div>}
    </div>
  );
}

export function OpsKpi({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  to,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: 'default' | 'accent' | 'danger' | 'warn';
  to?: string;
}) {
  const body = (
    <div className={`ops-kpi ops-kpi-${tone}`}>
      <span className="ops-kpi-label">{label}</span>
      <strong>{value}{unit && <em>{unit}</em>}</strong>
      {hint && <span className="ops-kpi-hint">{hint}</span>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function OpsCard({
  title,
  extra,
  children,
  className = '',
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ops-card ${className}`.trim()}>
      {(title || extra) && (
        <header className="ops-card-head">
          <h2>{title}</h2>
          {extra}
        </header>
      )}
      <div className="ops-card-body">{children}</div>
    </section>
  );
}

export function RiskTag({ risk }: { risk?: string }) {
  const value = risk ?? 'mid';
  return <span className={`ops-risk ops-risk-${value}`}>{value === 'high' ? '高' : value === 'low' ? '低' : '中'}</span>;
}

export function OpsStatus({ status }: { status?: string }) {
  const labels: Record<string, string> = {
    active: '启用',
    disabled: '停用',
    draft: '草稿',
    pending: '待审核',
    scheduled: '已排期',
    published: '已发布',
    offline: '已下线',
    rejected: '已驳回',
    needs_revision: '需修改',
    editing: '编辑中（线上旧版）',
    merged: '已合并',
    archived: '已归档',
    open: '待处理',
    resolved: '已处理',
    approved: '已通过',
    quota_deferred: '名额顺延',
  };
  return <span className={`ops-status ops-status-${status ?? 'default'}`}>{labels[status ?? ''] ?? status ?? '—'}</span>;
}

export function OpsLoading({ label = '正在加载' }: { label?: string }) {
  return <div className="ops-loading"><Spinner label={label} /></div>;
}

export function OpsEmpty({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <EmptyState icon="◌" title={title} description={description ?? ''} action={action} />;
}

export function OpsProgress({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'warn' | 'danger' }) {
  return (
    <div className={`ops-progress ops-progress-${tone}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function OpsMoney({ value }: { value: number | null | undefined }) {
  return <>{formatNumber(value ?? 0, 2)}</>;
}

export function OpsDateTime({ value }: { value?: string | null }) {
  if (!value) return <span className="muted">—</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span className="muted">{value}</span>;
  return <>{date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</>;
}

export function OpsCountdown({ minutes }: { minutes: number }) {
  if (minutes <= 0) return <span className="ops-overdue">已超时 {Math.abs(minutes)} 分钟</span>;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return <span className={minutes <= 60 ? 'ops-overdue' : ''}>{hours > 0 ? `${hours}h ` : ''}{rest}m</span>;
}
