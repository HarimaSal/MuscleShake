import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArticleBlocks } from '../../src/components/ArticleBlocks';
import { Button, Field, Input, Modal, Select, Textarea } from '../../src/components/Ui';
import { useAsync } from '../../src/lib/hooks';
import { formatNumber } from '../../src/lib/format';
import { OpsCard, OpsDateTime, OpsEmpty, OpsLoading, OpsPageHead, OpsStatus } from './OpsUi';
import { ops } from './opsApi';
import { useOpsToast } from './OpsToast';

type Dict = Record<string, any>;
const TYPE_LABEL: Record<string, string> = { announcement: '公告', article: '官方文章', help: '帮助页', banner: '横幅' };
const CHECKLIST = [
  '标题与摘要已核对，无错别字',
  '正文块完整，无空白占位',
  '图片/视频已登记来源与授权',
  '不含个人隐私、手机号与外部导流',
  '嵌入卡引用对象仍然有效',
  '封面比例与裁切已确认',
  '发布/下线时间符合运营排期',
  '官方媒体预算余量充足',
];

export function OpsContentsPage() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? '';
  const [status, setStatus] = useState('');
  const list = useAsync<any>(() => ops.get(`/official/contents?type=${type}&status=${status}&pageSize=50`), [type, status]);
  return (
    <div>
      <OpsPageHead eyebrow="OFFICIAL CONTENT" title="官方内容" description="公告、官方文章与帮助页共用前台块渲染；发布前必须完成单人复核清单。"
        actions={<Link className="btn btn-primary btn-sm" to={`/official/new${type ? `?type=${type}` : ''}`}>新建内容</Link>} />
      <div className="ops-toolbar">
        <div className="ops-seg">
          {[{ key: '', label: '全部' }, ...Object.entries(TYPE_LABEL).map(([key, label]) => ({ key, label }))].map((item) => (
            <button type="button" key={item.key} className={type === item.key ? 'active' : ''} onClick={() => setParams(item.key ? { type: item.key } : {})}>{item.label}</button>
          ))}
        </div>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="状态筛选">
          <option value="">全部状态</option><option value="draft">草稿</option><option value="scheduled">已排期</option><option value="published">已发布</option><option value="offline">已下线</option><option value="needs_revision">需修改</option>
        </select>
        <span className="small muted" style={{ marginLeft: 'auto' }}>{list.data?.total ?? 0} 条</span>
      </div>
      {list.loading && !list.data ? <OpsLoading /> : (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>标题</th><th>类型</th><th>状态</th><th>阅读</th><th>发布 / 更新</th><th>操作</th></tr></thead>
            <tbody>
              {(list.data?.items ?? []).map((item: Dict) => (
                <tr key={item.id}>
                  <td><Link className="name" to={`/official/${item.id}`}>{item.title}</Link><span className="ops-sub">{item.summary || '暂无摘要'}</span></td>
                  <td><span className="ops-tag">{TYPE_LABEL[item.type] ?? item.type}</span></td>
                  <td><OpsStatus status={item.status} /><span className="ops-sub">{item.singleReview ? '单人复核' : '双人复核'}</span></td>
                  <td className="mono">{formatNumber(item.views ?? 0, 0)}</td>
                  <td><OpsDateTime value={item.publishedAt ?? item.updatedAt} /></td>
                  <td><div className="actions"><Link to={`/official/${item.id}`}>编辑</Link><Link to={`/official/${item.id}?preview=1`}>预览</Link></div></td>
                </tr>
              ))}
              {!list.data?.items?.length && <tr><td colSpan={6}><OpsEmpty title="暂无官方内容" description="创建第一篇公告或官方文章。" /></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function OpsContentEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useOpsToast();
  const detail = useAsync<any>(() => (id ? ops.get(`/official/contents/${id}`) : Promise.resolve(null)), [id]);
  const reviewMode = useAsync<any>(() => ops.get('/configs/official_review_mode'), []);
  const [title, setTitle] = useState('');
  const [type, setType] = useState(params.get('type') ?? 'announcement');
  const [summary, setSummary] = useState('');
  const [blocksText, setBlocksText] = useState(defaultBlocks());
  const [publishAt, setPublishAt] = useState('');
  const [offlineAt, setOfflineAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [checklist, setChecklist] = useState<boolean[]>(Array(8).fill(false));
  const [checklistAt, setChecklistAt] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [reviewerId, setReviewerId] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(params.get('preview') === '1');

  useEffect(() => {
    if (!detail.data) return;
    setTitle(detail.data.title ?? '');
    setType(detail.data.type ?? 'announcement');
    setSummary(detail.data.summary ?? '');
    setPublishAt(toLocalInput(detail.data.publishAt));
    setOfflineAt(toLocalInput(detail.data.offlineAt));
    try {
      setBlocksText(JSON.stringify(detail.data.blocks ?? [], null, 2));
    } catch {
      setBlocksText(defaultBlocks());
    }
    if (detail.data.checklist?.length === 8) setChecklist(detail.data.checklist);
  }, [detail.data]);

  useEffect(() => {
    if (!checklistAt) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - checklistAt) / 1000);
      setCooldown(Math.max(0, 10 - elapsed));
    }, 250);
    return () => window.clearInterval(timer);
  }, [checklistAt]);

  const parsedBlocks = useMemo(() => {
    try {
      const value = JSON.parse(blocksText);
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }, [blocksText]);
  const mode = reviewMode.data?.value ?? 'single';

  const payload = () => ({
    title, type, summary, blocks: parsedBlocks,
    publishAt: publishAt ? new Date(publishAt).toISOString() : '',
    offlineAt: offlineAt ? new Date(offlineAt).toISOString() : '',
  });

  const save = async () => {
    if (!title.trim()) return toast('请填写标题', 'error');
    if (!parsedBlocks.length) return toast('正文至少需要一个块', 'error');
    setSaving(true);
    try {
      const result = id ? await ops.patch<any>(`/official/contents/${id}`, payload()) : await ops.post<any>('/official/contents', payload());
      toast(id ? '草稿已保存' : '官方内容已创建', 'success');
      if (!id && result.id) navigate(`/official/${result.id}`);
      else detail.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '保存失败', 'error'); } finally { setSaving(false); }
  };

  const toggleCheck = (index: number) => {
    setChecklist((list) => {
      const next = [...list];
      next[index] = !next[index];
      if (next[index] && !checklistAt) setChecklistAt(Date.now());
      return next;
    });
  };

  const publish = async () => {
    if (!id) return toast('请先保存草稿', 'error');
    if (checklist.some((checked) => !checked)) return toast('请完成 8 项发布检查', 'error');
    if (cooldown > 0) return toast(`检查清单需保持 ${cooldown} 秒后再发布`, 'error');
    if (mode === 'dual' && !reviewerId.trim()) return toast('双人复核模式需要填写复核人 ID', 'error');
    setPublishing(true);
    try {
      await ops.post<any>(`/official/contents/${id}/publish`, { checklist, cooldownConfirmed: true, reviewerId, publishAt: payload().publishAt, offlineAt: payload().offlineAt });
      toast('发布成功', 'success');
      detail.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '发布失败', 'error'); } finally { setPublishing(false); }
  };

  const offline = async () => {
    if (!id || !window.confirm('确认下线该内容？公开页会立即不可见。')) return;
    try { await ops.post(`/official/contents/${id}/offline`, { reason: '后台手动下线' }); toast('已下线', 'success'); detail.reload(); }
    catch (err) { toast(err instanceof Error ? err.message : '下线失败', 'error'); }
  };

  if (id && detail.loading && !detail.data) return <OpsLoading />;

  return (
    <div>
      <OpsPageHead eyebrow={id ? 'OFFICIAL CONTENT / EDIT' : 'OFFICIAL CONTENT / NEW'}
        title={id ? '编辑官方内容' : '新建官方内容'}
        description="复用前台块渲染；发布后进入公开页与分享卡。编辑已发布内容会保留线上旧版并转入草稿。"
        actions={<><Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>预览</Button>{detail.data?.status === 'published' && <Button variant="danger" size="sm" onClick={() => void offline()}>下线</Button>}<Button variant="primary" size="sm" onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : '保存草稿'}</Button></>} />
      {detail.data?.hasDraft && <div className="ops-note warn" style={{ marginBottom: 12 }}>当前正在编辑草稿：线上仍展示已发布旧版（{detail.data?.publishedTitle}），发布后才会替换。</div>}
      <div className="ops-grid-2">
        <div className="ops-stack">
          <OpsCard title="内容信息">
            <div className="ops-form-grid">
              <div className="full"><Field label="标题"><Input value={title} maxLength={type === 'banner' ? 60 : 100} onChange={(e) => setTitle(e.target.value)} /></Field></div>
              <Field label="类型"><Select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
              <Field label="摘要"><Input value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={300} /></Field>
              <Field label="发布时间（可选）"><Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} /></Field>
              <Field label="下线时间（可选）"><Input type="datetime-local" value={offlineAt} onChange={(e) => setOfflineAt(e.target.value)} /></Field>
            </div>
          </OpsCard>
          <OpsCard title="正文块 JSON" extra={<span className="small muted">支持 paragraph / heading / image / gallery / video / quote / list / todo / divider / embed</span>}>
            <Textarea rows={20} value={blocksText} onChange={(e) => setBlocksText(e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 11 }} />
            {!parsedBlocks.length && <div className="ops-note warn" style={{ marginTop: 8 }}>JSON 解析失败或块为空，发布前会被拦截。</div>}
          </OpsCard>
        </div>
        <div className="ops-stack">
          <OpsCard title="发布前复核" extra={<span className="ops-tag">{mode === 'dual' ? '双人复核' : '单人复核'}</span>}>
            <div className="ops-note" style={{ marginBottom: 10 }}>完成 8 项检查并等待 10 秒冷却后才能发布。发布后进入抽查池。</div>
            <div className="ops-checkbox-list">
              {CHECKLIST.map((label, index) => (
                <label key={label} className={`ops-checkbox ${checklist[index] ? 'checked' : ''}`}>
                  <input type="checkbox" checked={checklist[index]} onChange={() => toggleCheck(index)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {mode === 'dual' && <><div style={{ height: 10 }} /><Field label="复核人 ID"><Input value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} placeholder="另一名后台账号 ID" /></Field></>}
            {checklistAt && <div className="ops-kv" style={{ marginTop: 8 }}><span>冷却</span><b>{cooldown > 0 ? `${cooldown}s` : '已完成'}</b></div>}
            <div className="ops-form-foot"><Button variant="primary" onClick={() => void publish()} disabled={publishing || !id}>{publishing ? '发布中…' : id ? '确认发布' : '保存草稿后可发布'}</Button></div>
          </OpsCard>
          <OpsCard title="状态与统计">
            <div className="ops-kv"><span>当前状态</span><b><OpsStatus status={detail.data?.status ?? 'draft'} /></b></div>
            <div className="ops-kv"><span>阅读量</span><b>{formatNumber(detail.data?.stats?.views ?? 0, 0)}</b></div>
            <div className="ops-kv"><span>曝光</span><b>{formatNumber(detail.data?.stats?.exposures ?? 0, 0)}</b></div>
            <div className="ops-kv"><span>模板使用</span><b>{formatNumber(detail.data?.stats?.templateUses ?? 0, 0)}</b></div>
            {detail.data?.postId && <a className="btn btn-outline btn-sm" style={{ marginTop: 12 }} href={`/p/${detail.data.postId}`} target="_blank" rel="noreferrer">打开公开页</a>}
          </OpsCard>
        </div>
      </div>
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={title || '内容预览'} description="使用前台文章块渲染" width={780}>
        {parsedBlocks.length ? <ArticleBlocks blocks={parsedBlocks} /> : <OpsEmpty title="暂无可预览内容" description="先填写合法的正文块 JSON。" />}
      </Modal>
    </div>
  );
}

export function OpsTemplatesPage() {
  const toast = useOpsToast();
  const list = useAsync<any>(() => ops.get('/official/templates'), []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('strength');
  const [items, setItems] = useState('[{"exerciseId":"","sets":3,"reps":10}]');
  const [editing, setEditing] = useState<Dict | null>(null);
  const save = async () => {
    try {
      const body = { name, type, items: JSON.parse(items) };
      await ops[editing ? 'put' : 'post'](`/official/templates${editing ? `/${editing.id}` : ''}`, body);
      toast('官方模板已保存', 'success'); setOpen(false); setEditing(null); setName(''); list.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '保存失败', 'error'); }
  };
  return (
    <div>
      <OpsPageHead eyebrow="OFFICIAL / TEMPLATES" title="训练模板" description="官方模板由运营维护，前台用户可直接开始训练。"
        actions={<Button variant="primary" size="sm" onClick={() => { setEditing(null); setName(''); setOpen(true); }}>新建模板</Button>} />
      {list.loading && !list.data ? <OpsLoading /> : (
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>模板</th><th>类型</th><th>版本</th><th>更新时间</th><th>操作</th></tr></thead><tbody>
          {(list.data?.items ?? []).map((item: Dict) => <tr key={item.id}><td className="name">{item.name}</td><td><span className="ops-tag">{item.type}</span></td><td className="mono">v{item.version}</td><td><OpsDateTime value={item.updatedAt} /></td><td><button type="button" className="ops-tag accent" onClick={() => { setEditing(item); setName(item.name); setType(item.type); setItems(item.payload || '[]'); setOpen(true); }}>编辑</button></td></tr>)}
          {!list.data?.items?.length && <tr><td colSpan={5}><OpsEmpty title="暂无官方模板" description="创建第一个训练模板。" /></td></tr>}
        </tbody></table></div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? '编辑模板' : '新建模板'} width={620}>
        <Field label="模板名称"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div style={{ height: 10 }} /><Field label="类型"><Select value={type} onChange={(e) => setType(e.target.value)}><option value="strength">力量</option><option value="cardio">有氧</option><option value="stretch">拉伸</option></Select></Field>
        <div style={{ height: 10 }} /><Field label="动作项 JSON" hint='格式：[{"exerciseId":"...","sets":3,"reps":10}]'><Textarea rows={6} value={items} onChange={(e) => setItems(e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 11 }} /></Field>
        <div className="ops-form-foot"><Button variant="primary" onClick={() => void save()}>保存</Button></div>
      </Modal>
    </div>
  );
}

export function OpsHelpPages() {
  const list = useAsync<any>(() => ops.get('/official/contents?type=help&pageSize=50'), []);
  return (
    <div>
      <OpsPageHead eyebrow="OFFICIAL / HELP" title="帮助页与 FAQ" description="帮助页使用同一套内容块与复核流程。" actions={<Link className="btn btn-primary btn-sm" to="/official/new?type=help">新建帮助页</Link>} />
      {list.loading && !list.data ? <OpsLoading /> : (
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>标题</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>
          {(list.data?.items ?? []).map((item: Dict) => <tr key={item.id}><td><Link className="name" to={`/official/${item.id}`}>{item.title}</Link></td><td><OpsStatus status={item.status} /></td><td><OpsDateTime value={item.updatedAt} /></td><td><Link to={`/official/${item.id}`}>编辑</Link></td></tr>)}
          {!list.data?.items?.length && <tr><td colSpan={4}><OpsEmpty title="暂无帮助页" description="创建常见问题与使用说明。" /></td></tr>}
        </tbody></table></div>
      )}
    </div>
  );
}

export function OpsBannersPage() {
  const list = useAsync<any>(() => ops.get('/official/contents?type=banner&pageSize=50'), []);
  return (
    <div>
      <OpsPageHead eyebrow="OFFICIAL / BANNERS" title="横幅公告" description="同一时间仅 1 条横幅，7 天内最多发布 2 次；标题不超过 60 字。" actions={<Link className="btn btn-primary btn-sm" to="/official/new?type=banner">新建横幅</Link>} />
      {list.loading && !list.data ? <OpsLoading /> : (
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>标题</th><th>状态</th><th>上线</th><th>下线</th><th>操作</th></tr></thead><tbody>
          {(list.data?.items ?? []).map((item: Dict) => <tr key={item.id}><td><Link className="name" to={`/official/${item.id}`}>{item.title}</Link></td><td><OpsStatus status={item.status} /></td><td><OpsDateTime value={item.publishAt} /></td><td><OpsDateTime value={item.offlineAt} /></td><td><Link to={`/official/${item.id}`}>编辑 / 下线</Link></td></tr>)}
          {!list.data?.items?.length && <tr><td colSpan={5}><OpsEmpty title="当前没有横幅" description="新建横幅并设置下线时间。" /></td></tr>}
        </tbody></table></div>
      )}
    </div>
  );
}

function defaultBlocks() {
  return JSON.stringify([{ id: 'p1', type: 'paragraph', version: 1, props: { text: '' } }], null, 2);
}

function toLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
