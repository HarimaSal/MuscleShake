import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync } from '../lib/hooks';
import {
  addMonths,
  formatDateLabel,
  formatDuration,
  formatNumber,
  greeting,
  monthKey,
  relativeDate,
  sessionTypeLabel,
  weightValue,
  type WeightUnit,
} from '../lib/format';
import { useLocalStorage } from '../lib/hooks';
import { Button, Card, EmptyState, Field, Input, Modal, Pill, Progress, Select, Spinner, Stat, Textarea } from '../components/Ui';
import type { CheckinSummary, SessionSummary, Template } from '../types';

interface Overview {
  weekStart: string;
  current: { sessions: number; volumeKg: number; durationSec: number };
  previous: { sessions: number; volumeKg: number; durationSec: number };
  delta: { sessions: number; volumePct: number | null; durationPct: number | null };
  checkinDays: number;
  streak: number;
  weekly: { weekStart: string; done: number; goal: number; achieved: boolean };
  totalSessions: number;
  recentSessions: Array<{ id: string; type: string; title: string; localDate: string; volumeKg: number; durationSec: number; itemCount: number }>;
  lastBody: { measuredOn: string; weightKg: number; bodyFat: number | null; waistCm: number | null } | null;
  empty: boolean;
}

const TYPES = [
  { value: 'strength', label: '力量训练' },
  { value: 'cardio', label: '有氧训练' },
  { value: 'stretch', label: '拉伸' },
  { value: 'other', label: '其他' },
];

export function Home() {
  const { user, me, config, toast, loadMe } = useApp();
  const navigate = useNavigate();
  const overview = useAsync<Overview>(() => api.get('/api/stats/overview'), []);
  const templates = useAsync<{ items: Template[] }>(() => api.get('/api/templates'), []);
  const [unit] = useLocalStorage<WeightUnit>('fitlog.unit', 'kg');
  const checkin = useAsync<{ days: Array<{ date: string; status: string }> }>(async () => {
    const month = monthKey();
    const current = await api.get<any>(`/api/checkins?month=${month}`);
    if (new Date().getDate() <= 7) {
      const previous = await api.get<any>(`/api/checkins?month=${addMonths(month, -1)}`);
      return { days: [...(previous.days ?? []), ...(current.days ?? [])] };
    }
    return { days: current.days ?? [] };
  }, []);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickType, setQuickType] = useState('strength');
  const [quickDuration, setQuickDuration] = useState('30');
  const [quickNote, setQuickNote] = useState('');
  const [saving, setSaving] = useState(false);

  const data = overview.data;
  const recent = data?.recentSessions ?? [];

  const quickLog = async () => {
    const duration = Number(quickDuration);
    if (!duration || duration < 1) {
      toast('请填写 1–1440 分钟之间的时长', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/sessions/quick', {
        type: quickType,
        durationMin: duration,
        note: quickNote,
        tzOffset: new Date().getTimezoneOffset(),
      });
      toast('补记完成，已计入今日打卡', 'success');
      setQuickOpen(false);
      setQuickNote('');
      overview.reload();
      checkin.reload();
      await loadMe();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const startTemplate = async (template: Template) => {
    try {
      const result = await api.post(`/api/templates/${template.id}/start`, {
        tzOffset: new Date().getTimezoneOffset(),
      });
      navigate(`/sessions/${result.session.id}/edit`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  if (overview.loading && !data) return <Spinner label="正在读取本周训练" />;
  if (overview.error) return <div className="notice notice-danger">{overview.error}</div>;

  const todayChecked = !!me?.todayCheckin;

  return (
    <div className="stack" style={{ gap: 22 }}>
      {!todayChecked && !data?.empty && (
        <div className="notice notice-warn">
          <span>◉</span>
          <div>
            今天还没有打卡。{me?.sessionsToday ? '已有训练记录，打卡会自动完成。' : '练完记得记录，打卡会随记录自动完成。'}
          </div>
          <button
            className="btn btn-outline btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => navigate('/checkin')}
          >
            去打卡
          </button>
        </div>
      )}

      <section className="hero">
        <div className="hero-main">
          <div className="hero-greeting">
            {greeting()}，{user?.nickname}
            {me?.today ? ` · ${relativeDate(me.today)}` : ''}
          </div>
          <h1 className="hero-title">
            这周练了 <span>{data?.current.sessions ?? 0}</span> 次，
            <br />
            每一组都算数。
          </h1>
          <div className="hero-metrics">
            <div>
              <div className="hero-metric-label">本周容量</div>
              <div className="hero-metric-value">
                {formatNumber(weightValue(data?.current.volumeKg ?? 0, unit), 1)}
                <small>{unit}</small>
              </div>
            </div>
            <div>
              <div className="hero-metric-label">本周时长</div>
              <div className="hero-metric-value">
                {formatDuration(data?.current.durationSec ?? 0)}
              </div>
            </div>
            <div>
              <div className="hero-metric-label">较上周</div>
              <div className="hero-metric-value" style={{ color: (data?.delta.volumePct ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                {data?.delta.volumePct === null ? '—' : `${data!.delta.volumePct >= 0 ? '+' : ''}${formatNumber(data?.delta.volumePct ?? 0, 1)}%`}
                <small>容量</small>
              </div>
            </div>
          </div>
        </div>
        <div className="hero-side">
          <div className="between">
            <span className="eyebrow" style={{ margin: 0 }}>
              连续打卡
            </span>
            <Pill tone={data?.weekly.achieved ? 'accent' : 'default'}>
              {data?.weekly.achieved ? '本周目标达成' : `本周 ${data?.weekly.done ?? 0}/${data?.weekly.goal ?? 0}`}
            </Pill>
          </div>
          <div style={{ margin: '10px 0' }}>
            <div className="streak-number">
              {data?.streak ?? 0}
              <small>天</small>
            </div>
            <div className="streak-days">
              {Array.from({ length: 7 }, (_, index) => {
                const day = new Date();
                day.setDate(day.getDate() - (6 - index));
                const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                const status = checkin.data?.days.find((item) => item.date === key)?.status;
                return (
                  <span key={index} className={`streak-dot ${status && status !== 'none' ? 'on' : ''} ${index === 6 ? 'today' : ''}`}>
                    {['一', '二', '三', '四', '五', '六', '日'][(day.getDay() + 6) % 7]}
                  </span>
                );
              })}
            </div>
          </div>
          <div>
            <div className="between small muted" style={{ marginBottom: 5 }}>
              <span>周目标 {data?.weekly.done ?? 0} / {data?.weekly.goal ?? 3} 天</span>
              <span>{Math.min(100, Math.round(((data?.weekly.done ?? 0) / Math.max(1, data?.weekly.goal ?? 3)) * 100))}%</span>
            </div>
            <Progress value={data?.weekly.done ?? 0} max={data?.weekly.goal ?? 3} />
          </div>
        </div>
      </section>

      <div className="quick-actions">
        <button className="quick-action primary" onClick={() => navigate('/sessions/new?type=strength')}>
          <span className="qa-icon">▶</span>
          <strong>开始训练</strong>
          <span>计时 · 记住上次 · 组间休息</span>
        </button>
        <button className="quick-action" onClick={() => setQuickOpen(true)}>
          <span className="qa-icon">＋</span>
          <strong>快速补记</strong>
          <span>30 秒完成，类型 + 时长 + 备注</span>
        </button>
        <button className="quick-action" onClick={() => navigate('/posts/new')}>
          <span className="qa-icon">✎</span>
          <strong>写复盘</strong>
          <span>把这次训练的数据写进文章</span>
        </button>
      </div>

      {data?.empty ? (
        <Card>
          <EmptyState
            icon="◉"
            title="还没有训练记录"
            description="记录第一次训练后，本周容量、连续天数、动作趋势与 PR 都会从这里长出来。不展示任何伪造数据。"
            action={
              <>
                <Button variant="primary" onClick={() => navigate('/sessions/new?type=strength')}>
                  开始第一次训练
                </Button>
                <Button variant="outline" onClick={() => navigate('/posts/new')}>
                  先写一篇文章
                </Button>
              </>
            }
          />
        </Card>
      ) : (
        <div className="grid home-grid">
          <Card padded={false}>
            <div className="between" style={{ padding: '18px 20px 8px' }}>
              <h2 style={{ fontSize: 17 }}>最近训练</h2>
              <Link to="/sessions" className="small muted">
                全部记录 →
              </Link>
            </div>
            <div style={{ padding: '0 20px 10px' }}>
              {recent.map((session) => {
                const date = new Date(`${session.localDate}T00:00:00`);
                return (
                  <Link key={session.id} to={`/sessions/${session.id}`} className="session-row">
                    <div className="session-date">
                      <strong>{String(date.getDate()).padStart(2, '0')}</strong>
                      <span>{date.getMonth() + 1}月</span>
                    </div>
                    <div className="session-info">
                      <strong>
                        {session.title || `${sessionTypeLabel(session.type)}训练`}
                        {session.type === 'strength' && session.volumeKg > 0 ? '' : ''}
                      </strong>
                      <span>
                        {formatDateLabel(session.localDate)} · {session.itemCount} 个动作
                      </span>
                    </div>
                    <div className="session-metrics">
                      <div className="session-metric">
                        <b>
                          {session.type === 'cardio'
                            ? formatDuration(session.durationSec)
                            : formatNumber(weightValue(session.volumeKg, unit), 0)}
                        </b>
                        <span>{session.type === 'cardio' ? '时长' : `${unit} 容量`}</span>
                      </div>
                      <div className="session-metric">
                        <b>{formatDuration(session.durationSec)}</b>
                        <span>时长</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>

          <div className="stack">
            <Card>
              <div className="between" style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: 15 }}>从模板开始</h3>
                <Link to="/settings" className="small muted">
                  管理
                </Link>
              </div>
              {templates.data?.items?.length ? (
                <div className="stack-sm">
                  {templates.data.items.slice(0, 3).map((template) => (
                    <button
                      key={template.id}
                      className="quick-action"
                      style={{ padding: '10px 12px' }}
                      onClick={() => startTemplate(template)}
                    >
                      <strong>{template.name}</strong>
                      <span>
                        {template.payload.items.length} 个动作 · {template.payload.items.reduce((sum, item) => sum + item.setCount, 0)} 组
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted small">还没有模板。保存一次训练为模板后，下次可一键开练。</p>
              )}
              <Button variant="outline" size="sm" style={{ marginTop: 12, width: '100%' }} onClick={() => navigate('/sessions/new?type=strength')}>
                新建训练并保存为模板
              </Button>
            </Card>

            <Card>
              <h3 style={{ fontSize: 15, marginBottom: 12 }}>动作库</h3>
              <p className="muted small" style={{ marginBottom: 12 }}>
                135 个内置动作，覆盖胸 / 背 / 腿 / 肩 / 手臂 / 核心 / 有氧 / 拉伸。
              </p>
              <Button variant="outline" size="sm" style={{ width: '100%' }} onClick={() => navigate('/exercises')}>
                浏览动作库
              </Button>
            </Card>

            {data?.lastBody && (
              <Card>
                <h3 style={{ fontSize: 15, marginBottom: 10 }}>身体数据</h3>
                <div className="row" style={{ gap: 20 }}>
                  <Stat label="体重" value={formatNumber(data.lastBody.weightKg, 1)} unit="kg" />
                  <Stat label="腰围" value={formatNumber(data.lastBody.waistCm, 1)} unit="cm" />
                </div>
                <p className="muted small" style={{ marginTop: 8 }}>
                  更新于 {relativeDate(data.lastBody.measuredOn)}
                </p>
                <Button variant="outline" size="sm" style={{ marginTop: 10, width: '100%' }} onClick={() => navigate('/data?tab=body')}>
                  查看曲线
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}

      <Modal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title="快速补记"
        description="只填类型 + 时长 + 一句备注，30 秒完成。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuickOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={quickLog}>
              保存并打卡
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="训练类型">
            <Select value={quickType} onChange={(e) => setQuickType(e.target.value)}>
              {TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="时长（分钟）" hint="输入 1–1440 分钟">
            <Input
              type="number"
              min={1}
              max={1440}
              value={quickDuration}
              onChange={(e) => setQuickDuration(e.target.value)}
            />
          </Field>
          <Field label="一句备注" hint="例如：昨天漏记，腿日深蹲 5 组">
            <Textarea value={quickNote} maxLength={200} onChange={(e) => setQuickNote(e.target.value)} rows={3} />
          </Field>
          <div className="notice">
            <span>◉</span>
            <div>补记会生成一条训练记录并计入当日打卡，来源标记为“手动”，可在打卡页撤销。</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
