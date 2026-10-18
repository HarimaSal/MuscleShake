import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync } from '../lib/hooks';
import { formatNumber, relativeDate, weightValue, type WeightUnit } from '../lib/format';
import { useLocalStorage } from '../lib/hooks';
import { Button, Card, EmptyState, Field, Modal, Pill, Segmented, Select, Spinner, Stat } from '../components/Ui';
import { LineChart } from '../components/Charts';
import type { ExerciseDetail as ExerciseDetailType, Exercise } from '../types';

export function ExerciseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useApp();
  const detail = useAsync<ExerciseDetailType>(() => api.get(`/api/exercises/${id}`), [id]);
  const all = useAsync<{ items: Exercise[] }>(() => api.get('/api/exercises'), []);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [merging, setMerging] = useState(false);
  const [unit, setUnit] = useLocalStorage<WeightUnit>('fitlog.unit', 'kg');

  if (detail.loading && !detail.data) return <Spinner label="正在读取动作详情" />;
  if (detail.error) return <div className="notice notice-danger">{detail.error}</div>;
  const data = detail.data!;

  const toggleFavorite = async () => {
    try {
      await api.post(`/api/exercises/${data.id}/favorite`);
      detail.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const merge = async () => {
    if (!targetId) {
      toast('请选择目标动作', 'error');
      return;
    }
    setMerging(true);
    try {
      await api.post('/api/exercises/merge', { sourceId: data.id, targetId });
      toast('已合并，历史记录已迁移，原动作归档', 'success');
      navigate(`/exercises/${targetId}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setMerging(false);
    }
  };

  const trendPoints = data.trend.map((point) => ({
    label: point.date.slice(5),
    value: weightValue(point.estimated1RM, unit) || null,
  }));

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <Link to="/exercises" className="muted small">
          ← 动作库
        </Link>
      </div>

      <div className="detail-head">
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <Pill tone="accent">{data.primaryMuscle}</Pill>
            <Pill>{data.equipment}</Pill>
            {data.isBuiltin ? <Pill tone="muted">内置动作</Pill> : <Pill tone="info">自建 · 仅自己</Pill>}
          </div>
          <h1 style={{ fontSize: 32 }}>{data.name}</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            {data.aliases.length ? `别名：${data.aliases.join(' / ')}` : '暂无别名'}
            {data.secondaryMuscles.length ? ` · 次要肌群：${data.secondaryMuscles.join('、')}` : ''}
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
          <Button variant="outline" onClick={toggleFavorite}>
            {data.isFavorite ? '★ 已收藏' : '☆ 收藏'}
          </Button>
          <Button variant="primary" onClick={() => navigate('/sessions/new?type=strength')}>
            开始训练
          </Button>
        </div>
      </div>

      <div className="detail-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Card>
          <Stat label="单组最大重量" value={data.prs.maxWeight ? formatNumber(weightValue(data.prs.maxWeight.weight, unit), 1) : '—'} unit={unit} hint={data.prs.maxWeight?.date ? relativeDate(data.prs.maxWeight.date) : '暂无记录'} />
        </Card>
        <Card>
          <Stat label="估算 1RM" value={data.prs.maxE1RM ? formatNumber(weightValue(data.prs.maxE1RM.value, unit), 1) : '—'} unit={unit} hint={data.prs.maxE1RM ? `${formatNumber(weightValue(data.prs.maxE1RM.weight, unit), 1)}${unit} × ${data.prs.maxE1RM.reps}（估算）` : '暂无记录'} />
        </Card>
        <Card>
          <Stat label="单组最大次数" value={data.prs.maxReps ? data.prs.maxReps.reps : '—'} unit="次" hint={data.prs.maxReps ? `${formatNumber(weightValue(data.prs.maxReps.weight, unit), 1)}${unit}` : '暂无记录'} />
        </Card>
        <Card>
          <Stat label="上次数据" value={data.last ? `${formatNumber(weightValue(data.last.weightKg, unit), 1)} × ${data.last.reps}` : '—'} unit={data.last ? unit : undefined} hint={data.last ? relativeDate(data.last.localDate) : '还没有记录'} />
        </Card>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div className="between" style={{ marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 16 }}>最近 12 次估算 1RM</h3>
            <p className="muted small">Epley 公式，仅 reps ≤12 的组参与计算，数值为估算值。</p>
          </div>
          <div className="row">
            <span className="muted small">最近体积</span>
            <strong className="mono">
              {data.trend.length
                ? `${formatNumber(weightValue(data.trend[data.trend.length - 1].volume, unit), 0)} ${unit}`
                : '—'}
            </strong>
          </div>
        </div>
        <LineChart points={trendPoints} height={200} unit={unit} emptyText="记录 3 次以上后展示趋势" />
      </Card>

      <Card padded={false}>
        <div className="editor-panel-head">
          <span>历史记录</span>
          <span className="mono">{data.history.length}</span>
        </div>
        {data.history.length === 0 ? (
          <EmptyState icon="◌" title="还没有这个动作的记录" description="在一次训练中添加该动作后，历史与 PR 会出现在这里。" />
        ) : (
          <table className="pr-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>最大重量</th>
                <th>最大次数</th>
                <th>容量</th>
                <th>组数</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.history.map((row) => (
                <tr key={row.sessionId}>
                  <td className="name">{row.localDate}</td>
                  <td>{formatNumber(weightValue(row.maxWeight, unit), 1)} {unit}</td>
                  <td>{row.maxReps}</td>
                  <td>{formatNumber(weightValue(row.volume, unit), 0)} {unit}</td>
                  <td>{row.setCount}</td>
                  <td className="right">
                    <Link to={`/sessions/${row.sessionId}`} className="small" style={{ color: 'var(--accent)' }}>
                      查看
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {!data.isBuiltin && (
        <Card style={{ marginTop: 16 }}>
          <div className="between">
            <div>
              <h3 style={{ fontSize: 15 }}>合并重复动作</h3>
              <p className="muted small">把本动作合并到另一个动作，历史记录一并迁移，本动作归档后不可再选。</p>
            </div>
            <Button variant="outline" onClick={() => setMergeOpen(true)}>
              合并
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        title="合并到其它动作"
        description="合并后本动作的历史组记录会归属目标动作，操作不可撤销。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMergeOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={merging} onClick={merge}>
              确认合并
            </Button>
          </>
        }
      >
        <Field label="目标动作">
          <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">请选择</option>
            {(all.data?.items ?? [])
              .filter((item) => item.id !== data.id && item.type === data.type)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}（{item.primaryMuscle} · {item.equipment}）
                </option>
              ))}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}
