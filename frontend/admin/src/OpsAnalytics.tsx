import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../src/components/Ui';
import { useAsync } from '../../src/lib/hooks';
import { formatNumber } from '../../src/lib/format';
import { OpsCard, OpsEmpty, OpsKpi, OpsLoading, OpsPageHead, OpsProgress } from './OpsUi';
import { ops } from './opsApi';

export function OpsAnalyticsPage() {
  const [days, setDays] = useState(30);
  const data = useAsync<any>(() => ops.get(`/analytics?days=${days}`), [days]);
  const a = data.data;
  const maxFunnel = Math.max(1, ...(a?.funnel ?? []).map((item: any) => Number(item.value) || 0));
  return (
    <div>
      <OpsPageHead eyebrow="OPERATIONS / ANALYTICS" title="数据看板" description="从启动到打卡的转化、动作库覆盖与双科目成本。所有口径直接读取 MySQL。"
        actions={<div className="ops-seg">{[7, 30, 90].map((value) => <button key={value} type="button" className={days === value ? 'active' : ''} onClick={() => setDays(value)}>{value} 天</button>)}</div>} />
      {data.loading && !a ? <OpsLoading /> : a && (
        <>
          <div className="ops-kpi-grid">
            <OpsKpi label="注册用户" value={formatNumber(a.funnel?.[0]?.value ?? 0, 0)} unit="人" hint="前台普通用户" />
            <OpsKpi label="训练记录" value={formatNumber(a.funnel?.[2]?.value ?? 0, 0)} unit="次" tone="accent" hint={`${days} 天窗口`} />
            <OpsKpi label="动作覆盖" value={a.exercise?.coverage ?? 0} unit="%" hint={`${a.exercise?.covered ?? 0} / ${a.exercise?.builtin ?? 0} 个内置动作`} />
            <OpsKpi label="官方成本" value={`¥${formatNumber(a.cost?.official?.costCny ?? 0, 2)}`} tone={(a.cost?.official?.ratio ?? 0) > 80 ? 'danger' : 'default'} hint={`上限 ¥${a.cost?.official?.capCny ?? 10}`} />
          </div>
          <div className="ops-grid-2">
            <OpsCard title="启动 → 打卡漏斗">
              <div className="ops-funnel">
                {(a.funnel ?? []).map((item: any) => (
                  <div className="ops-funnel-row" key={item.step}>
                    <span>{item.step}</span>
                    <div className="ops-funnel-track"><div className="ops-funnel-fill" style={{ width: `${Math.max(2, (Number(item.value) / maxFunnel) * 100)}%` }} /></div>
                    <b className="mono">{formatNumber(item.value, 0)}</b>
                    <span className="ops-sub" style={{ gridColumn: '2 / -1', marginTop: -5 }}>{item.note}</span>
                  </div>
                ))}
              </div>
            </OpsCard>
            <div className="ops-stack">
              <OpsCard title="双科目成本">
                <div className="ops-cost-grid">
                  <div className="ops-cost-box"><span className="small muted">用户内容</span><strong>¥{formatNumber(a.cost?.user?.spentCny ?? 0, 2)}</strong><OpsProgress value={((a.cost?.user?.spentCny ?? 0) / Math.max(1, a.cost?.user?.capCny ?? 20)) * 100} /><span className="ops-sub">上限 ¥{a.cost?.user?.capCny ?? 20}</span></div>
                  <div className={`ops-cost-box ${(a.cost?.official?.ratio ?? 0) > 80 ? 'danger' : ''}`}><span className="small muted">官方内容</span><strong>¥{formatNumber(a.cost?.official?.costCny ?? 0, 2)}</strong><OpsProgress value={a.cost?.official?.ratio ?? 0} tone={(a.cost?.official?.ratio ?? 0) > 80 ? 'danger' : 'accent'} /><span className="ops-sub">上限 ¥{a.cost?.official?.capCny ?? 10}</span></div>
                </div>
              </OpsCard>
              <OpsCard title="动作健康度">
                <div className="ops-kv"><span>内置动作</span><b>{a.exercise?.builtin ?? 0}</b></div>
                <div className="ops-kv"><span>有使用记录</span><b>{a.exercise?.covered ?? 0}</b></div>
                <div className="ops-kv"><span>搜索无结果率</span><b>{a.exercise?.noResultRate ?? 0}%</b></div>
                <Link className="btn btn-outline btn-sm" style={{ marginTop: 10 }} to="/exercises/search-quality">查看搜索质量</Link>
              </OpsCard>
            </div>
          </div>
          <div className="ops-grid-3" style={{ marginTop: 14 }}>
            <OpsCard title="内容表现">
              <div className="ops-kv"><span>用户内容</span><b>{a.content?.total ?? 0}</b></div>
              <div className="ops-kv"><span>官方内容</span><b>{a.content?.official ?? 0}</b></div>
              <div className="ops-kv"><span>总阅读</span><b>{formatNumber(a.content?.views ?? 0, 0)}</b></div>
            </OpsCard>
            <OpsCard title="官方内容 Top 5" className="ops-span-2">
              <div className="ops-table-wrap" style={{ border: 0 }}><table className="ops-table"><thead><tr><th>标题</th><th>阅读</th></tr></thead><tbody>
                {(a.content?.top ?? []).map((item: any) => <tr key={item.id}><td>{item.title}</td><td className="mono">{formatNumber(item.views, 0)}</td></tr>)}
                {!a.content?.top?.length && <tr><td colSpan={2}><OpsEmpty title="暂无官方内容" description="发布后显示。" /></td></tr>}
              </tbody></table></div>
            </OpsCard>
            <OpsCard title="无结果搜索词">
              {(a.exercise?.noResultTerms ?? []).slice(0, 6).map((item: any) => <div className="ops-kv" key={item.keyword}><span>{item.keyword}</span><b>{item.count}</b></div>)}
              {!a.exercise?.noResultTerms?.length && <span className="small muted">暂无无结果搜索。</span>}
            </OpsCard>
          </div>
        </>
      )}
    </div>
  );
}
