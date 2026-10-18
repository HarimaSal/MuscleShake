import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync } from '../lib/hooks';
import { addMonths, formatDateLabel, formatDuration, monthKey, todayLocal } from '../lib/format';
import { Button, Card, EmptyState, Field, Input, Modal, Pill, Progress, Select, Spinner, Textarea } from '../components/Ui';
import type { CheckinDay, CheckinSummary } from '../types';

const TYPES = [
  { value: 'strength', label: '力量训练' },
  { value: 'cardio', label: '有氧训练' },
  { value: 'stretch', label: '拉伸' },
  { value: 'other', label: '其他' },
];

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function Checkin() {
  const { user, loadMe, toast } = useApp();
  const navigate = useNavigate();
  const [month, setMonth] = useState(monthKey());
  const [selected, setSelected] = useState(todayLocal());
  const [manualOpen, setManualOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goal, setGoal] = useState(String(user?.weeklyGoal ?? 3));
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ localDate: todayLocal(), workoutType: 'strength', durationMin: '30', note: '' });

  const data = useAsync<{ month: string; days: CheckinDay[]; summary: CheckinSummary }>(
    () => api.get(`/api/checkins?month=${month}`),
    [month, user?.weeklyGoal],
  );
  const day = useAsync<{ date: string; checkin: any; sessions: any[] }>(
    () => api.get(`/api/checkins/day/${selected}`),
    [selected, data.data?.summary.streak],
  );

  useEffect(() => {
    if (!data.data || data.data.month !== month) return;
    if (!data.data.days.some((item) => item.date === selected)) {
      const firstCurrent = data.data.days.find((item) => item.isToday);
      setSelected(
        firstCurrent?.date ??
          data.data.days[Math.min(new Date().getDate() - 1, data.data.days.length - 1)]?.date ??
          selected,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, data.data?.month]);

  const openManual = () => {
    setForm({
      localDate: selected || todayLocal(),
      workoutType: 'strength',
      durationMin: '30',
      note: '',
    });
    setManualOpen(true);
  };

  const submitManual = async () => {
    const duration = Number(form.durationMin);
    if (!duration || duration < 1) {
      toast('请填写 1–1440 分钟之间的时长', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await api.post('/api/checkins/manual', {
        localDate: form.localDate,
        workoutType: form.workoutType,
        durationMin: duration,
        note: form.note,
      });
      toast('补记成功', 'success');
      result.newBadges?.forEach((badge: any) => toast(`获得徽章：${badge.name}`, 'success'));
      setManualOpen(false);
      data.reload();
      day.reload();
      await loadMe();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async () => {
    if (!day.data?.checkin?.id) return;
    try {
      await api.del(`/api/checkins/${day.data.checkin.id}`);
      toast('已撤销手动打卡', 'success');
      data.reload();
      day.reload();
      await loadMe();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const saveGoal = async () => {
    setSaving(true);
    try {
      await api.put('/api/checkins/goal', { weeklyGoal: Number(goal) });
      toast('周目标已更新', 'success');
      setGoalOpen(false);
      data.reload();
      await loadMe();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (data.loading && !data.data) return <Spinner label="正在读取打卡记录" />;
  if (data.error) return <div className="notice notice-danger">{data.error}</div>;

  const summary = data.data!.summary;
  const days = data.data!.days;
  const firstWeekday = (new Date(`${month}-01T00:00:00`).getDay() + 6) % 7;
  const selectedDay = days.find((item) => item.date === selected) ?? null;
  const currentCheckin = day.data?.checkin ?? null;
  const canManual = selected === todayLocal() || selected === addDays(todayLocal(), -1);

  return (
    <div>
      <div className="between" style={{ marginBottom: 18, alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">STREAK & CHECK-IN</div>
          <h1 style={{ fontSize: 30 }}>打卡</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            有训练记录才算打卡；补记限 48 小时内，来源会标注“手动”。
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/sessions/new?type=strength')}>
          + 开始训练
        </Button>
      </div>

      <div className="checkin-hero">
        <div className="streak-card">
          <div>
            <div className="eyebrow" style={{ margin: 0 }}>
              连续打卡
            </div>
            <div className="streak-number">
              {summary.streak}
              <small>天</small>
            </div>
            <p className="muted small">
              {summary.streak > 0 ? '断一天即归零，补记成功可修复昨日断点。' : '从今天开始，先练一次。'}
            </p>
          </div>
          <div className="streak-days">
            {days
              .filter((item) => !item.isFuture)
              .slice(-7)
              .map((item) => (
                <span
                  key={item.date}
                  className={`streak-dot ${item.status !== 'none' ? 'on' : ''} ${item.isToday ? 'today' : ''}`}
                  title={`${formatDateLabel(item.date)} · ${item.status === 'none' ? '未打卡' : item.status === 'auto' ? '自动打卡' : '手动补记'}`}
                >
                  {WEEKDAYS[(new Date(`${item.date}T00:00:00`).getDay() + 6) % 7]}
                </span>
              ))}
          </div>
        </div>

        <div className="goal-card">
          <div className="between">
            <div>
              <div className="eyebrow" style={{ margin: 0 }}>
                本周目标
              </div>
              <div style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.03em', marginTop: 2 }}>
                {summary.weekly.done} / {summary.weekly.goal} 天
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setGoalOpen(true)}>
              改目标
            </Button>
          </div>
          <div className="goal-days">
            {Array.from({ length: summary.weekly.goal }, (_, index) => (
              <div key={index} className={`goal-day ${index < summary.weekly.done ? 'on' : ''}`}>
                {index + 1}
              </div>
            ))}
          </div>
          <div>
            <Progress value={summary.weekly.done} max={summary.weekly.goal} />
            <p className="muted small" style={{ marginTop: 6 }}>
              {summary.weekly.achieved ? '本周目标已达成，保持节奏。' : `还差 ${Math.max(0, summary.weekly.goal - summary.weekly.done)} 天达成本周目标。`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid checkin-grid">
        <Card>
          <div className="calendar-head">
            <Button size="sm" variant="ghost" onClick={() => setMonth(addMonths(month, -1))}>
              ← 上月
            </Button>
            <div className="calendar-title">{month.replace('-', ' 年 ')} 月</div>
            <Button size="sm" variant="ghost" onClick={() => setMonth(addMonths(month, 1))}>
              下月 →
            </Button>
          </div>
          <div className="calendar-grid">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="calendar-weekday">
                {weekday}
              </div>
            ))}
            {Array.from({ length: firstWeekday }, (_, index) => (
              <div key={`blank-${index}`} className="calendar-cell blank" />
            ))}
            {days.map((item) => (
              <button
                key={item.date}
                className={`calendar-cell ${item.status === 'auto' ? 'auto' : item.status === 'manual' ? 'manual' : ''} ${item.isToday ? 'today' : ''} ${item.isFuture ? 'future' : ''} ${item.date === selected ? 'selected' : ''}`}
                onClick={() => setSelected(item.date)}
                title={`${formatDateLabel(item.date)} · ${item.status === 'none' ? '未打卡' : item.status === 'auto' ? '自动打卡' : '手动补记'}`}
              >
                <span>{Number(item.date.slice(8))}</span>
                {item.sessionCount > 0 && <span className="dot" />}
              </button>
            ))}
          </div>
          <div className="calendar-legend">
            <span className="legend-pill">
              <span className="legend-box auto" /> 训练自动打卡
            </span>
            <span className="legend-pill">
              <span className="legend-box manual" /> 手动补记
            </span>
            <span className="legend-pill">
              <span className="legend-box" /> 未打卡
            </span>
            <span className="legend-pill">● 当日有训练记录</span>
          </div>
        </Card>

        <Card>
          <div className="between" style={{ marginBottom: 10 }}>
            <div>
              <div className="eyebrow" style={{ margin: 0 }}>
                当日详情
              </div>
              <h3 style={{ fontSize: 17 }}>{formatDateLabel(selected)}</h3>
            </div>
            {selectedDay?.status === 'none' && canManual && (
              <Button size="sm" variant="outline" onClick={openManual}>
                补记
              </Button>
            )}
          </div>

          {day.loading && !day.data ? (
            <Spinner />
          ) : currentCheckin ? (
            <div className="stack-sm">
              <Pill tone={currentCheckin.source === 'auto' ? 'accent' : 'warn'}>
                {currentCheckin.source === 'auto' ? '已打卡（自动）' : '已打卡（手动）'}
              </Pill>
              <p className="muted small">
                {currentCheckin.workoutType ? `${TYPES.find((t) => t.value === currentCheckin.workoutType)?.label ?? currentCheckin.workoutType}` : '训练'}
                {currentCheckin.durationMin ? ` · ${currentCheckin.durationMin} 分钟` : ''}
              </p>
              {currentCheckin.note && <p className="small">{currentCheckin.note}</p>}
              {currentCheckin.source === 'manual' && (
                <Button size="sm" variant="ghost" onClick={revoke}>
                  撤销手动打卡
                </Button>
              )}
            </div>
          ) : (
            <EmptyState
              icon="◌"
              title="当天没有打卡"
              description={canManual ? '可以手动补记训练类型与时长，需在 48 小时内。' : '已超过 48 小时，无法补记。'}
              action={
                canManual ? (
                  <Button variant="primary" size="sm" onClick={openManual}>
                    补记训练
                  </Button>
                ) : undefined
              }
            />
          )}

          {!!day.data?.sessions?.length && (
            <>
              <div className="divider" style={{ margin: '14px 0' }} />
              <div className="eyebrow">当日训练</div>
              <div className="stack-sm">
                {day.data.sessions.map((session) => (
                  <Link key={session.id} to={`/sessions/${session.id}`} className="quick-action" style={{ padding: '10px 12px' }}>
                    <strong>{session.title || '训练记录'}</strong>
                    <span>
                      {formatDuration(session.durationSec)} · {session.volumeKg ? `${session.volumeKg} kg` : '有氧 / 拉伸'}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card style={{ marginTop: 18 }}>
        <div className="between" style={{ marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 16 }}>徽章</h3>
            <p className="muted small">里程碑自动发放，可在通知里看到提示。</p>
          </div>
          <span className="muted small">
            {summary.badges.filter((badge) => badge.unlocked).length} / {summary.badges.length}
          </span>
        </div>
        <div className="badge-grid">
          {summary.badges.map((badge) => (
            <div key={badge.code} className={`badge-card ${badge.unlocked ? 'unlocked' : ''}`}>
              <span className="badge-icon">{badge.icon}</span>
              <div>
                <b>{badge.name}</b>
                <span>{badge.description}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="notice" style={{ marginTop: 16 }}>
        <span>◔</span>
        <div>
          打卡提醒可在 <Link to="/settings" style={{ color: 'var(--accent)' }}>设置</Link> 中开启或关闭，站内提醒每日最多 1 次；已打卡则不发送。
        </div>
      </div>

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="补记打卡"
        description="仅支持今天与昨天（48 小时内），需填写训练类型与时长。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setManualOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={submitManual}>
              保存补记
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="归属日期" hint="最多可补记昨天">
            <Input
              type="date"
              value={form.localDate}
              max={todayLocal()}
              min={addDays(todayLocal(), -1)}
              onChange={(e) => setForm({ ...form, localDate: e.target.value })}
            />
          </Field>
          <Field label="训练类型">
            <Select value={form.workoutType} onChange={(e) => setForm({ ...form, workoutType: e.target.value })}>
              {TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="时长（分钟）">
            <Input type="number" min={1} max={1440} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
          </Field>
          <Field label="备注" hint="例如：昨天漏记，深蹲 5 组">
            <Textarea value={form.note} rows={2} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <div className="notice notice-warn">
            <span>⚠</span>
            <div>补记不产生训练组数据，不会带来容量与 PR；手工补记会标注来源，方便自查。</div>
          </div>
        </div>
      </Modal>

      <Modal
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        title="设置每周训练目标"
        description="目标 1–7 天，达成后会在首页与打卡页提示。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGoalOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={saveGoal}>
              保存
            </Button>
          </>
        }
      >
        <Field label="每周训练天数">
          <Select value={goal} onChange={(e) => setGoal(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7].map((value) => (
              <option key={value} value={value}>
                {value} 天
              </option>
            ))}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
