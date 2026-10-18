import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import {
  formatClock,
  formatNumber,
  setTypeLabel,
  weightToKg,
  weightValue,
  type WeightUnit,
} from '../lib/format';
import { useDebouncedValue, useLocalStorage } from '../lib/hooks';
import { enqueue, flushPending, loadPending, type PendingOp } from '../lib/offline';
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Pill, Spinner, Textarea } from '../components/Ui';
import { MediaUploader } from '../components/MediaUploader';
import type { Exercise, SessionDetail, WorkoutSet } from '../types';

const SESSION_TITLES: Record<string, string> = {
  strength: '力量训练',
  cardio: '有氧训练',
  stretch: '拉伸放松',
  other: '其他训练',
};

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `op-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function beep() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 220);
  } catch {
    /* ignore */
  }
}

export function SessionEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, toast } = useApp();
  const creating = useRef(false);

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [feeling, setFeeling] = useState<number | null>(null);
  const [unit, setUnit] = useLocalStorage<WeightUnit>('fitlog.unit', 'kg');
  const [savedState, setSavedState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pending, setPending] = useState<PendingOp[]>([]);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [removingItem, setRemovingItem] = useState<{ id: string; name: string } | null>(null);
  const [tick, setTick] = useState(Date.now());
  const [rest, setRest] = useState<{ left: number; running: boolean; total: number }>({ left: 90, running: false, total: 90 });
  const debouncedQuery = useDebouncedValue(exerciseQuery, 320);

  /* ---------------------------- 初始化 ---------------------------- */
  useEffect(() => {
    if (id) {
      void load(id);
      return;
    }
    if (creating.current) return;
    creating.current = true;
    const type = ['strength', 'cardio', 'stretch', 'other'].includes(searchParams.get('type') ?? '')
      ? (searchParams.get('type') as string)
      : 'strength';
    api
      .post('/api/sessions', {
        type,
        title: SESSION_TITLES[type],
        startedAt: new Date().toISOString(),
        tzOffset: new Date().getTimezoneOffset(),
        source: 'manual',
        visibility: user?.defaultSessionVisibility ?? 'private',
        items: [],
      })
      .then((result) => navigate(`/sessions/${result.session.id}/edit`, { replace: true }))
      .catch((err) => {
        setError(errorMessage(err));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load(sessionId: string) {
    setLoading(true);
    try {
      const data = await api.get<SessionDetail>(`/api/sessions/${sessionId}`);
      setSession(data);
      setTitle(data.title ?? '');
      setNotes(data.notes ?? '');
      setFeeling(data.feeling);
      setSelectedId((current) => current ?? data.items[0]?.id ?? null);
      setPending(loadPending(sessionId));
      setError(null);
      const stored = localStorage.getItem(`fitlog.rest.${data.items[0]?.exerciseId ?? 'default'}`);
      const seconds = Number(stored ?? 90) || 90;
      setRest((value) => ({ ...value, total: seconds, left: value.running ? value.left : seconds }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------- 计时与网络 ---------------------------- */
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!rest.running) return;
    const timer = setInterval(() => {
      setRest((value) => {
        if (value.left <= 1) {
          beep();
          toast('休息结束，可以开始下一组了', 'success');
          return { ...value, left: 0, running: false };
        }
        return { ...value, left: value.left - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rest.running, toast]);

  useEffect(() => {
    const onOnline = async () => {
      setOnline(true);
      if (!id) return;
      const result = await flushPending(id);
      if (result.synced > 0) {
        toast(`已同步 ${result.synced} 条离线记录`, 'success');
        const ops = loadPending(id);
        setPending(ops);
        await load(id);
        if (!ops.some((op) => op.kind === 'finish')) navigate(`/sessions/${id}`);
      }
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const onPending = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (id && detail?.sessionId === id) setPending(loadPending(id));
    };
    window.addEventListener('fitlog:pending', onPending as EventListener);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('fitlog:pending', onPending as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ---------------------------- 动作选择 ---------------------------- */
  useEffect(() => {
    if (!pickerOpen) return;
    setPickerLoading(true);
    const path = debouncedQuery
      ? `/api/exercises?q=${encodeURIComponent(debouncedQuery)}`
      : '/api/exercises/recent';
    api
      .get<any>(path)
      .then((data) => setExercises(data.items ?? []))
      .catch(() => setExercises([]))
      .finally(() => setPickerLoading(false));
  }, [pickerOpen, debouncedQuery]);

  const selectedItem = useMemo(
    () => session?.items.find((item) => item.id === selectedId) ?? null,
    [session, selectedId],
  );

  const elapsed = session ? Math.max(0, Math.round((tick - new Date(session.startedAt).getTime()) / 1000)) : 0;

  /* ---------------------------- 保存动作 ---------------------------- */
  const markSaved = () => {
    setSavedState('saved');
  };

  const saveTitle = async () => {
    if (!session || title === (session.title ?? '')) return;
    setSavedState('saving');
    try {
      await api.patch(`/api/sessions/${session.id}`, { title });
      setSession({ ...session, title });
      markSaved();
    } catch (err) {
      setSavedState('error');
    }
  };

  const addExercise = async (exercise: Exercise) => {
    if (!session) return;
    setPickerOpen(false);
    try {
      const data = await api.post<SessionDetail>(`/api/sessions/${session.id}/items`, {
        exerciseId: exercise.id,
      });
      setSession(data);
      setSelectedId(data.items[data.items.length - 1]?.id ?? null);
      toast(`已添加 ${exercise.name}`, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const addSet = async () => {
    if (!session || !selectedItem) return;
    const isCardio = selectedItem.exerciseType === 'cardio';
    const lastSet = selectedItem.sets[selectedItem.sets.length - 1];
    const payload = isCardio
      ? {
          durationSec: lastSet?.durationSec ?? 1800,
          distanceKm: lastSet?.distanceKm ?? null,
          avgHr: lastSet?.avgHr ?? null,
          setType: 'normal',
          clientOpId: uid(),
        }
      : {
          weightKg: lastSet?.weightKg ?? selectedItem.last?.weightKg ?? 0,
          reps: lastSet?.reps ?? selectedItem.last?.reps ?? 10,
          rpe: null,
          setType: 'normal',
          clientOpId: uid(),
        };
    setSavedState('saving');
    try {
      const result = await api.post(`/api/sessions/${session.id}/items/${selectedItem.id}/sets`, payload);
      setSession(result.session);
      markSaved();
      startRest();
      toast(isCardio ? '已添加一组有氧记录' : '已添加一组', 'success');
    } catch (err) {
      setSavedState('error');
      if (!online || (err as any).code === 'NETWORK_ERROR') {
        enqueue(session.id, {
          id: uid(),
          kind: 'set',
          itemId: selectedItem.id,
          payload,
          label: `${selectedItem.exerciseName} 一组`,
        });
        setPending(loadPending(session.id));
        toast('网络不佳，本组已保存在本地，联网后自动同步', 'error');
      } else {
        toast(errorMessage(err), 'error');
      }
    }
  };

  const updateSet = async (set: WorkoutSet, patch: Record<string, any>) => {
    if (!session) return;
    setSavedState('saving');
    try {
      const data = await api.patch<SessionDetail>(`/api/sessions/${session.id}/sets/${set.id}`, patch);
      setSession(data);
      markSaved();
    } catch (err) {
      setSavedState('error');
      toast(errorMessage(err), 'error');
    }
  };

  const deleteSet = async (set: WorkoutSet) => {
    if (!session) return;
    try {
      const data = await api.del<SessionDetail>(`/api/sessions/${session.id}/sets/${set.id}`);
      setSession(data);
      toast('已删除该组', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const saveItemNote = async (itemId: string, note: string) => {
    if (!session) return;
    try {
      await api.patch(`/api/sessions/${session.id}/items/${itemId}`, { note });
    } catch (err) {
      if ((err as any).code === 'NETWORK_ERROR') {
        enqueue(session.id, { id: uid(), kind: 'itemNote', itemId, note, label: '动作备注' });
        setPending(loadPending(session.id));
      }
    }
  };

  const removeItem = async () => {
    if (!session || !removingItem) return;
    try {
      const data = await api.del<SessionDetail>(`/api/sessions/${session.id}/items/${removingItem.id}`);
      setSession(data);
      setSelectedId(data.items[0]?.id ?? null);
      setRemovingItem(null);
      toast('已移除该动作', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const startRest = () => {
    const seconds = Number(localStorage.getItem(`fitlog.rest.${selectedItem?.exerciseId ?? 'default'}`) ?? 90) || 90;
    setRest({ left: seconds, running: true, total: seconds });
  };

  const persistNotes = async (nextFeeling = feeling) => {
    if (!session) return;
    setSavedState('saving');
    try {
      await api.patch(`/api/sessions/${session.id}`, { notes, feeling: nextFeeling, title });
      markSaved();
    } catch {
      setSavedState('error');
    }
  };

  const finish = async () => {
    if (!session) return;
    setFinishing(true);
    const payload = {
      endedAt: new Date().toISOString(),
      durationSec: elapsed,
      notes,
      feeling,
      title,
      tzOffset: new Date().getTimezoneOffset(),
    };
    try {
      await api.patch(`/api/sessions/${session.id}`, payload);
      toast('训练已保存，打卡已同步', 'success');
      navigate(`/sessions/${session.id}`);
    } catch (err) {
      if ((err as any).code === 'NETWORK_ERROR' || !online) {
        enqueue(session.id, { id: uid(), kind: 'finish', payload, label: '结束训练' });
        setPending(loadPending(session.id));
        toast('服务暂时不可用，训练已保存在本地，联网后自动同步', 'error');
        setFinishOpen(false);
      } else {
        toast(errorMessage(err), 'error');
      }
    } finally {
      setFinishing(false);
    }
  };

  const attachMedia = async (mediaIds: string[]) => {
    if (!session) return;
    try {
      await api.post(`/api/sessions/${session.id}/media`, { mediaIds });
      await load(session.id);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  if (loading && !session) return <Spinner label="正在载入训练" />;
  if (error && !session) return <div className="notice notice-danger">{error}</div>;
  if (!session) return null;

  const pendingForItem = pending.filter((op): op is Extract<PendingOp, { kind: 'set' }> => op.kind === 'set' && op.itemId === selectedItem?.id);

  return (
    <div>
      <div className="between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div className="row">
          <Link to="/sessions" className="muted small">
            ← 返回记录
          </Link>
          {!online && <Pill tone="warn">离线记录中，联网后自动同步</Pill>}
          {pending.length > 0 && <Pill tone="info">{pending.length} 条待同步</Pill>}
          <span className={`save-state ${savedState === 'saved' ? 'ok' : ''}`}>
            {savedState === 'saving' ? '保存中…' : savedState === 'error' ? '保存失败，请检查网络' : '已保存'}
          </span>
        </div>
        <div className="row">
          <span className="muted small">单位</span>
          <div className="segmented">
            <button className={unit === 'kg' ? 'active' : ''} onClick={() => setUnit('kg')}>
              kg
            </button>
            <button className={unit === 'lb' ? 'active' : ''} onClick={() => setUnit('lb')}>
              lb
            </button>
          </div>
          <Button variant="primary" onClick={() => setFinishOpen(true)}>
            结束训练
          </Button>
        </div>
      </div>

      <div className="editor-shell">
        <aside className="editor-panel">
          <div className="editor-panel-head">
            <span>本次动作</span>
            <span className="mono">{session.items.length}</span>
          </div>
          <div className="editor-exercise-list">
            {session.items.map((item) => (
              <button
                key={item.id}
                className={`exercise-list-item ${item.id === selectedId ? 'active' : ''}`}
                onClick={() => {
                  setSelectedId(item.id);
                  const seconds = Number(localStorage.getItem(`fitlog.rest.${item.exerciseId}`) ?? rest.total) || 90;
                  setRest((value) => ({ ...value, total: seconds, left: value.running ? value.left : seconds }));
                }}
              >
                <strong>{item.exerciseName}</strong>
                <span>
                  {item.sets.length} 组 · {item.primaryMuscle}
                </span>
              </button>
            ))}
            <button className="exercise-list-item" style={{ border: '1px dashed var(--border-strong)', marginTop: 8 }} onClick={() => setPickerOpen(true)}>
              <strong>＋ 添加动作</strong>
              <span>搜索动作库 / 最近使用</span>
            </button>
          </div>
        </aside>

        <section className="editor-panel">
          <div className="editor-main-head">
            <input
              className="input"
              style={{ flex: 1, minWidth: 160, background: 'transparent', border: '1px solid transparent', fontSize: 18, fontWeight: 600, paddingLeft: 0 }}
              value={title}
              maxLength={60}
              placeholder="训练标题"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
            />
            <span className="editor-timer" title="本次训练已进行">
              ⏱ {formatClock(session.endedAt ? session.durationSec : elapsed)}
            </span>
          </div>

          {selectedItem ? (
            <>
              <div className="editor-main-head" style={{ borderBottom: 0, paddingBottom: 8 }}>
                <div>
                  <h3 style={{ fontSize: 17 }}>{selectedItem.exerciseName}</h3>
                  <p className="muted small">
                    {selectedItem.primaryMuscle} · {selectedItem.equipment} ·{' '}
                    {selectedItem.last ? `上次 ${formatNumber(weightValue(selectedItem.last.weightKg, unit) ?? 0, 1)} ${unit} × ${selectedItem.last.reps}` : '没有历史数据'}
                  </p>
                </div>
                <div className="row" style={{ marginLeft: 'auto' }}>
                  <Button size="sm" variant="ghost" onClick={() => setRemovingItem({ id: selectedItem.id, name: selectedItem.exerciseName })}>
                    移除动作
                  </Button>
                </div>
              </div>

              <div className="editor-sets">
                <div className="editor-set-row head">
                  <span>组</span>
                  {selectedItem.exerciseType === 'cardio' ? (
                    <>
                      <span>时长（分钟）</span>
                      <span>距离（km）</span>
                      <span className="rpe-col">心率</span>
                    </>
                  ) : (
                    <>
                      <span>重量（{unit}）</span>
                      <span>次数</span>
                      <span className="rpe-col">RPE</span>
                    </>
                  )}
                  <span className="type-col">类型</span>
                  <span />
                </div>

                {selectedItem.sets.map((set) => (
                  <SetRow
                    key={`${set.id}-${set.weightKg}-${set.reps}-${set.rpe}-${set.setType}-${set.durationSec}`}
                    set={set}
                    unit={unit}
                    cardio={selectedItem.exerciseType === 'cardio'}
                    done={!!done[set.id]}
                    onDone={() => {
                      setDone((value) => ({ ...value, [set.id]: !value[set.id] }));
                      startRest();
                    }}
                    onUpdate={(patch) => updateSet(set, patch)}
                    onDelete={() => deleteSet(set)}
                  />
                ))}

                {pendingForItem.map((op) => (
                  <div key={op.id} className="editor-set-row" style={{ opacity: 0.65 }}>
                    <span className="set-num">⏳</span>
                    <span className="mono" style={{ textAlign: 'center' }}>
                      {op.payload.weightKg ?? '—'}
                    </span>
                    <span className="mono" style={{ textAlign: 'center' }}>
                      {op.payload.reps ?? '—'}
                    </span>
                    <span className="mono rpe-col" style={{ textAlign: 'center' }}>
                      {op.payload.durationSec ? `${Math.round(op.payload.durationSec / 60)}m` : '—'}
                    </span>
                    <span className="type-col muted small">待同步</span>
                    <span />
                  </div>
                ))}

                <div style={{ padding: '12px 16px' }}>
                  <Button variant="outline" size="sm" onClick={addSet}>
                    ＋ 添加一组
                  </Button>
                  <span className="muted small" style={{ marginLeft: 10 }}>
                    失焦自动保存 · 勾选 ✓ 开始休息计时
                  </span>
                </div>
              </div>

              <div className="editor-notes">
                <Field label="动作备注" hint="例如：右肩紧、下一组减重">
                  <Textarea
                    key={selectedItem.id + (selectedItem.note ?? '')}
                    defaultValue={selectedItem.note ?? ''}
                    rows={2}
                    maxLength={200}
                    placeholder="这一组的感觉…"
                    onBlur={(e) => saveItemNote(selectedItem.id, e.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : (
            <EmptyState
              icon="＋"
              title="先添加一个动作"
              description="搜索动作库，或从最近使用与收藏里选。"
              action={
                <Button variant="primary" onClick={() => setPickerOpen(true)}>
                  添加动作
                </Button>
              }
            />
          )}
        </section>

        <aside className="editor-side">
          <div className="timer-card">
            <div className="between">
              <span className="eyebrow" style={{ margin: 0 }}>
                组间休息
              </span>
              <span className="muted small">{rest.total}s</span>
            </div>
            <div className={`timer-display ${rest.running ? 'running' : ''}`}>
              {Math.floor(rest.left / 60)}:{String(rest.left % 60).padStart(2, '0')}
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button size="sm" variant="outline" onClick={() => setRest((value) => ({ ...value, left: Math.max(0, value.left - 15) }))}>
                -15s
              </Button>
              {rest.running ? (
                <Button size="sm" variant="soft" onClick={() => setRest((value) => ({ ...value, running: false }))}>
                  暂停
                </Button>
              ) : (
                <Button size="sm" variant="primary" onClick={() => setRest((value) => ({ ...value, left: value.left || value.total, running: true }))}>
                  开始
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setRest((value) => ({ ...value, left: Math.min(600, value.left + 15) }))}>
                +15s
              </Button>
            </div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
              {[60, 90, 120].map((seconds) => (
                <button
                  key={seconds}
                  className="pill"
                  style={{ cursor: 'pointer', border: '1px solid var(--border)' }}
                  onClick={() => {
                    setRest({ left: seconds, running: false, total: seconds });
                    if (selectedItem) localStorage.setItem(`fitlog.rest.${selectedItem.exerciseId}`, String(seconds));
                  }}
                >
                  {seconds}s
                </button>
              ))}
            </div>
          </div>

          <Card padded={false}>
            <div className="editor-panel-head">
              <span>训练备注</span>
            </div>
            <div style={{ padding: 14 }}>
              <Textarea
                value={notes}
                rows={4}
                maxLength={2000}
                placeholder="今天的整体感受、睡眠、饮食…"
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => persistNotes()}
              />
              <div className="between" style={{ marginTop: 10 }}>
                <span className="field-label">体感评分</span>
                <div className="row" style={{ gap: 2 }}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      className="icon-btn"
                      style={{ color: (feeling ?? 0) >= value ? 'var(--accent)' : 'var(--muted-2)', fontSize: 16 }}
                      onClick={() => {
                        const next = feeling === value ? null : value;
                        setFeeling(next);
                        void persistNotes(next);
                      }}
                      aria-label={`${value} 星`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <Button size="sm" variant="ghost" style={{ marginTop: 6 }} onClick={() => persistNotes()}>
                保存备注
              </Button>
            </div>
          </Card>

          <Card padded={false}>
            <div className="editor-panel-head">
              <span>影像（{session.media.length}）</span>
              <Link to={`/sessions/${session.id}`} className="small muted">
                详情
              </Link>
            </div>
            <div style={{ padding: 14 }}>
              {session.media.length > 0 && (
                <div className="media-grid" style={{ marginBottom: 10 }}>
                  {session.media.map((media) => (
                    <div key={media.id} className="media-thumb">
                      <img src={media.thumbUrl ?? media.url ?? ''} alt={media.originalName} loading="lazy" />
                      {media.type === 'video' && <span className="media-tag">▶</span>}
                    </div>
                  ))}
                </div>
              )}
              <MediaUploader allowWatermark compact onUploaded={(list) => attachMedia(list.map((m) => m.id))} />
            </div>
          </Card>
        </aside>
      </div>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="添加动作"
        description="搜索动作库；不输入时展示最近使用。"
        width={560}
      >
        <div className="stack">
          <Input
            autoFocus
            placeholder="搜索动作名称或别名，如：卧推 / RDL / 深蹲"
            value={exerciseQuery}
            onChange={(e) => setExerciseQuery(e.target.value)}
          />
          <div style={{ maxHeight: '48vh', overflow: 'auto' }}>
            {pickerLoading ? (
              <Spinner />
            ) : exercises.length === 0 ? (
              <EmptyState
                icon="◌"
                title="没有找到动作"
                description="可以到动作库新建自建动作，或换个关键词。"
                action={
                  <Button variant="outline" size="sm" onClick={() => navigate('/exercises')}>
                    去动作库
                  </Button>
                }
              />
            ) : (
              <div className="stack-sm">
                {exercises.map((exercise) => (
                  <button key={exercise.id} className="embed-option" onClick={() => addExercise(exercise)}>
                    <strong style={{ fontSize: 13.5 }}>{exercise.name}</strong>
                    <span>
                      {exercise.primaryMuscle} · {exercise.equipment}
                      {exercise.isFavorite ? ' · ★ 收藏' : ''}
                      {!exercise.isBuiltin ? ' · 自建' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="muted small">动作库共 135 个内置动作；自建动作仅本人可见。</p>
        </div>
      </Modal>

      <Modal
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        title="结束并保存训练？"
        description={`已记录 ${session.items.length} 个动作、${session.setCount} 组，将自动完成今日打卡。`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFinishOpen(false)}>
              继续训练
            </Button>
            <Button variant="primary" loading={finishing} onClick={finish}>
              结束并保存
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="notice notice-accent">
            <span>◉</span>
            <div>保存后会自动计算容量与 PR，并同步当日打卡。删除本次记录时打卡会回退。</div>
          </div>
          <Field label="训练备注">
            <Textarea value={notes} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="这次训练的感受…" />
          </Field>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="field-label">体感评分</span>
            <div className="row">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  className="icon-btn"
                  style={{ color: (feeling ?? 0) >= value ? 'var(--accent)' : 'var(--muted-2)', fontSize: 18 }}
                  onClick={() => setFeeling(feeling === value ? null : value)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          {!online && <div className="notice notice-warn">当前离线，保存会进入本地队列，联网后自动同步。</div>}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removingItem}
        title={`移除「${removingItem?.name ?? ''}」？`}
        message="该动作下的所有组记录会被删除，容量与 PR 会重新计算。"
        confirmText="移除"
        danger
        onConfirm={removeItem}
        onCancel={() => setRemovingItem(null)}
      />
    </div>
  );
}

function SetRow({
  set,
  unit,
  cardio,
  done,
  onDone,
  onUpdate,
  onDelete,
}: {
  set: WorkoutSet;
  unit: WeightUnit;
  cardio: boolean;
  done: boolean;
  onDone: () => void;
  onUpdate: (patch: Record<string, any>) => void;
  onDelete: () => void;
}) {
  const weight = weightValue(set.weightKg, unit);
  return (
    <div className={`editor-set-row ${done ? 'done' : ''}`}>
      <span className="set-num">{set.setIndex + 1}</span>
      {cardio ? (
        <>
          <input
            className="input"
            type="number"
            min={0}
            max={1440}
            defaultValue={set.durationSec ? Math.round(set.durationSec / 60) : ''}
            onBlur={(e) => {
              const minutes = Number(e.target.value);
              if (minutes > 0 && minutes * 60 !== set.durationSec) onUpdate({ durationSec: minutes * 60, weightKg: null, reps: null, distanceKm: set.distanceKm, avgHr: set.avgHr, rpe: set.rpe, setType: set.setType, note: set.note });
            }}
          />
          <input
            className="input"
            type="number"
            step="0.01"
            min={0}
            defaultValue={set.distanceKm ?? ''}
            onBlur={(e) => {
              const value = e.target.value === '' ? null : Number(e.target.value);
              if (value !== set.distanceKm) onUpdate({ distanceKm: value, durationSec: set.durationSec, weightKg: null, reps: null, avgHr: set.avgHr, rpe: set.rpe, setType: set.setType, note: set.note });
            }}
          />
          <input
            className="input rpe-col"
            type="number"
            min={30}
            max={250}
            defaultValue={set.avgHr ?? ''}
            onBlur={(e) => {
              const value = e.target.value === '' ? null : Number(e.target.value);
              if (value !== set.avgHr) onUpdate({ avgHr: value, durationSec: set.durationSec, weightKg: null, reps: null, distanceKm: set.distanceKm, rpe: set.rpe, setType: set.setType, note: set.note });
            }}
          />
        </>
      ) : (
        <>
          <input
            className="input"
            type="number"
            step="0.5"
            min={0}
            max={1000}
            defaultValue={weight ?? ''}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            onBlur={(e) => {
              const raw = e.target.value === '' ? null : Number(e.target.value);
              const kg = raw === null ? null : weightToKg(raw, unit);
              if (kg !== set.weightKg) {
                onUpdate({ weightKg: kg, reps: set.reps, rpe: set.rpe, setType: set.setType, note: set.note });
              }
            }}
          />
          <input
            className="input"
            type="number"
            min={1}
            max={1000}
            defaultValue={set.reps ?? ''}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            onBlur={(e) => {
              const reps = e.target.value === '' ? null : Number(e.target.value);
              if (reps !== set.reps) onUpdate({ weightKg: set.weightKg, reps, rpe: set.rpe, setType: set.setType, note: set.note });
            }}
          />
          <input
            className="input rpe-col"
            type="number"
            step="0.5"
            min={6}
            max={10}
            defaultValue={set.rpe ?? ''}
            onBlur={(e) => {
              const rpe = e.target.value === '' ? null : Number(e.target.value);
              if (rpe !== set.rpe) onUpdate({ weightKg: set.weightKg, reps: set.reps, rpe, setType: set.setType, note: set.note });
            }}
          />
        </>
      )}
      <select
        className="input select set-type-select type-col"
        defaultValue={set.setType}
        onChange={(e) => onUpdate({ weightKg: set.weightKg, reps: set.reps, rpe: set.rpe, setType: e.target.value, note: set.note, durationSec: set.durationSec, distanceKm: set.distanceKm, avgHr: set.avgHr })}
      >
        {(['normal', 'warmup', 'drop', 'superset'] as const).map((type) => (
          <option key={type} value={type}>
            {setTypeLabel(type)}
          </option>
        ))}
      </select>
      <div className="row" style={{ gap: 2 }}>
        <button className={`set-check ${done ? 'on' : ''}`} onClick={onDone} title="完成本组并开始休息计时">
          ✓
        </button>
        <button className="icon-btn" onClick={onDelete} title="删除该组" style={{ width: 26, height: 26 }}>
          ✕
        </button>
      </div>
    </div>
  );
}
