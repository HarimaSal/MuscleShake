import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Field, Input, Select, Switch, Textarea } from '../../src/components/Ui';
import { useAsync } from '../../src/lib/hooks';
import { formatNumber } from '../../src/lib/format';
import { OpsCard, OpsDateTime, OpsEmpty, OpsLoading, OpsPageHead, OpsProgress, OpsKpi, RiskTag } from './OpsUi';
import { ops } from './opsApi';
import { useOpsToast } from './OpsToast';

type Dict = Record<string, any>;

export function OpsConfigsPage() {
  const toast = useOpsToast();
  const list = useAsync<any>(() => ops.get('/configs'), []);
  const [featureState, setFeatureState] = useState<Dict>({});
  useEffect(() => {
    if (!list.data?.features) return;
    const next: Dict = {};
    for (const item of list.data.features) {
      next[`${item.key}_web`] = item.web === '1';
      next[`${item.key}_mp`] = item.mp === '1';
    }
    setFeatureState(next);
  }, [list.data]);
  const saveFeatures = async () => {
    try {
      const body: Dict = {};
      Object.entries(featureState).forEach(([key, value]) => { body[key] = value ? '1' : '0'; });
      await ops.put('/configs/features/save', body);
      toast('分端开关已更新', 'success'); list.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '更新失败', 'error'); }
  };
  const items = list.data?.items ?? [];
  const high = items.filter((item: Dict) => item.riskLevel === 'high').length;
  const risky = items.filter((item: Dict) => item.riskLevel === 'high' && item.updatedAt).slice(0, 5);

  return (
    <div>
      <OpsPageHead eyebrow="OPERATIONS / CONFIG" title="配置中心" description="17 个运营配置集中管理。高风险项必须二次确认、填写原因并进入审计与当日摘要。" />
      {list.loading && !list.data ? <OpsLoading /> : (
        <>
          <div className="ops-kpi-grid">
            <OpsKpi label="配置项" value={items.length} unit="项" hint="与 PRD 17 项对齐" />
            <OpsKpi label="高风险" value={high} unit="项" tone={high > 0 ? 'danger' : 'default'} hint="影响审核、预算与发布" />
            <OpsKpi label="最近变更" value={items.filter((item: Dict) => item.updatedAt).length} unit="项" hint="含历史迁移" />
            <OpsKpi label="待确认生效" value={0} unit="项" hint="当前为同步生效" />
          </div>
          <div className="ops-grid-2">
            <OpsCard title="全部配置" extra={<span className="small muted">{items.length} 项</span>}>
              <div className="ops-table-wrap" style={{ border: 0 }}>
                <table className="ops-table">
                  <thead><tr><th>配置项</th><th>当前值</th><th>风险</th><th>分组</th><th>更新</th><th>操作</th></tr></thead>
                  <tbody>
                    {items.map((item: Dict) => <tr key={item.key}><td><span className="name">{item.key}</span><span className="ops-sub">{item.description}</span></td><td className="mono">{item.value}</td><td><RiskTag risk={item.riskLevel} /></td><td>{item.group}</td><td><OpsDateTime value={item.updatedAt} /></td><td><Link className="ops-tag accent" to={`/configs/${item.key}`}>编辑</Link></td></tr>)}
                  </tbody>
                </table>
              </div>
            </OpsCard>
            <div className="ops-stack">
              <OpsCard title="分端 Feature Flag">
                {(list.data?.features ?? []).map((feature: Dict) => (
                  <div key={feature.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <div className="ops-spread"><span className="small">{feature.key}</span><span className="ops-tag">Web</span><Switch checked={!!featureState[`${feature.key}_web`]} onChange={(value) => setFeatureState((state) => ({ ...state, [`${feature.key}_web`]: value }))} /></div>
                    <div className="ops-spread" style={{ marginTop: 5 }}><span className="muted small">小程序</span><span className="ops-tag">MP</span><Switch checked={!!featureState[`${feature.key}_mp`]} onChange={(value) => setFeatureState((state) => ({ ...state, [`${feature.key}_mp`]: value }))} /></div>
                  </div>
                ))}
                <div className="ops-form-foot"><Button size="sm" variant="outline" onClick={() => void saveFeatures()}>保存分端开关</Button></div>
              </OpsCard>
              <OpsCard title="高风险变更">
                {risky.map((item: Dict) => <div className="ops-kv" key={item.key}><span>{item.key}</span><b>{item.value}</b></div>)}
                {!risky.length && <span className="small muted">暂无高风险配置变更。</span>}
              </OpsCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function OpsConfigDetailPage() {
  const { key } = useParams();
  const toast = useOpsToast();
  const detail = useAsync<any>(() => (key ? ops.get(`/configs/${key}`) : Promise.resolve(null)), [key]);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setValue(detail.data?.value ?? ''); }, [detail.data]);
  const save = async () => {
    if (!key) return;
    if (reason.trim().length < 5) return toast('请填写至少 5 个字的变更原因', 'error');
    if (!confirm) return toast('请勾选二次确认', 'error');
    try {
      await ops.put(`/configs/${key}`, { value, reason, confirm: true });
      toast('配置已更新并记录审计', 'success'); detail.reload();
    } catch (err) { toast(err instanceof Error ? err.message : '更新失败', 'error'); }
  };
  const rollback = async (logId: string) => {
    if (!key || !window.confirm('确认回滚到该历史值？')) return;
    try { await ops.post(`/configs/${key}/rollback`, { logId, reason: '后台回滚配置', confirm: true }); toast('已回滚', 'success'); detail.reload(); }
    catch (err) { toast(err instanceof Error ? err.message : '回滚失败', 'error'); }
  };
  const item = detail.data;
  return (
    <div>
      <OpsPageHead eyebrow="CONFIG / DETAIL" title={item?.key ?? '配置项'} description={item?.description}
        actions={<><Link to="/configs" className="btn btn-outline btn-sm">返回配置中心</Link>{item?.riskLevel === 'high' && <span className="ops-tag danger">高风险配置</span>}</>} />
      {detail.loading && !item ? <OpsLoading /> : item && (
        <div className="ops-grid-2">
          <OpsCard title="修改配置">
            {item.riskLevel === 'high' && <div className="ops-note warn" style={{ marginBottom: 12 }}>高风险配置会影响审核、预算或发布链路。保存后会进入审计日志与当日摘要。</div>}
            <Field label="当前值"><Input value={value} onChange={(e) => setValue(e.target.value)} /></Field>
            <div style={{ height: 10 }} />
            <div className="ops-kv"><span>默认值</span><b className="mono">{item.defaultValue || '—'}</b></div>
            <div className="ops-kv"><span>风险等级</span><b><RiskTag risk={item.riskLevel} /></b></div>
            <div className="ops-kv"><span>PRD 引用</span><b>{item.refPrd || '—'}</b></div>
            <div className="ops-kv"><span>最后更新</span><b><OpsDateTime value={item.updatedAt} /></b></div>
            <div className="ops-divider" />
            <Field label="变更原因（必填，至少 5 字）"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="说明为什么需要改，以及影响范围" /></Field>
            <label className="ops-checkbox" style={{ marginTop: 10 }}><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />我已确认该配置的影响范围，并接受审计留痕</label>
            <div className="ops-form-foot"><Button variant="primary" onClick={() => void save()}>保存配置</Button></div>
          </OpsCard>
          <OpsCard title="变更历史" extra={<span className="small muted">最近 50 条</span>}>
            <div className="ops-timeline">
              {(item.history ?? []).map((log: Dict) => <div className="ops-timeline-item" key={log.id}><span className="ops-timeline-dot" /><div><strong>{log.oldValue} → {log.newValue}</strong><span>{log.reason} · {log.operatorId} · <OpsDateTime value={log.createdAt} /></span><button type="button" className="ops-tag" style={{ marginTop: 5 }} onClick={() => void rollback(log.id)}>回滚到此值</button></div></div>)}
              {!item.history?.length && <OpsEmpty title="暂无变更历史" description="第一次保存后生成记录。" />}
            </div>
          </OpsCard>
        </div>
      )}
    </div>
  );
}
