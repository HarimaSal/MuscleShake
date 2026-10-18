import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync, useDebouncedValue } from '../lib/hooks';
import {
  formatDateLabel,
  formatDuration,
  formatNumber,
  formatTime,
  sessionTypeLabel,
  weightValue,
  type WeightUnit,
} from '../lib/format';
import { useLocalStorage } from '../lib/hooks';
import { Button, Card, ConfirmDialog, EmptyState, Input, Select, Spinner, Tabs, Pill } from '../components/Ui';
import type { SessionSummary } from '../types';

interface ListResponse {
  items: SessionSummary[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export function Sessions() {
  const { toast } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'active' | 'trash'>('active');
  const [type, setType] = useState('all');
  const [month, setMonth] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(q, 350);
  const [deleting, setDeleting] = useState<SessionSummary | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<SessionSummary | null>(null);
  const [unit] = useLocalStorage<WeightUnit>('fitlog.unit', 'kg');

  const list = useAsync<ListResponse>(
    () =>
      api.get(
        `/api/sessions?page=${page}&pageSize=20&type=${type}${month ? `&month=${month}` : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`,
      ),
    [page, type, month, search],
  );
  const trash = useAsync<{ items: SessionSummary[] }>(
    () => (tab === 'trash' ? api.get('/api/sessions/trash') : Promise.resolve({ items: [] })),
    [tab],
  );

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.del(`/api/sessions/${deleting.id}`);
      toast('已删除，7 天内可在「最近删除」恢复', 'success');
      setDeleting(null);
      list.reload();
      if (tab === 'trash') trash.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const restore = async (session: SessionSummary) => {
    try {
      await api.post(`/api/sessions/${session.id}/restore`);
      toast('已恢复训练记录', 'success');
      trash.reload();
      list.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const purge = async () => {
    if (!purgeTarget) return;
    try {
      await api.del(`/api/sessions/${purgeTarget.id}/purge`);
      toast('已永久删除', 'success');
      setPurgeTarget(null);
      trash.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 18, alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">SESSION LOG</div>
          <h1 style={{ fontSize: 30 }}>训练记录</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            时间倒序、每页 20 条，可按类型与月份筛选。
          </p>
        </div>
        <div className="row">
          <Button variant="outline" onClick={() => navigate('/exercises')}>
            动作库
          </Button>
          <Button variant="primary" onClick={() => navigate('/sessions/new?type=strength')}>
            + 开始训练
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={(value) => {
          setTab(value);
          if (value === 'trash') trash.reload();
        }}
        items={[
          { value: 'active', label: '全部记录', count: list.data?.total },
          { value: 'trash', label: '最近删除' },
        ]}
      />

      {tab === 'active' ? (
        <>
          <div className="toolbar" style={{ marginTop: 14 }}>
            <Input
              className="search"
              placeholder="搜索标题、备注或动作名…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              style={{ width: 130 }}
            >
              <option value="all">全部类型</option>
              <option value="strength">力量</option>
              <option value="cardio">有氧</option>
              <option value="stretch">拉伸</option>
              <option value="other">其他</option>
            </Select>
            <Input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(1);
              }}
              style={{ width: 160 }}
            />
            {(q || type !== 'all' || month) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setQ('');
                  setType('all');
                  setMonth('');
                  setPage(1);
                }}
              >
                清除筛选
              </Button>
            )}
          </div>

          {list.loading && !list.data ? (
            <Spinner label="正在读取记录" />
          ) : list.error ? (
            <div className="notice notice-danger">{list.error}</div>
          ) : !list.data?.items.length ? (
            <Card>
              <EmptyState
                icon="▤"
                title={q || month || type !== 'all' ? '没有符合条件的记录' : '还没有训练记录'}
                description="开始一次训练，或用 30 秒快速补记把昨天补回来。"
                action={
                  <>
                    <Button variant="primary" onClick={() => navigate('/sessions/new?type=strength')}>
                      开始训练
                    </Button>
                    <Button variant="outline" onClick={() => navigate('/')}>
                      快速补记
                    </Button>
                  </>
                }
              />
            </Card>
          ) : (
            <>
              <div className="list-card">
                {list.data.items.map((session) => (
                  <div
                    key={session.id}
                    className="session-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/sessions/${session.id}`)}
                  >
                    <div className="session-date">
                      <strong>{session.localDate.slice(8)}</strong>
                      <span>{Number(session.localDate.slice(5, 7))}月</span>
                    </div>
                    <div className="session-info">
                      <strong>{session.title || `${sessionTypeLabel(session.type)}训练`}</strong>
                      <span>
                        {formatDateLabel(session.localDate)} · {formatTime(session.startedAt)} ·{' '}
                        {session.exerciseNames.length ? session.exerciseNames.join(' / ') : '快速补记'}
                      </span>
                    </div>
                    <div className="session-metrics">
                      <div className="session-metric">
                        <b>{session.type === 'cardio' ? '—' : formatNumber(weightValue(session.volumeKg, unit), 0)}</b>
                        <span>{session.type === 'cardio' ? '容量' : unit}</span>
                      </div>
                      <div className="session-metric">
                        <b>{formatDuration(session.durationSec)}</b>
                        <span>时长</span>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 2 }} onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/sessions/${session.id}/edit`)}>
                        编辑
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(session)}>
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="between" style={{ marginTop: 14 }}>
                <span className="muted small">
                  共 {list.data.total} 条 · 第 {page} / {Math.max(1, Math.ceil(list.data.total / 20))} 页
                </span>
                <div className="row">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    上一页
                  </Button>
                  <Button size="sm" variant="outline" disabled={!list.data.hasMore} onClick={() => setPage((p) => p + 1)}>
                    下一页
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      ) : trash.loading ? (
        <Spinner label="正在读取最近删除" />
      ) : !trash.data?.items.length ? (
        <Card>
          <EmptyState icon="⌫" title="最近删除为空" description="删除的训练记录会保留 7 天，期间可随时恢复。" />
        </Card>
      ) : (
        <div className="list-card" style={{ marginTop: 14 }}>
          {trash.data.items.map((session) => (
            <div key={session.id} className="session-row">
              <div className="session-date">
                <strong>{session.localDate.slice(8)}</strong>
                <span>{Number(session.localDate.slice(5, 7))}月</span>
              </div>
              <div className="session-info">
                <strong>{session.title || `${sessionTypeLabel(session.type)}训练`}</strong>
                <span>删除于 {formatDateLabel(session.deletedAt?.slice(0, 10) ?? '')}</span>
              </div>
              <Pill tone="muted">7 天内可恢复</Pill>
              <div className="row">
                <Button size="sm" variant="outline" onClick={() => restore(session)}>
                  恢复
                </Button>
                <Button size="sm" variant="danger" onClick={() => setPurgeTarget(session)}>
                  永久删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="删除这条训练记录？"
        message={`「${deleting?.title || '未命名训练'}」将被移入最近删除，保留 7 天。当日自动打卡会同步回退，PR 会重新计算。`}
        confirmText="删除"
        danger
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
      <ConfirmDialog
        open={!!purgeTarget}
        title="永久删除？"
        message="永久删除后无法恢复，相关的组记录也会一并删除。"
        confirmText="永久删除"
        danger
        onConfirm={purge}
        onCancel={() => setPurgeTarget(null)}
      />
    </div>
  );
}
