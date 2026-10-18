import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync } from '../lib/hooks';
import {
  formatDateLabel,
  formatDuration,
  formatNumber,
  formatTime,
  setTypeLabel,
  sessionTypeLabel,
  weightValue,
  type WeightUnit,
} from '../lib/format';
import { useLocalStorage } from '../lib/hooks';
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Pill, Segmented, Spinner, Textarea } from '../components/Ui';
import { MediaUploader } from '../components/MediaUploader';
import type { SessionDetail as SessionDetailType } from '../types';

export function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useApp();
  const session = useAsync<SessionDetailType>(() => api.get(`/api/sessions/${id}`), [id]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unit, setUnit] = useLocalStorage<WeightUnit>('fitlog.unit', 'kg');

  if (session.loading && !session.data) return <Spinner label="正在读取训练详情" />;
  if (session.error) return <div className="notice notice-danger">{session.error}</div>;
  const data = session.data!;

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      toast('请填写模板名称', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/sessions/${data.id}/template`, { name: templateName.trim() });
      toast('已保存为模板，下次可一键开练', 'success');
      setTemplateOpen(false);
      setTemplateName('');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/api/sessions/${data.id}`);
      toast('已删除，可在最近删除中恢复', 'success');
      navigate('/sessions');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const attachMedia = async (mediaIds: string[]) => {
    await api.post(`/api/sessions/${data.id}/media`, { mediaIds });
    session.reload();
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <Link to="/sessions" className="muted small">
          ← 训练记录
        </Link>
        <span className="muted small">/</span>
        <span className="small">{formatDateLabel(data.localDate)}</span>
      </div>

      <div className="detail-head">
        <div className="detail-title">
          <h1>{data.title || `${sessionTypeLabel(data.type)}训练`}</h1>
          <div className="detail-meta">
            <Pill tone="accent">{sessionTypeLabel(data.type)}</Pill>
            <span>{formatDateLabel(data.localDate)}</span>
            <span>
              {formatTime(data.startedAt)} – {formatTime(data.endedAt)}
            </span>
            <span>{formatDuration(data.durationSec)}</span>
            {data.source === 'quick' && <Pill tone="warn">快速补记</Pill>}
            {data.mediaCount > 0 && <Pill tone="info">{data.mediaCount} 个媒体</Pill>}
            <Segmented
              value={unit}
              onChange={setUnit}
              items={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
            />
          </div>
        </div>
        <div className="row wrap">
          <Button variant="outline" onClick={() => navigate(`/sessions/${data.id}/edit`)}>
            编辑 / 加组
          </Button>
          <Button variant="outline" onClick={() => setTemplateOpen(true)}>
            保存为模板
          </Button>
          <Button variant="outline" onClick={() => navigate(`/posts/new?sessionId=${data.id}`)}>
            写成文章
          </Button>
          <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
            删除
          </Button>
        </div>
      </div>

      <div className="detail-stats">
        <Card>
          <div className="stat-label">{data.type === 'cardio' ? '有氧容量' : '总容量'}</div>
          <div className="stat-value">
            {data.type === 'cardio' ? '—' : formatNumber(weightValue(data.volumeKg, unit), 1)}
            {data.type !== 'cardio' && <span className="stat-unit">{unit}</span>}
          </div>
        </Card>
        <Card>
          <div className="stat-label">总时长</div>
          <div className="stat-value">{formatDuration(data.durationSec)}</div>
        </Card>
        <Card>
          <div className="stat-label">动作 / 组</div>
          <div className="stat-value">
            {data.itemCount} <span className="stat-unit">/ {data.setCount} 组</span>
          </div>
        </Card>
        <Card>
          <div className="stat-label">体感</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>
            {data.feeling ? `${'★'.repeat(data.feeling)}${'☆'.repeat(5 - data.feeling)}` : '—'}
          </div>
        </Card>
      </div>

      {data.prs.length > 0 && (
        <div className="notice notice-accent" style={{ marginBottom: 16 }}>
          <span>★</span>
          <div>
            <strong>本次新 PR：</strong>
            {data.prs.map((pr, index) => (
              <span key={`${pr.exerciseId}-${pr.metric}-${index}`}>
                {index > 0 ? '；' : ''}
                {pr.exerciseName} {pr.label}{' '}
                {pr.metric === 'maxReps'
                  ? `${formatNumber(pr.value, 0)} 次（此前 ${formatNumber(pr.previous, 0)} 次）`
                  : `${formatNumber(weightValue(pr.value, unit), 1)} ${unit}（此前 ${formatNumber(weightValue(pr.previous, unit), 1)} ${unit}）`}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon="＋"
            title="这是一条快速补记"
            description="没有动作与组数据。需要更细的记录时，可以继续编辑补充。"
            action={
              <Button variant="primary" onClick={() => navigate(`/sessions/${data.id}/edit`)}>
                补充动作
              </Button>
            }
          />
        </Card>
      ) : (
        data.items.map((item, index) => (
          <div key={item.id} className="item-card">
            <div className="item-head">
              <span className="item-index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{item.exerciseName}</strong>
                <div className="muted small">
                  {item.primaryMuscle} · {item.equipment}
                </div>
              </div>
              <div className="item-meta">
                <span>{item.sets.length} 组</span>
                {item.exerciseType === 'strength' && (
                  <span>容量 {formatNumber(weightValue(item.volume, unit), 1)} {unit}</span>
                )}
                {item.prs.maxE1RM && (
                  <Pill tone="accent">PR {formatNumber(weightValue(item.prs.maxE1RM.value, unit), 1)}{unit}</Pill>
                )}
              </div>
            </div>
            <table className="set-table">
              <thead>
                <tr>
                  <th>组</th>
                  {item.exerciseType === 'cardio' ? (
                    <>
                      <th>时长</th>
                      <th>距离</th>
                      <th>平均心率</th>
                    </>
                  ) : (
                    <>
                      <th>重量</th>
                      <th>次数</th>
                      <th>RPE</th>
                    </>
                  )}
                  <th>类型</th>
                </tr>
              </thead>
              <tbody>
                {item.sets.map((set) => (
                  <tr key={set.id} className={set.setType === 'warmup' ? 'warmup' : ''}>
                    <td className="set-index">{set.setIndex + 1}</td>
                    {item.exerciseType === 'cardio' ? (
                      <>
                        <td>{set.durationSec ? `${Math.round(set.durationSec / 60)} 分钟` : '—'}</td>
                        <td>
                          {set.distanceKm != null
                            ? `${formatNumber(set.distanceKm, 2)} km（${formatNumber(set.distanceKm / 1.609344, 2)} mile）`
                            : '—'}
                        </td>
                        <td>{set.avgHr ?? '—'}</td>
                      </>
                    ) : (
                      <>
                        <td>{set.weightKg != null ? `${formatNumber(weightValue(set.weightKg, unit), 1)} ${unit}` : '—'}</td>
                        <td>{set.reps ?? '—'}</td>
                        <td>{set.rpe ?? '—'}</td>
                      </>
                    )}
                    <td style={{ fontFamily: 'var(--font)' }}>{setTypeLabel(set.setType)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {item.note && <div className="set-note">{item.note}</div>}
          </div>
        ))
      )}

      <Card style={{ marginTop: 16 }}>
        <div className="between" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 16 }}>影像</h3>
          <span className="muted small">图片与视频与本次训练绑定</span>
        </div>
        {data.media.length > 0 ? (
          <div className="media-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', marginBottom: 14 }}>
            {data.media.map((media) => (
              <a
                key={media.id}
                className="media-thumb"
                href={media.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                title={media.originalName}
              >
                {media.type === 'image' ? (
                  <img src={media.thumbUrl ?? media.url ?? ''} alt={media.originalName} loading="lazy" />
                ) : (
                  <>
                    <img src={media.thumbUrl ?? ''} alt={media.originalName} loading="lazy" />
                    <span className="media-tag">▶ 视频</span>
                  </>
                )}
                {media.watermark && <span className="media-tag" style={{ left: 'auto', right: 4, bottom: 4 }}>练迹</span>}
              </a>
            ))}
          </div>
        ) : (
          <p className="muted small" style={{ marginBottom: 12 }}>
            还没有影像。练完可以批量上传当天的照片和视频。
          </p>
        )}
        <MediaUploader allowWatermark compact onUploaded={(list) => attachMedia(list.map((m) => m.id))} />
      </Card>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>训练备注</h3>
          {data.notes ? <p style={{ whiteSpace: 'pre-wrap', color: '#d6dcc9' }}>{data.notes}</p> : <p className="muted small">没有备注</p>}
        </Card>
        <Card>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>数据口径</h3>
          <p className="muted small" style={{ lineHeight: 1.8 }}>
            容量 = Σ(重量 × 次数)，排除热身组。估算 1RM 使用 Epley 公式（仅 reps ≤12 的组），页面标注“估算值”。
            有氧训练不计入容量。
          </p>
        </Card>
      </div>

      <Modal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title="保存为模板"
        description="动作与组数会保留，重量留空，下次从中开练。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTemplateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={saveTemplate}>
              保存模板
            </Button>
          </>
        }
      >
        <Field label="模板名称" hint="例如：推日、腿日、居家拉伸">
          <Input
            value={templateName}
            maxLength={30}
            placeholder="推日"
            onChange={(e) => setTemplateName(e.target.value)}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="删除这条训练记录？"
        message="删除后当日自动打卡会回退，相关 PR 会重新计算。7 天内可在最近删除中恢复。"
        confirmText="删除"
        danger
        onConfirm={remove}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
