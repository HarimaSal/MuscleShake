import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Field, Input, Modal, Select, Textarea } from '../../src/components/Ui';
import { useAsync } from '../../src/lib/hooks';
import { formatNumber } from '../../src/lib/format';
import { OpsCard, OpsEmpty, OpsKpi, OpsLoading, OpsPageHead, OpsStatus, OpsDateTime } from './OpsUi';
import { ops } from './opsApi';
import { useOpsToast } from './OpsToast';

type Dict = Record<string, any>;

export function OpsExercisesPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [source, setSource] = useState('builtin');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(q);
  const meta = useAsync<any>(() => ops.get('/exercises/meta'), []);
  const list = useAsync<any>(() => ops.get(`/exercises?q=${encodeURIComponent(q)}&muscle=${encodeURIComponent(muscle)}&equipment=${encodeURIComponent(equipment)}&source=${source}&page=${page}&pageSize=50`), [q, muscle, equipment, source, page]);
  const toast = useOpsToast();

  const applySearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQ(search.trim());
    setParams(search.trim() ? { q: search.trim() } : {});
  };

  const archive = async (item: Dict, restore = false) => {
    if (!restore && !window.confirm(`确认归档「${item.name}」？历史记录保留，前台不再可选。`)) return;
    try {
      await ops.post(`/exercises/${item.id}/archive`, { restore, reason: restore ? '后台恢复' : '后台归档' });
      toast(restore ? '动作已恢复' : '动作已归档', 'success');
      list.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  return (
    <div>
      <OpsPageHead
        eyebrow="EXERCISE LIBRARY"
        title="动作列表"
        description="内置动作是公共资产。敏感字段修改需要影响评估，所有变更可回滚并留痕。"
        actions={<><Link className="btn btn-primary btn-sm" to="/exercises/new">新建动作</Link><Link className="btn btn-outline btn-sm" to="/exercises/import">批量导入</Link></>}
      />
      <form className="ops-toolbar" onSubmit={applySearch}>
        <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="名称、别名或 ID" aria-label="搜索动作" />
        <button className="btn btn-primary btn-sm" type="submit">搜索</button>
        <select className="input" value={muscle} onChange={(event) => { setMuscle(event.target.value); setPage(1); }} aria-label="主肌群">
          <option value="">全部肌群</option>
          {(meta.data?.muscles ?? []).map((item: string) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="input" value={equipment} onChange={(event) => { setEquipment(event.target.value); setPage(1); }} aria-label="器械">
          <option value="">全部器械</option>
          {(meta.data?.equipments ?? []).map((item: string) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="input" value={source} onChange={(event) => { setSource(event.target.value); setPage(1); }} aria-label="来源">
          <option value="builtin">内置动作</option>
          <option value="custom">用户自建</option>
          <option value="archived">已归档</option>
          <option value="merged">已合并</option>
        </select>
        <span className="small muted" style={{ marginLeft: 'auto' }}>{list.data?.total ?? 0} 个动作</span>
      </form>

      {list.loading && !list.data ? <OpsLoading /> : (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>动作</th><th>肌群 / 器械</th><th>类型</th><th>30 天使用</th><th>状态</th><th>版本</th><th>操作</th></tr></thead>
            <tbody>
              {(list.data?.items ?? []).map((item: Dict) => (
                <tr key={item.id}>
                  <td>
                    <Link className="name" to={`/exercises/${item.id}`}>{item.name}</Link>
                    {item.aliases?.length > 0 && <span className="ops-sub">别名：{item.aliases.join(' / ')}</span>}
                  </td>
                  <td>{item.primaryMuscle}<span className="ops-sub">{item.equipment}</span></td>
                  <td><span className="ops-tag">{item.type}</span></td>
                  <td className="mono">{formatNumber(item.usage30d ?? 0, 0)}<span className="ops-sub">累计 {formatNumber(item.usageCount ?? 0, 0)}</span></td>
                  <td><OpsStatus status={item.status} />{item.redirectTo && <span className="ops-sub">→ {item.redirectTo.slice(0, 12)}</span>}</td>
                  <td className="mono">v{item.version}</td>
                  <td>
                    <div className="actions">
                      <Link to={`/exercises/${item.id}`}>编辑</Link>
                      <Link to={`/exercises/${item.id}/versions`}>版本</Link>
                      {item.isBuiltin && !item.archived && <button type="button" onClick={() => void archive(item)}>归档</button>}
                      {item.archived && item.status !== 'merged' && <button type="button" onClick={() => void archive(item, true)}>恢复</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!list.data?.items?.length && <tr><td colSpan={7}><OpsEmpty title="没有匹配的动作" description="调整筛选条件，或新建一个动作。" /></td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="ops-pagination">
        <span>第 {page} 页 · 每页 50</span>
        <div className="row">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
          <Button size="sm" variant="outline" disabled={(list.data?.items?.length ?? 0) < 50} onClick={() => setPage((value) => value + 1)}>下一页</Button>
        </div>
      </div>
    </div>
  );
}

export function OpsExerciseEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useOpsToast();
  const meta = useAsync<any>(() => ops.get('/exercises/meta'), []);
  const detail = useAsync<any>(() => (id ? ops.get(`/exercises/${id}`) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState<Dict>({
    name: '', aliases: '', primaryMuscle: '', secondaryMuscles: '', equipment: '', type: 'strength',
    description: '', instructions: '', mediaIds: '', sortWeight: 0, sourceLicense: '',
  });
  const [policy, setPolicy] = useState('none');
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<Dict | null>(null);

  useEffect(() => {
    if (!detail.data) return;
    const data = detail.data;
    setOriginal(data);
    setForm({
      name: data.name ?? '', aliases: (data.aliases ?? []).join(', '),
      primaryMuscle: data.primaryMuscle ?? '', secondaryMuscles: (data.secondaryMuscles ?? []).join(', '),
      equipment: data.equipment ?? '', type: data.type ?? 'strength', description: data.description ?? '',
      instructions: (data.instructions ?? []).join('\n'), mediaIds: (data.mediaIds ?? []).join(', '),
      sortWeight: data.sortWeight ?? 0, sourceLicense: data.sourceLicense ?? '',
    });
  }, [detail.data]);

  const sensitive = Boolean(id && original && (form.primaryMuscle !== original.primaryMuscle || form.type !== original.type));
  const impact = detail.data?.impact;

  const update = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) return toast('请填写动作名称', 'error');
    if (sensitive && !window.confirm('主肌群或类型变更会影响历史统计。请确认已阅读影响评估并选择策略。')) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        aliases: split(form.aliases),
        secondaryMuscles: split(form.secondaryMuscles),
        instructions: split(form.instructions, '\n'),
        mediaIds: split(form.mediaIds),
        sortWeight: Number(form.sortWeight) || 0,
        effectivePolicy: sensitive ? policy : 'none',
        reason: sensitive ? '后台修改敏感字段' : '后台编辑动作',
      };
      const result = id ? await ops.patch<any>(`/exercises/${id}`, body) : await ops.post<any>('/exercises', body);
      toast(id ? '动作已更新并生成新版本' : '动作已创建', 'success');
      if (!id && result.id) navigate(`/exercises/${result.id}`);
      else detail.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (id && detail.loading && !detail.data) return <OpsLoading />;

  return (
    <div>
      <OpsPageHead
        eyebrow={id ? 'EXERCISE / EDIT' : 'EXERCISE / NEW'}
        title={id ? `编辑「${detail.data?.name ?? ''}」` : '新建内置动作'}
        description="内置动作会影响所有用户，请在保存前核对名称、别名与肌群。"
        actions={
          <>
            {id && <Link className="btn btn-outline btn-sm" to={`/exercises/${id}/versions`}>版本历史</Link>}
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
          </>
        }
      />
      <div className="ops-grid-2">
        <OpsCard title="基础信息">
          <div className="ops-form-grid">
            <div className="full"><Field label="动作名称"><Input value={form.name} maxLength={30} onChange={(e) => update('name', e.target.value)} /></Field></div>
            <div className="full"><Field label="别名" hint="逗号分隔，最多 10 个；用于搜索命中"><Input value={form.aliases} onChange={(e) => update('aliases', e.target.value)} /></Field></div>
            <Field label="主肌群"><Select value={form.primaryMuscle} onChange={(e) => update('primaryMuscle', e.target.value)}><option value="">请选择</option>{(meta.data?.muscles ?? []).map((item: string) => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="次要肌群"><Input value={form.secondaryMuscles} onChange={(e) => update('secondaryMuscles', e.target.value)} placeholder="逗号分隔" /></Field>
            <Field label="器械"><Select value={form.equipment} onChange={(e) => update('equipment', e.target.value)}><option value="">请选择</option>{(meta.data?.equipments ?? []).map((item: string) => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="类型"><Select value={form.type} onChange={(e) => update('type', e.target.value)}>{(meta.data?.types ?? []).map((item: string) => <option key={item}>{item}</option>)}</Select></Field>
            <div className="full"><Field label="动作说明"><Textarea rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} /></Field></div>
            <div className="full"><Field label="动作要点" hint="每行一条，最多 8 条"><Textarea rows={5} value={form.instructions} onChange={(e) => update('instructions', e.target.value)} /></Field></div>
          </div>
        </OpsCard>
        <div className="ops-stack">
          <OpsCard title="运营字段">
            <Field label="排序权重" hint="0-999，越大越靠前"><Input type="number" min={0} max={999} value={form.sortWeight} onChange={(e) => update('sortWeight', e.target.value)} /></Field>
            <div style={{ height: 10 }} />
            <Field label="素材来源" hint="有官方媒体时必须登记"><Select value={form.sourceLicense} onChange={(e) => update('sourceLicense', e.target.value)}><option value="">未登记</option><option value="self_owned">自有</option><option value="authorized">已授权</option><option value="public_domain">公共领域</option></Select></Field>
            <div style={{ height: 10 }} />
            <Field label="媒体 ID" hint="逗号分隔，最多 3 图 + 1 视频"><Input value={form.mediaIds} onChange={(e) => update('mediaIds', e.target.value)} /></Field>
          </OpsCard>
          {id && (
            <OpsCard title="影响评估">
              {impact ? (
                <>
                  <div className="ops-kv"><span>历史记录</span><b>{formatNumber(impact.records, 0)} 条</b></div>
                  <div className="ops-kv"><span>涉及用户</span><b>{formatNumber(impact.users, 0)} 人</b></div>
                  <div className="ops-kv"><span>PR 估算</span><b>{formatNumber(impact.prs, 0)} 个</b></div>
                  <div className="ops-note" style={{ margin: '9px 0' }}>{impact.note}</div>
                  {sensitive && (
                    <Field label="敏感字段生效策略">
                      <Select value={policy} onChange={(e) => setPolicy(e.target.value)}>
                        <option value="none">不追溯（推荐）</option>
                        <option value="recalculate">全量重算历史统计</option>
                      </Select>
                    </Field>
                  )}
                </>
              ) : <OpsLoading />}
            </OpsCard>
          )}
          {id && detail.data?.versions?.length > 0 && (
            <OpsCard title="最近版本">
              <div className="ops-timeline">
                {detail.data.versions.slice(0, 4).map((version: Dict) => (
                  <div className="ops-timeline-item" key={version.id}><span className="ops-timeline-dot" /><div><strong>v{version.version} · {version.changeType}</strong><span>{version.changedFields || '无字段变更'} · <OpsDateTime value={version.createdAt} /></span></div></div>
                ))}
              </div>
            </OpsCard>
          )}
        </div>
      </div>
    </div>
  );
}

export function OpsExerciseVersionsPage() {
  const { id } = useParams();
  const toast = useOpsToast();
  const detail = useAsync<any>(() => (id ? ops.get(`/exercises/${id}`) : Promise.resolve(null)), [id]);
  const rollback = async (version: number) => {
    if (!window.confirm(`确认回滚到 v${version}？当前版本会保留在历史中。`)) return;
    try {
      await ops.post(`/exercises/${id}/rollback/${version}`, { reason: `后台回滚到 v${version}` });
      toast('已回滚并生成新版本', 'success');
      detail.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : '回滚失败', 'error');
    }
  };
  return (
    <div>
      <OpsPageHead eyebrow="EXERCISE / VERSIONS" title={`版本历史 · ${detail.data?.name ?? ''}`} description="每次发布、回滚、归档与合并都会生成不可变版本。"
        actions={<><Link className="btn btn-outline btn-sm" to={`/exercises/${id}`}>返回编辑</Link><Link className="btn btn-primary btn-sm" to={`/exercises/${id}`}>保存新版本</Link></>} />
      {detail.loading && !detail.data ? <OpsLoading /> : (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>版本</th><th>变更类型</th><th>字段</th><th>策略</th><th>操作人</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              {(detail.data?.versions ?? []).map((version: Dict) => (
                <tr key={version.id}>
                  <td className="mono">v{version.version}</td>
                  <td><span className="ops-tag">{version.changeType}</span></td>
                  <td>{version.changedFields || '—'}</td>
                  <td>{version.effectivePolicy || '—'}</td>
                  <td>{version.createdBy || 'system'}</td>
                  <td><OpsDateTime value={version.createdAt} /></td>
                  <td><button type="button" className="ops-tag accent" onClick={() => void rollback(version.version)}>回滚到此版本</button></td>
                </tr>
              ))}
              {!detail.data?.versions?.length && <tr><td colSpan={7}><OpsEmpty title="暂无版本记录" description="保存一次动作后生成 v1。" /></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function OpsImportPage() {
  const toast = useOpsToast();
  const [csv, setCsv] = useState('name,aliases,primaryMuscle,equipment,type,description\n杠铃卧推,平板卧推,胸,杠铃,strength,肩胛收紧');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const doPreview = async () => {
    setLoading(true);
    try {
      setPreview(await ops.post<any>('/exercises/import/preview', { csv }));
    } catch (err) {
      toast(err instanceof Error ? err.message : '预览失败', 'error');
    } finally { setLoading(false); }
  };
  const confirm = async () => {
    if (!preview?.batchId) return;
    setLoading(true);
    try {
      const result = await ops.post<any>('/exercises/import/confirm', { batchId: preview.batchId });
      toast(`导入完成：成功 ${result.ok}，失败 ${result.failed}`, 'success');
      setPreview(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally { setLoading(false); }
  };
  return (
    <div>
      <OpsPageHead eyebrow="EXERCISE / IMPORT" title="批量导入" description="CSV 先预览再确认；同名称 + 同器械视为更新，非法枚举会被拦截。" actions={<Button variant="outline" size="sm" onClick={() => setCsv('')}>清空</Button>} />
      <div className="ops-grid-2">
        <OpsCard title="粘贴 CSV">
          <Field label="CSV 内容" hint="表头：name,aliases,primaryMuscle,equipment,type,description">
            <Textarea rows={16} value={csv} onChange={(e) => setCsv(e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 11 }} />
          </Field>
          <div className="ops-form-foot"><Button variant="primary" onClick={() => void doPreview()} disabled={loading}>{loading ? '检查中…' : '预览校验'}</Button></div>
        </OpsCard>
        <OpsCard title="预览结果" extra={preview && <span className="small muted">成功 {preview.ok} · 失败 {preview.failed}</span>}>
          {!preview ? <OpsEmpty title="等待预览" description="粘贴 CSV 后点击预览，不会直接写入数据库。" /> : (
            <>
              <div className="ops-table-wrap" style={{ maxHeight: 420 }}>
                <table className="ops-table">
                  <thead><tr><th>行</th><th>名称</th><th>动作</th><th>问题</th></tr></thead>
                  <tbody>{preview.rows.map((row: Dict) => <tr key={row.line}><td className="mono">{row.line}</td><td>{row.name || '—'}</td><td><span className={`ops-tag ${row.action === 'create' ? 'accent' : ''}`}>{row.action === 'create' ? '新建' : '更新'}</span></td><td>{row.errors?.length ? <span className="danger small">{row.errors.join('；')}</span> : <span className="muted">通过</span>}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="ops-form-foot"><Button variant="primary" onClick={() => void confirm()} disabled={loading || preview.ok === 0}>确认导入 {preview.ok} 条</Button></div>
            </>
          )}
        </OpsCard>
      </div>
    </div>
  );
}

export function OpsMergePage() {
  const toast = useOpsToast();
  const list = useAsync<any>(() => ops.get('/exercises?source=builtin&pageSize=200'), []);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [reason, setReason] = useState('');
  const [impact, setImpact] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!fromId) { setImpact(null); return; }
    ops.get(`/exercises/${fromId}/impact`).then(setImpact).catch(() => setImpact(null));
  }, [fromId]);
  const from = list.data?.items?.find((item: Dict) => item.id === fromId);
  const to = list.data?.items?.find((item: Dict) => item.id === toId);
  const merge = async () => {
    if (!fromId || !toId) return toast('请选择来源与目标动作', 'error');
    if (confirmName !== to?.name) return toast('请输入目标动作全名确认', 'error');
    setLoading(true);
    try {
      await ops.post('/exercises/merge', { fromId, toId, confirmName, reason });
      toast('合并完成，来源动作已重定向', 'success');
      setFromId(''); setToId(''); setConfirmName(''); setReason(''); setImpact(null); list.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '合并失败', 'error'); } finally { setLoading(false); }
  };
  return (
    <div>
      <OpsPageHead eyebrow="EXERCISE / MERGE" title="合并与归档" description="合并会把来源动作的访问与历史记录重定向到目标动作，不删除数据。只允许内置动作合并。" />
      <div className="ops-grid-2">
        <OpsCard title="选择动作">
          <div className="ops-form-grid">
            <Field label="来源动作（被合并）"><Select value={fromId} onChange={(e) => setFromId(e.target.value)}><option value="">请选择</option>{(list.data?.items ?? []).filter((item: Dict) => item.status === 'active').map((item: Dict) => <option key={item.id} value={item.id}>{item.name} · {item.equipment}</option>)}</Select></Field>
            <Field label="目标动作（保留）"><Select value={toId} onChange={(e) => setToId(e.target.value)}><option value="">请选择</option>{(list.data?.items ?? []).filter((item: Dict) => item.id !== fromId && item.status === 'active').map((item: Dict) => <option key={item.id} value={item.id}>{item.name} · {item.equipment}</option>)}</Select></Field>
          </div>
          <div className="ops-note" style={{ marginTop: 12 }}>合并后来源动作会出现在“已合并”列表，前台搜索会重定向到目标动作。</div>
        </OpsCard>
        <OpsCard title="影响与确认">
          {!from ? <OpsEmpty title="尚未选择来源动作" description="选择后显示历史记录与用户影响。" /> : (
            <>
              <div className="ops-kv"><span>来源动作</span><b>{from.name}</b></div>
              <div className="ops-kv"><span>历史记录</span><b>{impact?.records ?? '…'} 条</b></div>
              <div className="ops-kv"><span>涉及用户</span><b>{impact?.users ?? '…'} 人</b></div>
              <Field label={`输入目标动作名称「${to?.name ?? ''}」以确认`}><Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={to?.name ?? '请先选择目标'} /></Field>
              <div style={{ height: 10 }} />
              <Field label="合并原因"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：同义动作，规范名称" /></Field>
              <div className="ops-form-foot"><Button variant="primary" onClick={() => void merge()} disabled={loading}>{loading ? '合并中…' : '确认合并'}</Button></div>
            </>
          )}
        </OpsCard>
      </div>
    </div>
  );
}

export function OpsSearchQualityPage() {
  const toast = useOpsToast();
  const data = useAsync<any>(() => ops.get('/exercises/search-quality?days=7'), []);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Dict[]>([]);
  const [open, setOpen] = useState(false);
  const addAlias = async (target: Dict, keyword: string) => {
    try {
      const detail = await ops.get<any>(`/exercises/${target.id}`);
      const aliases = Array.from(new Set([...(detail.aliases ?? []), keyword])).slice(0, 10);
      await ops.patch(`/exercises/${target.id}`, { aliases, reason: `搜索无结果补充别名：${keyword}` });
      toast(`已把「${keyword}」加入 ${target.name} 的别名`, 'success');
      setOpen(false); data.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '添加别名失败', 'error'); }
  };
  const searchTerm = async (keyword: string) => {
    setTerm(keyword);
    setOpen(true);
    try {
      const res = await ops.get<any>(`/exercises?q=${encodeURIComponent(keyword)}&pageSize=10`);
      setResults(res.items ?? []);
    } catch (err) { toast(err instanceof Error ? err.message : '搜索失败', 'error'); }
  };
  return (
    <div>
      <OpsPageHead eyebrow="EXERCISE / SEARCH QUALITY" title="搜索质量" description="无结果搜索词与自建动作是动作库需求的主要信号。" />
      {data.loading && !data.data ? <OpsLoading /> : (
        <>
          <div className="ops-kpi-grid">
            <OpsKpi label="搜索总量" value={data.data?.totalSearches ?? 0} unit="次" hint={`近 7 天 · 从 ${data.data?.from ?? ''}`} />
            <OpsKpi label="无结果率" value={data.data?.noResultRate ?? 0} unit="%" tone={(data.data?.noResultRate ?? 0) > 30 ? 'danger' : 'accent'} hint="高于 30% 建议补充别名" />
            <OpsKpi label="无结果词" value={data.data?.noResultTerms?.length ?? 0} unit="个" hint="优先补充别名或新建动作" />
            <OpsKpi label="自建动作" value={data.data?.selfBuiltTop?.length ?? 0} unit="类" hint="候选内置化" />
          </div>
          <div className="ops-grid-2">
            <OpsCard title="无结果搜索词">
              <div className="ops-table-wrap" style={{ border: 0 }}>
                <table className="ops-table"><thead><tr><th>关键词</th><th>次数</th><th>操作</th></tr></thead><tbody>
                  {(data.data?.noResultTerms ?? []).map((item: Dict) => <tr key={item.keyword}><td className="name">{item.keyword}</td><td className="mono">{item.count}</td><td><button className="ops-tag accent" type="button" onClick={() => void searchTerm(item.keyword)}>补充别名</button></td></tr>)}
                  {!data.data?.noResultTerms?.length && <tr><td colSpan={3}><OpsEmpty title="暂无无结果搜索" description="有搜索埋点后这里会出现。" /></td></tr>}
                </tbody></table>
              </div>
            </OpsCard>
            <OpsCard title="自建动作候选">
              <div className="ops-table-wrap" style={{ border: 0 }}>
                <table className="ops-table"><thead><tr><th>名称</th><th>记录数</th></tr></thead><tbody>
                  {(data.data?.selfBuiltTop ?? []).map((item: Dict) => <tr key={item.name}><td>{item.name}</td><td className="mono">{item.count}</td></tr>)}
                  {!data.data?.selfBuiltTop?.length && <tr><td colSpan={2}><OpsEmpty title="暂无自建动作" description="用户创建动作后这里会出现。" /></td></tr>}
                </tbody></table>
              </div>
            </OpsCard>
          </div>
          <Modal open={open} onClose={() => setOpen(false)} title={`为「${term}」补充别名`} description="选择目标动作后，将关键词加入其别名，提升搜索命中。" width={620}>
            <div className="row" style={{ marginBottom: 10 }}><Input value={term} onChange={(e) => setTerm(e.target.value)} /><Button variant="primary" onClick={() => void searchTerm(term)}>搜索</Button></div>
            <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>动作</th><th>器械</th><th>操作</th></tr></thead><tbody>
              {results.map((item) => <tr key={item.id}><td>{item.name}<span className="ops-sub">{(item.aliases ?? []).join(' / ')}</span></td><td>{item.equipment}</td><td><button type="button" className="ops-tag accent" onClick={() => void addAlias(item, term)}>加入别名</button></td></tr>)}
              {!results.length && <tr><td colSpan={3}><OpsEmpty title="没有找到动作" description="可以先去新建动作。" /></td></tr>}
            </tbody></table></div>
          </Modal>
        </>
      )}
    </div>
  );
}

function split(value: string, separator = ',') {
  return value.split(separator).map((item) => item.trim()).filter(Boolean);
}
