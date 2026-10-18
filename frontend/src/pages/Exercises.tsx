import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync, useDebouncedValue } from '../lib/hooks';
import { Button, Card, EmptyState, Field, Input, Modal, Pill, Select, Spinner, Tabs } from '../components/Ui';
import type { Exercise } from '../types';

const MUSCLES = ['胸', '背', '腿', '臀', '肩', '手臂', '核心', '有氧', '全身'];
const EQUIPMENTS = ['杠铃', '哑铃', '器械', '绳索', '自重', '壶铃', '弹力带', '有氧器械', '其他'];

export function Exercises() {
  const navigate = useNavigate();
  const { toast } = useApp();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    aliases: '',
    primaryMuscle: '胸',
    secondaryMuscles: '',
    equipment: '器械',
    type: 'strength',
  });
  const debounced = useDebouncedValue(q, 300);
  const list = useAsync<{ items: Exercise[] }>(
    () =>
      api.get(
        `/api/exercises?q=${encodeURIComponent(debounced)}${muscle ? `&muscle=${muscle}` : ''}${equipment ? `&equipment=${equipment}` : ''}${favorite ? '&favorite=1' : ''}`,
      ),
    [debounced, muscle, equipment, favorite],
  );

  const toggleFavorite = async (exercise: Exercise) => {
    try {
      const result = await api.post(`/api/exercises/${exercise.id}/favorite`);
      toast(result.favorite ? '已收藏' : '已取消收藏', 'success');
      list.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const create = async () => {
    if (!form.name.trim()) {
      toast('请填写动作名称', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/exercises', {
        name: form.name.trim(),
        aliases: form.aliases ? form.aliases.split(/[,，]/).map((item) => item.trim()).filter(Boolean) : [],
        primaryMuscle: form.primaryMuscle,
        secondaryMuscles: form.secondaryMuscles
          ? form.secondaryMuscles.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
          : [],
        equipment: form.equipment,
        type: form.type,
      });
      toast('自建动作已创建，仅本人可见', 'success');
      setCreateOpen(false);
      setForm({ ...form, name: '', aliases: '', secondaryMuscles: '' });
      list.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 18, alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">EXERCISE LIBRARY</div>
          <h1 style={{ fontSize: 30 }}>动作库</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            135 个内置动作，覆盖胸 / 背 / 腿 / 肩 / 手臂 / 核心 / 有氧 / 拉伸。
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + 自建动作
        </Button>
      </div>

      <div className="toolbar">
        <Input className="search" placeholder="搜索动作名称或别名…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={muscle} onChange={(e) => setMuscle(e.target.value)} style={{ width: 120 }}>
          <option value="">全部肌群</option>
          {MUSCLES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </Select>
        <Select value={equipment} onChange={(e) => setEquipment(e.target.value)} style={{ width: 130 }}>
          <option value="">全部器械</option>
          {EQUIPMENTS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </Select>
        <Button variant={favorite ? 'primary' : 'outline'} size="md" onClick={() => setFavorite((value) => !value)}>
          ★ 收藏
        </Button>
      </div>

      <Tabs
        value={muscle || 'all'}
        onChange={(value) => setMuscle(value === 'all' ? '' : value)}
        items={[{ value: 'all', label: '全部' }, ...MUSCLES.slice(0, 4).map((item) => ({ value: item, label: item }))]}
      />

      {list.loading && !list.data ? (
        <Spinner label="正在读取动作库" />
      ) : !list.data?.items.length ? (
        <Card>
          <EmptyState icon="◌" title="没有找到动作" description="试试其它关键词，或自建一个动作（仅本人可见）。" />
        </Card>
      ) : (
        <div className="grid grid-3" style={{ marginTop: 16 }}>
          {list.data.items.map((exercise) => (
            <Card key={exercise.id} className="card-hover" padded={false}>
              <div style={{ padding: '16px 18px', cursor: 'pointer' }} onClick={() => navigate(`/exercises/${exercise.id}`)}>
                <div className="between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: 15.5 }}>{exercise.name}</h3>
                    <p className="muted small" style={{ marginTop: 2 }}>
                      {exercise.aliases.length ? exercise.aliases.join(' / ') : '无别名'}
                    </p>
                  </div>
                  <button
                    className="icon-btn"
                    style={{ color: exercise.isFavorite ? 'var(--accent)' : 'var(--muted-2)', fontSize: 15 }}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(exercise);
                    }}
                    aria-label="收藏"
                  >
                    ★
                  </button>
                </div>
                <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
                  <Pill tone="accent">{exercise.primaryMuscle}</Pill>
                  <Pill>{exercise.equipment}</Pill>
                  <Pill tone="muted">{exercise.type === 'strength' ? '力量' : exercise.type === 'cardio' ? '有氧' : '拉伸'}</Pill>
                  {!exercise.isBuiltin && <Pill tone="info">自建 · 仅自己</Pill>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建自建动作"
        description="自建动作仅本人可见，可用于动作库尚未覆盖的器械或变式。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={create}>
              创建
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="动作名称">
            <Input value={form.name} maxLength={30} placeholder="例如：器械夹胸" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="别名" hint="多个别名用逗号分隔">
            <Input value={form.aliases} placeholder="夹胸, 蝴蝶机" onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
          </Field>
          <div className="grid grid-2">
            <Field label="主要肌群">
              <Select value={form.primaryMuscle} onChange={(e) => setForm({ ...form, primaryMuscle: e.target.value })}>
                {MUSCLES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </Field>
            <Field label="器械">
              <Select value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })}>
                {EQUIPMENTS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="次要肌群" hint="多个肌群用逗号分隔，可留空">
            <Input value={form.secondaryMuscles} placeholder="肩, 手臂" onChange={(e) => setForm({ ...form, secondaryMuscles: e.target.value })} />
          </Field>
          <Field label="动作类型">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="strength">力量</option>
              <option value="cardio">有氧</option>
              <option value="stretch">拉伸</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
