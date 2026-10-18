import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, downloadWithAuth, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync } from '../lib/hooks';
import {
  formatDateLabel,
  formatDuration,
  formatNumber,
  relativeDate,
  todayLocal,
  weightValue,
  type WeightUnit,
} from '../lib/format';
import { useLocalStorage } from '../lib/hooks';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Pill,
  Progress,
  Segmented,
  Select,
  Spinner,
  Stat,
  Tabs,
} from '../components/Ui';
import { BarChart, Donut, LineChart } from '../components/Charts';
import type { Exercise } from '../types';

type TabValue = 'overview' | 'trend' | 'prs' | 'muscles' | 'body' | 'report' | 'export';

const TABS: Array<{ value: TabValue; label: string }> = [
  { value: 'overview', label: '概览' },
  { value: 'trend', label: '动作趋势' },
  { value: 'prs', label: 'PR 记录' },
  { value: 'muscles', label: '肌群分布' },
  { value: 'body', label: '身体数据' },
  { value: 'report', label: '周报' },
  { value: 'export', label: '数据导出' },
];

export function DataPage() {
  const { user, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const initial = (params.get('tab') as TabValue) || 'overview';
  const [tab, setTab] = useState<TabValue>(TABS.some((item) => item.value === initial) ? initial : 'overview');
  const [unit, setUnit] = useLocalStorage<WeightUnit>('fitlog.unit', 'kg');

  useEffect(() => {
    setParams(tab === 'overview' ? {} : { tab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div>
      <div className="between" style={{ marginBottom: 18, alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">GROWTH ARCHIVE</div>
          <h1 style={{ fontSize: 30 }}>数据与成长档案</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            容量、估算 1RM、PR、肌群与身体数据。所有统计只基于你自己记录的数据。
          </p>
        </div>
        <div className="row">
          <Segmented
            value={unit}
            onChange={setUnit}
            items={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
          />
          <Link to="/checkin" className="btn btn-outline btn-sm">
            查看打卡月历
          </Link>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} items={TABS} />

      <div style={{ marginTop: 18 }}>
        {tab === 'overview' && <OverviewTab unit={unit} />}
        {tab === 'trend' && <TrendTab unit={unit} />}
        {tab === 'prs' && <PRTab unit={unit} />}
        {tab === 'muscles' && <MuscleTab unit={unit} />}
        {tab === 'body' && <BodyTab />}
        {tab === 'report' && <ReportTab nickname={user?.nickname ?? '训练者'} unit={unit} />}
        {tab === 'export' && <ExportTab />}
      </div>
    </div>
  );
}

/* ------------------------------- 概览 ------------------------------- */
function OverviewTab({ unit }: { unit: WeightUnit }) {
  const overview = useAsync<any>(() => api.get('/api/stats/overview'), []);
  const frequency = useAsync<any>(() => api.get('/api/stats/frequency'), []);
  const muscles = useAsync<any>(() => api.get('/api/stats/muscles'), []);
  const prs = useAsync<any>(() => api.get('/api/stats/prs'), []);

  if (overview.loading && !overview.data) return <Spinner label="正在汇总" />;
  if (overview.error) return <div className="notice notice-danger">{overview.error}</div>;
  const data = overview.data;
  if (data.empty) {
    return (
      <Card>
        <EmptyState
          icon="◨"
          title="还没有可统计的数据"
          description="记录第一次训练后，容量、频率、肌群分布与 PR 才会出现。不展示 0 值图表，也不伪造数据。"
          action={
            <Link to="/sessions/new?type=strength" className="btn btn-primary btn-md">
              开始第一次训练
            </Link>
          }
        />
      </Card>
    );
  }
  return (
    <div className="stack">
      <Card className="data-hero" padded={false}>
        <Stat label="本周训练" value={data.current.sessions} unit="次" hint={`上周 ${data.previous.sessions} 次`} />
        <Stat
          label="本周容量"
          value={formatNumber(weightValue(data.current.volumeKg, unit), 0)}
          unit={unit}
          hint={data.delta.volumePct === null ? '首次统计' : `环比 ${data.delta.volumePct >= 0 ? '+' : ''}${data.delta.volumePct}%`}
        />
        <Stat label="本周时长" value={formatDuration(data.current.durationSec)} hint={`累计 ${data.totalSessions} 次训练`} />
        <Stat label="连续打卡" value={data.streak} unit="天" tone="accent" hint={`本周 ${data.checkinDays} 天`} />
      </Card>

      <div className="grid grid-2">
        <Card>
          <div className="between" style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: 16 }}>近 8 周训练频率</h3>
            <span className="muted small">次数 / 周</span>
          </div>
          <BarChart
            items={(frequency.data?.weeks ?? []).map((week: any) => ({
              label: week.weekStart.slice(5),
              value: week.sessions,
            }))}
            formatValue={(value) => String(value)}
          />
        </Card>
        <Card>
          <div className="between" style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: 16 }}>近 4 周肌群组数</h3>
            <Link to="/data?tab=muscles" className="small muted">
              详情
            </Link>
          </div>
          <Donut
            items={(muscles.data?.items ?? []).map((item: any) => ({ label: item.muscle, value: item.sets }))}
            size={168}
          />
        </Card>
      </div>

      <Card padded={false}>
        <div className="between" style={{ padding: '18px 20px 6px' }}>
          <h3 style={{ fontSize: 16 }}>个人纪录</h3>
          <Link to="/data?tab=prs" className="small muted">
            全部 →
          </Link>
        </div>
        {prs.data?.items?.length ? (
          <table className="pr-table">
            <thead>
              <tr>
                <th>动作</th>
                <th>单组最大重量</th>
                <th>估算 1RM</th>
                <th>单组最大次数</th>
                <th>最近</th>
              </tr>
            </thead>
            <tbody>
              {prs.data.items.slice(0, 6).map((item: any) => (
                <tr key={item.exerciseId}>
                  <td className="name">
                    <Link to={`/exercises/${item.exerciseId}`}>{item.exerciseName}</Link>
                  </td>
                  <td>{item.maxWeight ? `${formatNumber(weightValue(item.maxWeight.weight, unit), 1)} ${unit} × ${item.maxWeight.reps}` : '—'}</td>
                  <td className="pr-value">{item.maxE1RM ? `${formatNumber(weightValue(item.maxE1RM.value, unit), 1)} ${unit}` : '—'}</td>
                  <td>{item.maxReps ? `${item.maxReps.reps} 次` : '—'}</td>
                  <td>{item.lastDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small" style={{ padding: '10px 20px 20px' }}>
            还没有 PR。记录力量训练后会自动计算。
          </p>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------- 趋势 ------------------------------- */
function TrendTab({ unit }: { unit: WeightUnit }) {
  const [exerciseId, setExerciseId] = useState('');
  const [granularity, setGranularity] = useState<'week' | 'month' | 'year'>('week');
  const exercises = useAsync<{ items: Exercise[] }>(() => api.get('/api/exercises'), []);
  const trend = useAsync<any>(
    () => (exerciseId ? api.get(`/api/stats/trend/${exerciseId}?granularity=${granularity}`) : Promise.resolve(null)),
    [exerciseId, granularity],
  );

  useEffect(() => {
    if (!exerciseId && exercises.data?.items?.length) {
      const preferred = exercises.data.items.find((item) => item.name === '深蹲') ?? exercises.data.items[0];
      setExerciseId(preferred.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises.data]);

  return (
    <div className="stack">
      <Card>
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <Select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} style={{ maxWidth: 260 }}>
            {(exercises.data?.items ?? []).map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}（{exercise.primaryMuscle}）
              </option>
            ))}
          </Select>
          <Segmented
            value={granularity}
            onChange={setGranularity}
            items={[
              { value: 'week', label: '周' },
              { value: 'month', label: '月' },
              { value: 'year', label: '年' },
            ]}
          />
          <span className="muted small" style={{ marginLeft: 'auto' }}>
            估算 1RM 使用 Epley 公式，仅 reps ≤12 的组
          </span>
        </div>
        {trend.loading ? (
          <Spinner />
        ) : (
          <LineChart
            points={(trend.data?.points ?? []).map((point: any) => ({
              label: point.label,
              value: weightValue(point.estimated1RM, unit) || null,
            }))}
            height={220}
            unit={unit}
            emptyText="该动作还没有可用数据"
          />
        )}
      </Card>

      {!!trend.data?.points?.length && (
        <Card padded={false}>
          <div className="editor-panel-head">
            <span>{trend.data.exercise.name} · 分组统计</span>
            <span className="mono">{trend.data.points.length}</span>
          </div>
          <table className="pr-table">
            <thead>
              <tr>
                <th>周期</th>
                <th>最大重量</th>
                <th>估算 1RM</th>
                <th>容量</th>
                <th>组数</th>
              </tr>
            </thead>
            <tbody>
              {[...trend.data.points].reverse().map((point: any) => (
                <tr key={point.key}>
                  <td className="name">{point.label}</td>
                  <td>{formatNumber(weightValue(point.maxWeight, unit), 1)} {unit}</td>
                  <td className="pr-value">{point.estimated1RM ? `${formatNumber(weightValue(point.estimated1RM, unit), 1)} ${unit}` : '—'}</td>
                  <td>{formatNumber(weightValue(point.volume, unit), 0)} {unit}</td>
                  <td>{point.sets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------- PR -------------------------------- */
function PRTab({ unit }: { unit: WeightUnit }) {
  const prs = useAsync<any>(() => api.get('/api/stats/prs'), []);
  if (prs.loading) return <Spinner />;
  if (!prs.data?.items?.length) {
    return (
      <Card>
        <EmptyState icon="★" title="还没有个人纪录" description="记录力量训练后，系统会按单组最大重量、估算 1RM、单组最大次数三个口径计算 PR。" />
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <div className="editor-panel-head">
        <span>三个 PR 口径</span>
        <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>
          估算值仅对 reps ≤12 的组
        </span>
      </div>
      <table className="pr-table">
        <thead>
          <tr>
            <th>动作</th>
            <th>肌群</th>
            <th>单组最大重量</th>
            <th>估算 1RM</th>
            <th>单组最大次数</th>
            <th>最近记录</th>
          </tr>
        </thead>
        <tbody>
          {prs.data.items.map((item: any) => (
            <tr key={item.exerciseId}>
              <td className="name">
                <Link to={`/exercises/${item.exerciseId}`}>{item.exerciseName}</Link>
              </td>
              <td>{item.primaryMuscle}</td>
              <td>{item.maxWeight ? `${formatNumber(weightValue(item.maxWeight.weight, unit), 1)} ${unit} × ${item.maxWeight.reps}` : '—'}</td>
              <td className="pr-value">{item.maxE1RM ? `${formatNumber(weightValue(item.maxE1RM.value, unit), 1)} ${unit}` : '—'}</td>
              <td>{item.maxReps ? `${item.maxReps.reps} 次 @ ${formatNumber(weightValue(item.maxReps.weight, unit), 1)}${unit}` : '—'}</td>
              <td>{item.lastDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ------------------------------- 肌群 ------------------------------- */
function MuscleTab({ unit }: { unit: WeightUnit }) {
  const muscles = useAsync<any>(() => api.get('/api/stats/muscles?days=28'), []);
  if (muscles.loading) return <Spinner />;
  return (
    <div className="grid grid-2">
      <Card>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>近 4 周肌群组数</h3>
        <Donut
          items={(muscles.data?.items ?? []).map((item: any) => ({ label: item.muscle, value: item.sets }))}
          centerValue={String(muscles.data?.totalSets ?? 0)}
          centerLabel="总组数"
        />
      </Card>
      <Card padded={false}>
        <div className="editor-panel-head">
          <span>自查训练均衡</span>
          <span className="muted" style={{ textTransform: 'none' }}>
            {muscles.data?.from} 至 {muscles.data?.to}
          </span>
        </div>
        {muscles.data?.items?.length ? (
          <table className="pr-table">
            <thead>
              <tr>
                <th>肌群</th>
                <th>组数</th>
                <th>占比</th>
                <th>容量</th>
              </tr>
            </thead>
            <tbody>
              {muscles.data.items.map((item: any) => (
                <tr key={item.muscle}>
                  <td className="name">{item.muscle}</td>
                  <td>{item.sets}</td>
                  <td>{item.ratio}%</td>
                  <td>{formatNumber(weightValue(item.volume, unit), 0)} {unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small" style={{ padding: 20 }}>
            近 4 周没有力量训练组数据。
          </p>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------ 身体数据 ------------------------------ */
function BodyTab() {
  const { toast } = useApp();
  const series = useAsync<any>(() => api.get('/api/stats/body'), []);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    measuredOn: todayLocal(),
    weightKg: '',
    bodyFat: '',
    waistCm: '',
    chestCm: '',
    armCm: '',
    note: '',
  });

  const save = async () => {
    if (!form.weightKg && !form.bodyFat && !form.waistCm && !form.chestCm && !form.armCm) {
      toast('至少填写一项身体数据', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/stats/body', {
        measuredOn: form.measuredOn,
        weightKg: form.weightKg || null,
        bodyFat: form.bodyFat || null,
        waistCm: form.waistCm || null,
        chestCm: form.chestCm || null,
        armCm: form.armCm || null,
        note: form.note,
      });
      toast('身体数据已保存', 'success');
      setOpen(false);
      series.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.del(`/api/stats/body/${id}`);
      toast('已删除', 'success');
      series.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const items = series.data?.items ?? [];
  const weightPoints = items.filter((item: any) => item.weightKg != null).map((item: any) => ({ label: item.measuredOn.slice(5), value: item.weightKg }));
  const fatPoints = items.filter((item: any) => item.bodyFat != null).map((item: any) => ({ label: item.measuredOn.slice(5), value: item.bodyFat }));

  if (series.loading && !series.data) return <Spinner />;

  return (
    <div className="stack">
      <div className="notice notice-warn">
        <span>ⓘ</span>
        <div>身体数据为用户自填，仅供参考，不构成健康、医疗或效果结论。请结合自身情况判断。</div>
      </div>

      <div className="grid grid-2">
        <Card>
          <div className="between" style={{ marginBottom: 10 }}>
            <h3 style={{ fontSize: 16 }}>体重曲线</h3>
            {series.data?.deltaWeight != null && (
              <Pill tone={series.data.deltaWeight <= 0 ? 'accent' : 'warn'}>
                较首条 {series.data.deltaWeight > 0 ? '+' : ''}{series.data.deltaWeight} kg
              </Pill>
            )}
          </div>
          <LineChart points={weightPoints} height={200} unit="kg" emptyText="还没有体重记录" />
        </Card>
        <Card>
          <div className="between" style={{ marginBottom: 10 }}>
            <h3 style={{ fontSize: 16 }}>体脂率曲线</h3>
            <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
              + 记录
            </Button>
          </div>
          <LineChart points={fatPoints} height={200} unit="%" color="var(--info)" emptyText="还没有体脂记录" />
        </Card>
      </div>

      <Card padded={false}>
        <div className="editor-panel-head">
          <span>身体数据记录</span>
          <span className="mono">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon="◨"
            title="还没有身体数据"
            description="记录体重、体脂与围度，便于观察长期趋势。数据仅自己可见。"
            action={<Button variant="primary" onClick={() => setOpen(true)}>记录第一条</Button>}
          />
        ) : (
          <table className="pr-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>体重</th>
                <th>体脂</th>
                <th>腰围</th>
                <th>胸围</th>
                <th>臂围</th>
                <th>备注</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...items].reverse().map((item: any) => (
                <tr key={item.id}>
                  <td className="name">{item.measuredOn}</td>
                  <td>{item.weightKg != null ? `${item.weightKg} kg` : '—'}</td>
                  <td>{item.bodyFat != null ? `${item.bodyFat}%` : '—'}</td>
                  <td>{item.waistCm != null ? `${item.waistCm} cm` : '—'}</td>
                  <td>{item.chestCm != null ? `${item.chestCm} cm` : '—'}</td>
                  <td>{item.armCm != null ? `${item.armCm} cm` : '—'}</td>
                  <td style={{ fontFamily: 'var(--font)', color: 'var(--muted)' }}>{item.note ?? '—'}</td>
                  <td className="right">
                    <button className="icon-btn" onClick={() => remove(item.id)} aria-label="删除">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="记录身体数据"
        description="同一天重复提交会覆盖当天记录。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={save}>
              保存
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="日期">
            <Input type="date" value={form.measuredOn} max={todayLocal()} onChange={(e) => setForm({ ...form, measuredOn: e.target.value })} />
          </Field>
          <div className="grid grid-3">
            <Field label="体重 (kg)">
              <Input type="number" step="0.1" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} />
            </Field>
            <Field label="体脂率 (%)">
              <Input type="number" step="0.1" value={form.bodyFat} onChange={(e) => setForm({ ...form, bodyFat: e.target.value })} />
            </Field>
            <Field label="腰围 (cm)">
              <Input type="number" step="0.1" value={form.waistCm} onChange={(e) => setForm({ ...form, waistCm: e.target.value })} />
            </Field>
            <Field label="胸围 (cm)">
              <Input type="number" step="0.1" value={form.chestCm} onChange={(e) => setForm({ ...form, chestCm: e.target.value })} />
            </Field>
            <Field label="臂围 (cm)">
              <Input type="number" step="0.1" value={form.armCm} onChange={(e) => setForm({ ...form, armCm: e.target.value })} />
            </Field>
          </div>
          <Field label="备注">
            <Input value={form.note} maxLength={200} placeholder="如：睡眠不足，晨起空腹" onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------- 周报 -------------------------------- */
function ReportTab({ nickname, unit }: { nickname: string; unit: WeightUnit }) {
  const report = useAsync<any>(() => api.get('/api/stats/weekly-report'), []);
  const { toast } = useApp();

  const download = () => {
    const data = report.data;
    if (!data) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0a0b09';
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = '#c9f75b';
    ctx.fillRect(0, 0, 1080, 10);
    ctx.fillStyle = '#eef1e6';
    ctx.font = '700 64px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('本周训练周报', 80, 160);
    ctx.fillStyle = '#98a18e';
    ctx.font = '28px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(`${data.weekStart} — ${data.weekEnd} · ${nickname}`, 80, 215);

    const metrics = [
      { label: '训练次数', value: `${data.sessions}`, unit: '次' },
      { label: '总容量', value: formatNumber(weightValue(data.volumeKg, unit), 0), unit },
      { label: '训练时长', value: formatDuration(data.durationSec), unit: '' },
      { label: '打卡天数', value: `${data.checkinDays}`, unit: '天' },
    ];
    metrics.forEach((metric, index) => {
      const x = 80 + (index % 2) * 480;
      const y = 340 + Math.floor(index / 2) * 220;
      ctx.fillStyle = '#98a18e';
      ctx.font = '26px "PingFang SC", sans-serif';
      ctx.fillText(metric.label, x, y);
      ctx.fillStyle = index === 1 ? '#c9f75b' : '#eef1e6';
      ctx.font = '700 84px "SFMono-Regular", Consolas, monospace';
      ctx.fillText(metric.value, x, y + 90);
      ctx.fillStyle = '#6f7a67';
      ctx.font = '26px "PingFang SC", sans-serif';
      ctx.fillText(metric.unit, x + ctx.measureText(metric.value).width + 74, y + 90);
    });

    ctx.fillStyle = '#39432f';
    ctx.fillRect(80, 800, 920, 1);
    ctx.fillStyle = '#c9f75b';
    ctx.font = '600 30px "PingFang SC", sans-serif';
    ctx.fillText('亮点 PR', 80, 870);
    ctx.font = '28px "PingFang SC", sans-serif';
    if (data.highlights.length === 0) {
      ctx.fillStyle = '#98a18e';
      ctx.fillText('本周没有新的 PR，稳定完成训练同样重要。', 80, 930);
    } else {
      data.highlights.slice(0, 4).forEach((highlight: any, index: number) => {
        ctx.fillStyle = index === 0 ? '#eef1e6' : '#b9c2ae';
        ctx.fillText(
          `${highlight.exerciseName} · 估算 1RM ${formatNumber(weightValue(highlight.estimated1RM, unit), 1)} ${unit}`,
          80,
          935 + index * 56,
        );
      });
    }
    ctx.fillStyle = '#6f7a67';
    ctx.font = '26px "PingFang SC", sans-serif';
    ctx.fillText('练迹 FitLog · 训练记录与成长档案', 80, 1230);
    ctx.fillStyle = '#4b5545';
    ctx.font = '22px "PingFang SC", sans-serif';
    ctx.fillText('数据来自本人训练记录，估算 1RM 采用 Epley 公式，仅供参考', 80, 1275);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `练迹周报-${data.weekStart}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('周报图片已生成', 'success');
    }, 'image/png');
  };

  if (report.loading && !report.data) return <Spinner />;
  if (!report.data) return null;
  const data = report.data;
  if (data.empty) {
    return (
      <Card>
        <EmptyState icon="◈" title="本周还没有训练" description="完成一次训练后，周报会自动汇总次数、容量、坚持天数与亮点 PR。" />
      </Card>
    );
  }
  return (
    <div className="stack">
      <div className="report-card">
        <div className="between">
          <div>
            <div className="eyebrow">WEEKLY REPORT</div>
            <h2 style={{ fontSize: 26 }}>
              {data.weekStart} — {data.weekEnd}
            </h2>
            <p className="muted small">目标 {data.goal} 天 · 本周打卡 {data.checkinDays} 天</p>
          </div>
          <Button variant="primary" onClick={download}>
            下载周报图片
          </Button>
        </div>
        <div className="report-grid">
          <div>
            <div className="stat-label">训练次数</div>
            <div className="report-big">{data.sessions}</div>
          </div>
          <div>
            <div className="stat-label">总容量</div>
            <div className="report-big" style={{ color: 'var(--accent)' }}>
              {formatNumber(weightValue(data.volumeKg, unit), 0)}
              <span style={{ fontSize: 15, color: 'var(--muted)', marginLeft: 6 }}>{unit}</span>
            </div>
          </div>
          <div>
            <div className="stat-label">训练时长</div>
            <div className="report-big">{formatDuration(data.durationSec)}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 14 }}>
          <Progress value={data.checkinDays} max={data.goal} />
          <span className="small muted nowrap">
            {data.goalAchieved ? '目标达成' : `${data.checkinDays}/${data.goal} 天`}
          </span>
        </div>
        <div style={{ marginTop: 20 }}>
          <div className="eyebrow">亮点 PR</div>
          {data.highlights.length ? (
            <div className="stack-sm">
              {data.highlights.map((highlight: any) => (
                <div key={highlight.exerciseName} className="between">
                  <span>{highlight.exerciseName}</span>
                  <span className="mono" style={{ color: 'var(--accent)' }}>
                    估算 1RM {formatNumber(weightValue(highlight.estimated1RM, unit), 1)} {unit}
                    <span className="muted small" style={{ marginLeft: 6 }}>
                      此前 {formatNumber(weightValue(highlight.previous, unit), 1)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">本周没有新的 PR。稳定完成训练同样重要。</p>
          )}
        </div>
      </div>
      <div className="grid grid-3">
        <Card>
          <Stat label="较上周容量" value={data.volumeDeltaPct === null ? '—' : `${data.volumeDeltaPct >= 0 ? '+' : ''}${data.volumeDeltaPct}%`} />
        </Card>
        <Card>
          <Stat label="较上周次数" value={`${data.sessions - data.previous.sessions >= 0 ? '+' : ''}${data.sessions - data.previous.sessions}`} unit="次" />
        </Card>
        <Card>
          <Stat label="本周打卡" value={data.checkinDays} unit="天" />
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------- 导出 -------------------------------- */
function ExportTab() {
  const { toast } = useApp();
  const exportsList = useAsync<any>(() => api.get('/api/exports'), []);
  const counts = useAsync<any>(() => api.get('/api/stats/exportable'), []);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const data = await api.post('/api/exports');
      toast(data.message, 'success');
      exportsList.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="stack">
      <Card>
        <div className="between">
          <div>
            <h3 style={{ fontSize: 17 }}>导出我的全部数据</h3>
            <p className="muted small" style={{ marginTop: 4 }}>
              训练与组、打卡、身体数据导出为 CSV；文章块结构与媒体清单导出为 JSON。下载链接 7 天内有效。
            </p>
          </div>
          <Button variant="primary" loading={creating} onClick={create}>
            申请导出
          </Button>
        </div>
        <div className="grid grid-4" style={{ marginTop: 18 }}>
          <Stat label="训练记录" value={counts.data?.sessions ?? '—'} unit="条" />
          <Stat label="打卡" value={counts.data?.checkins ?? '—'} unit="天" />
          <Stat label="文章" value={counts.data?.posts ?? '—'} unit="篇" />
          <Stat label="身体数据" value={counts.data?.body ?? '—'} unit="条" />
        </div>
      </Card>

      <Card padded={false}>
        <div className="editor-panel-head">
          <span>导出记录</span>
          <span className="mono">{exportsList.data?.items?.length ?? 0}</span>
        </div>
        {exportsList.data?.items?.length ? (
          <div style={{ padding: '4px 20px 14px' }}>
            {exportsList.data.items.map((item: any) => (
              <div key={item.id} style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="between" style={{ marginBottom: 8 }}>
                  <div>
                    <strong style={{ fontSize: 13.5 }}>导出 {new Date(item.createdAt).toLocaleString('zh-CN')}</strong>
                    <p className="muted small">
                      {item.expired ? '链接已过期' : `有效期至 ${new Date(item.expiresAt).toLocaleDateString('zh-CN')}`} · {item.files.length} 个文件
                    </p>
                  </div>
                  {item.expired && <Pill tone="warn">已过期</Pill>}
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {item.files.map((file: any) => (
                    <button
                      key={file.name}
                      className="btn btn-outline btn-sm"
                      disabled={item.expired}
                      onClick={() =>
                        downloadWithAuth(`/api/exports/${item.id}/download/${encodeURIComponent(file.name)}`, file.name).catch((err) =>
                          toast(errorMessage(err), 'error'),
                        )
                      }
                    >
                      ↓ {file.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small" style={{ padding: '12px 20px 22px' }}>
            还没有导出记录。申请后在此下载 CSV 与 JSON。
          </p>
        )}
      </Card>

      <div className="notice">
        <span>ⓘ</span>
        <div>
          注销账号后有 30 天撤销期；到期会彻底删除训练、文章与全部媒体文件。建议注销前先导出。
          <Link to="/settings" style={{ color: 'var(--accent)', marginLeft: 6 }}>
            前往账号设置
          </Link>
        </div>
      </div>
    </div>
  );
}
