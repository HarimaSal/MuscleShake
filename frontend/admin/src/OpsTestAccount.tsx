import { useState } from 'react';
import { Button, Switch } from '../../src/components/Ui';
import { useAsync } from '../../src/lib/hooks';
import { OpsCard, OpsEmpty, OpsLoading, OpsPageHead } from './OpsUi';
import { ops } from './opsApi';
import { useOpsToast } from './OpsToast';

type Dict = Record<string, any>;

export function OpsTestAccountPage() {
  const toast = useOpsToast();
  const data = useAsync<any>(() => ops.get('/test-account'), []);
  const [loading, setLoading] = useState(false);
  const toggle = async (enabled: boolean) => {
    setLoading(true);
    try { await ops.post('/test-account/toggle', { enabled }); toast(enabled ? '测试号已启用' : '测试号已停用', 'success'); data.reload(); }
    catch (err) { toast(err instanceof Error ? err.message : '操作失败', 'error'); } finally { setLoading(false); }
  };
  const create = async () => {
    setLoading(true);
    try { await ops.post('/test-account/create'); toast('测试号已创建，手机号 13700000000', 'success'); data.reload(); }
    catch (err) { toast(err instanceof Error ? err.message : '创建失败', 'error'); } finally { setLoading(false); }
  };
  const reset = async (item: Dict) => {
    if (!window.confirm(`重置测试号 ${item.nickname} 的全部训练、内容与媒体？账号会保留。`)) return;
    setLoading(true);
    try { await ops.post(`/test-account/${item.id}/reset`); toast('测试号已重置', 'success'); data.reload(); }
    catch (err) { toast(err instanceof Error ? err.message : '重置失败', 'error'); } finally { setLoading(false); }
  };
  return (
    <div>
      <OpsPageHead eyebrow="OPERATIONS / TEST ACCOUNT" title="测试号" description="测试号仅用于内部验证与演示，计入运营指标但单独标记；数量上限 1 个。" />
      {data.loading && !data.data ? <OpsLoading /> : (
        <div className="ops-grid-2">
          <OpsCard title="测试号总开关">
            <div className="ops-spread"><div><strong style={{ fontSize: 13 }}>允许测试号使用前台</strong><p className="muted small">关闭后测试号无法登录或写入数据。</p></div><Switch checked={!!data.data?.enabled} onChange={(value) => void toggle(value)} /></div>
            <div className="ops-note" style={{ marginTop: 12 }}>测试号数据与真实用户隔离；重置只清理业务数据，不删除账号。</div>
          </OpsCard>
          <OpsCard title="当前测试号" extra={<div className="row"><span className="ops-tag">{data.data?.items?.length ?? 0} / {data.data?.limit ?? 1}</span>{!data.data?.items?.length && <Button size="sm" variant="primary" disabled={loading} onClick={() => void create()}>创建测试号</Button>}</div>}>
            {(data.data?.items ?? []).map((item: Dict) => (
              <div key={item.id} className="ops-spread" style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div><strong>{item.nickname}</strong><span className="ops-sub mono">{item.phoneMasked} · {item.sessions} 次训练 · {item.posts} 篇内容</span></div>
                <Button size="sm" variant="outline" disabled={loading} onClick={() => void reset(item)}>一键重置</Button>
              </div>
            ))}
            {!data.data?.items?.length && <OpsEmpty title="尚未指定测试号" description="在用户列表中标记一个测试账号后显示。" />}
          </OpsCard>
        </div>
      )}
    </div>
  );
}
