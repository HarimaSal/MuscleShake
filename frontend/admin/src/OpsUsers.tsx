import { useState } from 'react';
import { Button, Field, Input, Modal, Select, Textarea } from '../../src/components/Ui';
import { useAsync } from '../../src/lib/hooks';
import { formatNumber } from '../../src/lib/format';
import { OpsCard, OpsDateTime, OpsEmpty, OpsLoading, OpsPageHead, OpsStatus } from './OpsUi';
import { ops } from './opsApi';
import { useOpsToast } from './OpsToast';

type Dict = Record<string, any>;

export function OpsUsersPage() {
  const toast = useOpsToast();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'users' | 'deletion'>('users');
  const users = useAsync<any>(() => ops.get(`/users?q=${encodeURIComponent(q)}`), [q]);
  const deletion = useAsync<any>(() => ops.get('/users/deletion-queue'), []);
  const rules = useAsync<any>(() => ops.get('/review/rules'), []);
  const [target, setTarget] = useState<Dict | null>(null);
  const [type, setType] = useState('ban_post_7');
  const [rule, setRule] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const punish = async () => {
    if (!target) return;
    if (!rule) return toast('请选择规则编号', 'error');
    if (reason.trim().length < 4) return toast('请填写处置理由', 'error');
    setLoading(true);
    try {
      await ops.post(`/users/${target.id}/punish`, { type, ruleCode: rule, reason });
      toast('处置已生效', 'success'); setTarget(null); users.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '处置失败', 'error'); } finally { setLoading(false); }
  };
  const unban = async (user: Dict) => {
    if (!window.confirm(`解除 ${user.nickname} 的处置？`)) return;
    try { await ops.post(`/users/${user.id}/unban`); toast('已解除', 'success'); users.reload(); }
    catch (err) { toast(err instanceof Error ? err.message : '操作失败', 'error'); }
  };
  const purge = async (user: Dict) => {
    if (!window.confirm(`彻底删除 ${user.nickname}？不可恢复。`)) return;
    try { await ops.post(`/users/${user.id}/purge`); toast('已彻底删除', 'success'); deletion.reload(); }
    catch (err) { toast(err instanceof Error ? err.message : '删除失败', 'error'); }
  };

  return (
    <div>
      <OpsPageHead eyebrow="OPERATIONS / USERS" title="用户与处置" description="手机号仅显示掩码。处置必须引用规则编号，理由会随通知发给用户。" />
      <div className="ops-toolbar">
        <div className="ops-seg">
          <button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>用户列表</button>
          <button type="button" className={tab === 'deletion' ? 'active' : ''} onClick={() => setTab('deletion')}>注销队列 ({deletion.data?.total ?? 0})</button>
        </div>
        {tab === 'users' && <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="昵称、用户 ID 或手机尾号 4 位" />}
      </div>
      {tab === 'users' ? (
        users.loading && !users.data ? <OpsLoading /> : (
          <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>用户</th><th>状态</th><th>记录</th><th>内容</th><th>注册</th><th>操作</th></tr></thead><tbody>
            {(users.data?.items ?? []).map((user: Dict) => <tr key={user.id}><td><span className="name">{user.nickname || '未命名'}</span><span className="ops-sub mono">{user.phoneMasked} · {user.id.slice(0, 12)}</span></td><td><OpsStatus status={user.status} />{user.isTest && <span className="ops-tag accent" style={{ marginLeft: 4 }}>测试号</span>}{user.bannedUntil && <span className="ops-sub danger">限制至 {user.bannedUntil.slice(0, 10)}</span>}</td><td className="mono">{formatNumber(user.sessions, 0)} 次</td><td className="mono">{formatNumber(user.posts, 0)} 篇</td><td><OpsDateTime value={user.createdAt} /></td><td><div className="actions"><button type="button" onClick={() => { setTarget(user); setType('ban_post_7'); setRule(''); setReason(''); }}>处置</button>{user.bannedUntil && <button type="button" onClick={() => void unban(user)}>解除</button>}</div></td></tr>)}
            {!users.data?.items?.length && <tr><td colSpan={6}><OpsEmpty title="没有匹配用户" description="尝试手机尾号 4 位或昵称。" /></td></tr>}
          </tbody></table></div>
        )
      ) : (
        deletion.loading && !deletion.data ? <OpsLoading /> : (
          <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>用户</th><th>申请时间</th><th>可彻底删除时间</th><th>状态</th><th>操作</th></tr></thead><tbody>
            {(deletion.data?.items ?? []).map((user: Dict) => <tr key={user.id}><td><span className="name">{user.nickname}</span><span className="ops-sub mono">{user.phoneMasked}</span></td><td><OpsDateTime value={user.deleteRequestedAt} /></td><td><OpsDateTime value={user.purgeAt} /></td><td><span className="ops-status ops-status-pending">冷静期</span></td><td><button type="button" className="ops-tag danger" onClick={() => void purge(user)}>彻底删除</button></td></tr>)}
            {!deletion.data?.items?.length && <tr><td colSpan={5}><OpsEmpty title="注销队列为空" description="30 天冷静期内的账号会在这里。" /></td></tr>}
          </tbody></table></div>
        )
      )}
      <Modal open={!!target} onClose={() => setTarget(null)} title={`处置 ${target?.nickname ?? ''}`} description={`${target?.phoneMasked ?? ''} · 处置会发送站内通知`} width={560}>
        <Field label="处置类型"><Select value={type} onChange={(e) => setType(e.target.value)}><option value="warn">警告 / 通知</option><option value="ban_post_7">限制发布 7 天</option><option value="ban_post_30">限制发布 30 天</option><option value="ban_account_permanent">永久封禁</option></Select></Field>
        <div style={{ height: 10 }} /><Field label="规则编号"><Select value={rule} onChange={(e) => setRule(e.target.value)}><option value="">请选择</option>{(rules.data?.items ?? []).map((item: Dict) => <option key={item.code} value={item.code}>{item.code} · {item.title}</option>)}</Select></Field>
        <div style={{ height: 10 }} /><Field label="处置理由"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="ops-form-foot"><Button variant="primary" onClick={() => void punish()} disabled={loading}>确认处置</Button></div>
      </Modal>
      <div className="ops-note" style={{ marginTop: 14 }}>隐私保护：后台不展示完整手机号；导出与审计日志同样只保留掩码。账号删除需满 30 天冷静期。</div>
    </div>
  );
}
