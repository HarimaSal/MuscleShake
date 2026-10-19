import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArticleBlocks } from '../../src/components/ArticleBlocks';
import { Button, Field, Input, Modal, Select, Textarea } from '../../src/components/Ui';
import { useAsync } from '../../src/lib/hooks';
import { formatNumber } from '../../src/lib/format';
import { OpsCountdown, OpsDateTime, OpsEmpty, OpsLoading, OpsPageHead, OpsStatus } from './OpsUi';
import { ops } from './opsApi';
import { useOpsToast } from './OpsToast';

type Dict = Record<string, any>;

export function OpsReviewQueuePage() {
  const toast = useOpsToast();
  const queue = useAsync<any>(() => ops.get('/review/queue'), []);
  const rules = useAsync<any>(() => ops.get('/review/rules'), []);
  const [selected, setSelected] = useState<Dict | null>(null);
  const [detail, setDetail] = useState<Dict | null>(null);
  const [action, setAction] = useState('approve');
  const [reason, setReason] = useState('');
  const [ruleCodes, setRuleCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const open = async (item: Dict) => {
    setSelected(item);
    setDetail(null);
    setReason('');
    setAction('approve');
    setRuleCodes([]);
    try { setDetail(await ops.get(`/review/posts/${item.id}`)); } catch { setDetail(null); }
  };

  const submit = async () => {
    if (!selected) return;
    if (action !== 'approve' && reason.trim().length < 2) return toast('请填写处理理由', 'error');
    setLoading(true);
    try {
      await ops.post(`/review/posts/${selected.id}`, { action, reason, ruleCodes, note: reason });
      toast('审核动作已完成', 'success');
      setSelected(null); queue.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '审核失败', 'error'); } finally { setLoading(false); }
  };

  return (
    <div>
      <OpsPageHead eyebrow="REVIEW / QUEUE" title="审核队列" description="按提交时间与 SLA 排序。高风险与超时内容优先；所有处置需引用规则编号。" />
      <div className="ops-kpi-grid">
        <OpsKpiMini label="待审核" value={queue.data?.total ?? 0} hint="含超时项" />
        <OpsKpiMini label="举报" value={queue.data?.reports?.length ?? 0} hint="开放工单" />
        <OpsKpiMini label="申诉" value={queue.data?.appeals?.length ?? 0} hint="开放工单" />
        <OpsKpiMini label="SLA" value="24h" hint="首次响应目标" />
      </div>
      {queue.loading && !queue.data ? <OpsLoading /> : (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>内容</th><th>作者</th><th>提交时间</th><th>SLA</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {(queue.data?.items ?? []).map((item: Dict) => (
                <tr key={item.id}>
                  <td><button type="button" className="name" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer' }} onClick={() => void open(item)}>{item.title}</button><span className="ops-sub">{item.reviewStatus === 'quota_deferred' ? '名额顺延' : '公开投稿'}</span></td>
                  <td>{item.author}</td>
                  <td><OpsDateTime value={item.createdAt} /></td>
                  <td>{item.overdue ? <span className="ops-overdue">已超时</span> : <OpsCountdown minutes={item.remainingMinutes} />}</td>
                  <td><OpsStatus status={item.status} /></td>
                  <td><div className="actions"><button type="button" onClick={() => void open(item)}>审核 / 预览</button></div></td>
                </tr>
              ))}
              {!queue.data?.items?.length && <tr><td colSpan={6}><OpsEmpty title="队列已清空" description="当前没有待审核内容。" /></td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? '审核内容'} description={selected ? `${selected.author} · 提交于 ${selected.createdAt}` : ''} width={900}>
        <div style={{ maxHeight: '46vh', overflow: 'auto', paddingRight: 6 }}>
          {detail ? <ArticleBlocks blocks={detail.blocks ?? []} /> : <OpsLoading label="正在载入全文" />}
        </div>
        <div className="ops-divider" />
        <div className="ops-form-grid">
          <Field label="处置">
            <Select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="approve">通过</option>
              <option value="limit">限流（仅自己可见）</option>
              <option value="takedown">下架</option>
              <option value="account_action">账号处置 + 下架</option>
            </Select>
          </Field>
          <Field label="规则编号">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {(rules.data?.items ?? []).map((rule: Dict) => <button key={rule.code} type="button" className={`ops-tag ${ruleCodes.includes(rule.code) ? 'accent' : ''}`} onClick={() => setRuleCodes((list) => list.includes(rule.code) ? list.filter((code) => code !== rule.code) : [...list, rule.code])}>{rule.code}</button>)}
            </div>
          </Field>
          <div className="full"><Field label="理由 / 备注"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
        </div>
        <div className="ops-form-foot"><Button variant="primary" onClick={() => void submit()} disabled={loading}>{loading ? '提交中…' : '确认处置'}</Button></div>
      </Modal>
    </div>
  );
}

export function OpsReportsPage() {
  const toast = useOpsToast();
  const queue = useAsync<any>(() => ops.get('/review/queue'), []);
  const [tab, setTab] = useState<'reports' | 'appeals'>('reports');
  const [report, setReport] = useState<Dict | null>(null);
  const [result, setResult] = useState('dismiss');
  const [appeal, setAppeal] = useState<Dict | null>(null);
  const [approve, setApprove] = useState(true);
  const [resolution, setResolution] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReport = async () => {
    if (!report) return;
    setLoading(true);
    try {
      await ops.post(`/review/reports/${report.id}`, { result, reason: resolution });
      toast('举报工单已处理', 'success'); setReport(null); queue.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '处理失败', 'error'); } finally { setLoading(false); }
  };
  const handleAppeal = async () => {
    if (!appeal) return;
    if (!resolution.trim()) return toast('请填写复核结论', 'error');
    setLoading(true);
    try {
      await ops.post(`/review/appeals/${appeal.id}`, { approve, resolution });
      toast('申诉已复核', 'success'); setAppeal(null); queue.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '复核失败', 'error'); } finally { setLoading(false); }
  };

  return (
    <div>
      <OpsPageHead eyebrow="REVIEW / REPORTS & APPEALS" title="举报与申诉" description="举报与申诉共用工单队列；申诉通过后记录误判，不计入作者违规。" />
      <div className="ops-seg" style={{ marginBottom: 14 }}>
        <button type="button" className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>举报 ({queue.data?.reports?.length ?? 0})</button>
        <button type="button" className={tab === 'appeals' ? 'active' : ''} onClick={() => setTab('appeals')}>申诉 ({queue.data?.appeals?.length ?? 0})</button>
      </div>
      {queue.loading && !queue.data ? <OpsLoading /> : tab === 'reports' ? (
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>内容</th><th>原因</th><th>举报人</th><th>时间</th><th>操作</th></tr></thead><tbody>
          {(queue.data?.reports ?? []).map((item: Dict) => <tr key={item.id}><td className="name">{item.postTitle}</td><td>{item.reason}<span className="ops-sub">{item.detail}</span></td><td>{item.reporter ?? '游客'}</td><td><OpsDateTime value={item.createdAt} /></td><td><button type="button" className="ops-tag accent" onClick={() => { setReport(item); setResult('dismiss'); setResolution(''); }}>处理</button></td></tr>)}
          {!queue.data?.reports?.length && <tr><td colSpan={5}><OpsEmpty title="暂无举报" description="用户举报后会出现在这里。" /></td></tr>}
        </tbody></table></div>
      ) : (
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>内容</th><th>申诉理由</th><th>用户</th><th>时间</th><th>操作</th></tr></thead><tbody>
          {(queue.data?.appeals ?? []).map((item: Dict) => <tr key={item.id}><td className="name">{item.postTitle}</td><td>{item.reason}</td><td className="mono">{String(item.userId).slice(0, 12)}</td><td><OpsDateTime value={item.createdAt} /></td><td><button type="button" className="ops-tag accent" onClick={() => { setAppeal(item); setApprove(true); setResolution(''); }}>复核</button></td></tr>)}
          {!queue.data?.appeals?.length && <tr><td colSpan={5}><OpsEmpty title="暂无申诉" description="用户申诉后会出现在这里。" /></td></tr>}
        </tbody></table></div>
      )}
      <Modal open={!!report} onClose={() => setReport(null)} title="处理举报" description={report?.postTitle} width={560}>
        <Field label="处理结果"><Select value={result} onChange={(e) => setResult(e.target.value)}><option value="dismiss">驳回举报</option><option value="warn">警告作者</option><option value="takedown">下架内容</option></Select></Field>
        <div style={{ height: 10 }} /><Field label="处理说明"><Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
        <div className="ops-form-foot"><Button variant="primary" onClick={() => void handleReport()} disabled={loading}>确认</Button></div>
      </Modal>
      <Modal open={!!appeal} onClose={() => setAppeal(null)} title="复核申诉" description={appeal?.postTitle} width={560}>
        <Field label="复核结论"><Select value={approve ? 'approve' : 'reject'} onChange={(e) => setApprove(e.target.value === 'approve')}><option value="approve">申诉成立，恢复内容</option><option value="reject">申诉不成立</option></Select></Field>
        <div style={{ height: 10 }} /><Field label="复核说明"><Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
        <div className="ops-form-foot"><Button variant="primary" onClick={() => void handleAppeal()} disabled={loading}>提交</Button></div>
      </Modal>
    </div>
  );
}

export function OpsRulesPage() {
  const toast = useOpsToast();
  const list = useAsync<any>(() => ops.get('/review/rules'), []);
  const [editing, setEditing] = useState<Dict | null>(null);
  const [form, setForm] = useState({ title: '', level: 'limit', description: '', active: true });
  const edit = (rule: Dict) => {
    setEditing(rule);
    setForm({ title: rule.title, level: rule.level, description: rule.description ?? '', active: rule.active });
  };
  const save = async () => {
    if (!editing) return;
    try { await ops.put(`/review/rules/${editing.code}`, form); toast('规则已更新', 'success'); setEditing(null); list.reload(); }
    catch (err) { toast(err instanceof Error ? err.message : '更新失败', 'error'); }
  };
  return (
    <div>
      <OpsPageHead eyebrow="REVIEW / RULES" title="规则库" description="规则变更需由运营维护；下架与禁发动作必须引用规则编号。" />
      {list.loading && !list.data ? <OpsLoading /> : (
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>编号</th><th>名称</th><th>处置等级</th><th>说明</th><th>状态</th><th>版本</th><th>操作</th></tr></thead><tbody>
          {(list.data?.items ?? []).map((rule: Dict) => <tr key={rule.code}><td className="mono">{rule.code}</td><td className="name">{rule.title}</td><td><span className="ops-tag warn">{rule.level}</span></td><td>{rule.description}</td><td>{rule.active ? <span className="ops-status ops-status-active">启用</span> : <span className="ops-status">停用</span>}</td><td className="mono">v{rule.version}</td><td><button type="button" className="ops-tag accent" onClick={() => edit(rule)}>编辑</button></td></tr>)}
          {!list.data?.items?.length && <tr><td colSpan={7}><OpsEmpty title="暂无规则" description="初始化审核规则库后显示。" /></td></tr>}
        </tbody></table></div>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`编辑规则 ${editing?.code ?? ''}`} width={560}>
        <Field label="规则名称"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <div style={{ height: 10 }} /><Field label="处置等级"><Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}><option value="limit">限流</option><option value="takedown">下架</option><option value="account">账号处置</option></Select></Field>
        <div style={{ height: 10 }} /><Field label="说明"><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <label className="ops-checkbox" style={{ marginTop: 10 }}><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />启用该规则</label>
        <div className="ops-form-foot"><Button variant="primary" onClick={() => void save()}>保存</Button></div>
      </Modal>
    </div>
  );
}

export function OpsSpotcheckPage() {
  const toast = useOpsToast();
  const list = useAsync<any>(() => ops.get('/official/spotcheck'), []);
  const [selected, setSelected] = useState<Dict | null>(null);
  const [result, setResult] = useState('pass');
  const [note, setNote] = useState('');
  const submit = async () => {
    if (!selected) return;
    try { await ops.post(`/official/spotcheck/${selected.id}`, { result, note }); toast('抽查结论已记录', 'success'); setSelected(null); list.reload(); }
    catch (err) { toast(err instanceof Error ? err.message : '提交失败', 'error'); }
  };
  return (
    <div>
      <OpsPageHead eyebrow="REVIEW / SPOTCHECK" title="抽查工作台" description={`单人复核内容按 ${list.data?.rate ?? 20}% 比例进入抽查池；发现问题可退回修改或下线。`} />
      {list.loading && !list.data ? <OpsLoading /> : (
        <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>内容</th><th>类型</th><th>发布</th><th>状态</th><th>操作</th></tr></thead><tbody>
          {(list.data?.items ?? []).map((item: Dict) => <tr key={item.id}><td className="name">{item.title}</td><td><span className="ops-tag">{item.type}</span></td><td><OpsDateTime value={item.publishedAt} /></td><td><OpsStatus status={item.status} /></td><td><button type="button" className="ops-tag accent" onClick={() => { setSelected(item); setResult('pass'); setNote(''); }}>抽查</button></td></tr>)}
          {!list.data?.items?.length && <tr><td colSpan={5}><OpsEmpty title="抽查池为空" description="所有单人复核内容均已抽查。" /></td></tr>}
        </tbody></table></div>
      )}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={`抽查 · ${selected?.title ?? ''}`} width={560}>
        <Field label="抽查结论"><Select value={result} onChange={(e) => setResult(e.target.value)}><option value="pass">通过</option><option value="revise">退回修改</option><option value="offline">下线</option></Select></Field>
        <div style={{ height: 10 }} /><Field label="备注"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="ops-form-foot"><Button variant="primary" onClick={() => void submit()}>提交结论</Button></div>
      </Modal>
    </div>
  );
}

function OpsKpiMini({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return <div className="ops-kpi"><span className="ops-kpi-label">{label}</span><strong>{value}</strong><span className="ops-kpi-hint">{hint}</span></div>;
}
