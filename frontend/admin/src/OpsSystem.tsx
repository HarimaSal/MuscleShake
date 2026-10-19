import { useState } from 'react';
import { Button, Field, Input, Modal, Select } from '../../src/components/Ui';
import { useAsync } from '../../src/lib/hooks';
import { OpsCard, OpsDateTime, OpsEmpty, OpsLoading, OpsPageHead, OpsStatus } from './OpsUi';
import { ops } from './opsApi';
import { useOpsToast } from './OpsToast';

type Dict = Record<string, any>;

export function OpsSystemPage() {
  const toast = useOpsToast();
  const [tab, setTab] = useState<'accounts' | 'audit' | 'recovery' | 'permission'>('accounts');
  const accounts = useAsync<any>(() => ops.get('/system/accounts'), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', role: 'operator' });
  const [createdCodes, setCreatedCodes] = useState<string[] | null>(null);
  const [createdTotp, setCreatedTotp] = useState('');
  const [resetTarget, setResetTarget] = useState<Dict | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [auditFilter, setAuditFilter] = useState({ action: '', from: '', to: '' });
  const audit = useAsync<any>(() => ops.get(`/audit?action=${encodeURIComponent(auditFilter.action)}&from=${auditFilter.from}&to=${auditFilter.to}&pageSize=100`), [auditFilter]);
  const recovery = useAsync<any>(() => (tab === 'recovery' ? ops.get('/system/recovery') : Promise.resolve(null)), [tab]);

  const create = async () => {
    try {
      const res = await ops.post<any>('/system/accounts', form);
      setCreateOpen(false); setForm({ username: '', password: '', role: 'operator' });
      setCreatedCodes(res.recoveryCodes ?? []); setCreatedTotp(res.totpSecret ?? ''); toast('后台账号已创建', 'success'); accounts.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '创建失败', 'error'); }
  };
  const disable = async (item: Dict) => {
    if (!window.confirm(`停用后台账号 ${item.username}？其会话会立即失效。`)) return;
    try { await ops.post(`/system/accounts/${item.id}/disable`); toast('账号已停用', 'success'); accounts.reload(); }
    catch (err) { toast(err instanceof Error ? err.message : '操作失败', 'error'); }
  };
  const reset = async () => {
    if (!resetTarget) return;
    try { await ops.post(`/system/accounts/${resetTarget.id}/reset`, { password: newPassword }); toast('密码已重置并踢下线', 'success'); setResetTarget(null); setNewPassword(''); }
    catch (err) { toast(err instanceof Error ? err.message : '重置失败', 'error'); }
  };
  const rotate = async () => {
    if (!window.confirm('重新生成 10 个恢复码？旧恢复码立即失效。')) return;
    try { const res = await ops.post<any>('/system/recovery/rotate'); recovery.reload(); setCreatedCodes(res.codes ?? []); toast('恢复码已更新，请离线保存', 'success'); }
    catch (err) { toast(err instanceof Error ? err.message : '生成失败', 'error'); }
  };
  const exportAudit = () => {
    const rows = audit.data?.items ?? [];
    const csv = ['时间,操作人,动作,对象类型,对象ID,理由', ...rows.map((r: Dict) => [r.createdAt, r.actorId ?? '', r.action, r.targetType, r.targetId, String(r.reason ?? '').replaceAll(',', ' ')].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `fitlog-ops-audit-${Date.now()}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <OpsPageHead eyebrow="SYSTEM / GOVERNANCE" title="系统与审计" description="后台账号、恢复码、权限复核与操作审计。仅超级管理员可管理账号。" />
      <div className="ops-seg" style={{ marginBottom: 14 }}>
        {[{ key: 'accounts', label: '后台账号' }, { key: 'audit', label: '审计日志' }, { key: 'recovery', label: '恢复码' }, { key: 'permission', label: '权限复核' }].map((item) => <button key={item.key} type="button" className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key as any)}>{item.label}</button>)}
      </div>

      {tab === 'accounts' && (accounts.loading && !accounts.data ? <OpsLoading /> : (
        <>
          <div className="ops-toolbar"><span className="small muted">{accounts.data?.items?.length ?? 0} 个后台账号</span><Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>新建后台账号</Button></div>
          <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>账号</th><th>角色</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead><tbody>
            {(accounts.data?.items ?? []).map((item: Dict) => <tr key={item.id}><td className="name">{item.username}<span className="ops-sub mono">{item.id.slice(0, 12)}</span></td><td><span className="ops-tag">{roleLabel(item.role)}</span></td><td><OpsStatus status={item.status} /></td><td><OpsDateTime value={item.lastLoginAt} /></td><td><div className="actions"><button type="button" onClick={() => { setResetTarget(item); setNewPassword(''); }}>重置密码</button>{item.status === 'active' && <button type="button" className="danger" onClick={() => void disable(item)}>停用</button>}</div></td></tr>)}
          </tbody></table></div>
        </>
      ))}

      {tab === 'audit' && (
        <>
          <div className="ops-toolbar">
            <input className="input" placeholder="动作包含…" value={auditFilter.action} onChange={(e) => setAuditFilter((f) => ({ ...f, action: e.target.value }))} />
            <input className="input" type="date" value={auditFilter.from} onChange={(e) => setAuditFilter((f) => ({ ...f, from: e.target.value }))} />
            <input className="input" type="date" value={auditFilter.to} onChange={(e) => setAuditFilter((f) => ({ ...f, to: e.target.value }))} />
            <Button size="sm" variant="outline" onClick={exportAudit}>导出 CSV</Button>
          </div>
          {audit.loading && !audit.data ? <OpsLoading /> : <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>理由</th><th>IP</th></tr></thead><tbody>
            {(audit.data?.items ?? []).map((item: Dict) => <tr key={item.id}><td><OpsDateTime value={item.createdAt} /></td><td className="mono">{item.actorId ?? 'system'}</td><td><span className="ops-tag">{item.action}</span></td><td className="mono">{item.targetType}:{String(item.targetId ?? '').slice(0, 12)}</td><td>{item.reason ?? '—'}</td><td className="mono">{item.ip ?? '—'}</td></tr>)}
            {!audit.data?.items?.length && <tr><td colSpan={6}><OpsEmpty title="暂无审计记录" description="所有后台写操作都会记录。" /></td></tr>}
          </tbody></table></div>}
        </>
      )}

      {tab === 'recovery' && (recovery.loading && !recovery.data ? <OpsLoading /> : (
        <div className="ops-grid-2">
          <OpsCard title="一次性恢复码" extra={<Button size="sm" variant="outline" onClick={() => void rotate()}>重新生成</Button>}>
            <div className="ops-note warn" style={{ marginBottom: 10 }}>恢复码只在丢失密码与 TOTP 时使用，使用一次即失效。请离线保存，不要截图发群。</div>
            <div className="ops-code-list">{(recovery.data?.codes ?? []).map((code: string) => <code key={code}>{code}</code>)}</div>
            {!recovery.data?.codes?.length && <OpsEmpty title="没有可用恢复码" description="点击重新生成 10 个。" />}
          </OpsCard>
          <OpsCard title="安全建议">
            <div className="ops-kv"><span>密码周期</span><b>90 天复核</b></div>
            <div className="ops-kv"><span>TOTP</span><b>必填</b></div>
            <div className="ops-kv"><span>登录锁定</span><b>5 次失败 / 30 分钟</b></div>
            <div className="ops-note" style={{ marginTop: 10 }}>恢复码泄露后立即重新生成；所有生成与使用都会进入审计日志。</div>
          </OpsCard>
        </div>
      ))}

      {tab === 'permission' && (accounts.loading && !accounts.data ? <OpsLoading /> : (
        <OpsCard title="90 天权限复核" extra={<span className={`ops-tag ${accounts.data?.reviewDue ? 'warn' : 'accent'}`}>{accounts.data?.reviewDue ? '需要复核' : '正常'}</span>}>
          <div className="ops-note" style={{ marginBottom: 10 }}>超过 90 天未登录的账号会被标记；需确认是否仍需要后台权限。</div>
          <div className="ops-table-wrap" style={{ border: 0 }}><table className="ops-table"><thead><tr><th>账号</th><th>角色</th><th>状态</th><th>距上次登录</th></tr></thead><tbody>
            {(accounts.data?.items ?? []).map((item: Dict) => <tr key={item.id}><td>{item.username}</td><td>{roleLabel(item.role)}</td><td><OpsStatus status={item.status} /></td><td className={Number(item.daysSinceLogin) >= 90 ? 'ops-overdue' : ''}>{item.daysSinceLogin >= 999 ? '从未登录' : `${item.daysSinceLogin} 天`}</td></tr>)}
          </tbody></table></div>
        </OpsCard>
      ))}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="新建后台账号" width={560}>
        <Field label="账号"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
        <div style={{ height: 10 }} /><Field label="初始密码" hint="至少 12 位"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <div style={{ height: 10 }} /><Field label="角色"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="operator">运营</option><option value="reviewer">审核员</option><option value="viewer">只读观察</option><option value="super_admin">超级管理员</option></Select></Field>
        <div className="ops-form-foot"><Button variant="primary" onClick={() => void create()}>创建账号</Button></div>
      </Modal>

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`重置密码 · ${resetTarget?.username ?? ''}`} width={520}>
        <Field label="新密码" hint="至少 12 位；重置后所有会话立即失效"><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
        <div className="ops-form-foot"><Button variant="primary" onClick={() => void reset()}>确认重置</Button></div>
      </Modal>

      <Modal open={!!createdCodes} onClose={() => setCreatedCodes(null)} title="请立即保存恢复码与 TOTP 密钥" description="关闭后不再完整显示；TOTP 密钥只在此处展示一次" width={560}>
        {createdTotp && <div className="ops-note" style={{ marginBottom: 10 }}>TOTP 密钥：<code>{createdTotp}</code>（在认证器 App 中手动添加）</div>}
        <div className="ops-code-list">{(createdCodes ?? []).map((code) => <code key={code}>{code}</code>)}</div>
        <div className="ops-form-foot"><Button variant="primary" onClick={() => setCreatedCodes(null)}>我已保存</Button></div>
      </Modal>
    </div>
  );
}

function roleLabel(role: string) {
  return { super_admin: '超级管理员', operator: '运营', reviewer: '审核员', viewer: '只读观察' }[role] ?? role;
}
