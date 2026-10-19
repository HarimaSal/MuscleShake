import { Link } from 'react-router-dom';
import { useAsync } from '../../src/lib/hooks';
import { formatNumber } from '../../src/lib/format';
import { OpsCard, OpsKpi, OpsPageHead, OpsProgress, OpsStatus, OpsDateTime, OpsLoading, OpsCountdown } from './OpsUi';
import { ops } from './opsApi';

export function OpsDashboard() {
  const workbench = useAsync<any>(() => ops.get('/workbench'), []);
  const analytics = useAsync<any>(() => ops.get('/analytics?days=7'), []);
  const data = workbench.data;
  const a = analytics.data;

  return (
    <div>
      <OpsPageHead
        eyebrow="WORKBENCH / 今日运营"
        title="工作台"
        description="先处理会阻塞用户与内容流转的事项，再看趋势。所有数字来自当前生产口径的 MySQL 数据。"
        actions={
          <>
            <Link to="/review" className="btn btn-primary btn-sm">进入审核队列</Link>
            <Link to="/official/new" className="btn btn-outline btn-sm">发布官方内容</Link>
          </>
        }
      />

      {!data ? <OpsLoading /> : (
        <>
          <div className="ops-kpi-grid">
            <OpsKpi label="待审核内容" value={data.pending} unit="条" tone={data.pending > 50 ? 'danger' : 'default'} hint={`今日公开名额 ${data.quota.used}/${data.quota.limit}`} to="/review" />
            <OpsKpi label="举报 / 申诉" value={(data.reports ?? 0) + (data.appeals ?? 0)} unit="单" tone={data.reports > 0 ? 'warn' : 'default'} hint={`举报 ${data.reports} · 申诉 ${data.appeals}`} to="/review/reports" />
            <OpsKpi label="官方内容待处理" value={data.officialPending} unit="条" tone={data.officialPending > 0 ? 'warn' : 'default'} hint={`抽查队列 ${data.spotcheck} 条`} to="/official" />
            <OpsKpi label="高风险配置变更" value={data.highRiskConfig} unit="次" tone={data.highRiskConfig > 0 ? 'accent' : 'default'} hint="今日 00:00 起" to="/configs" />
          </div>

          {(data.alerts ?? []).length > 0 && (
            <div className="ops-stack" style={{ marginBottom: 14 }}>
              {data.alerts.map((alert: any, index: number) => (
                <div key={index} className={`ops-alert ${alert.level}`}>
                  <strong>!</strong>
                  <div><b>{alert.title}</b><br />{alert.detail}</div>
                </div>
              ))}
            </div>
          )}

          <div className="ops-grid-2">
            <div className="ops-stack">
              <OpsCard title="待处理队列" extra={<Link className="small muted" to="/review">全部 →</Link>}>
                <div className="ops-timeline">
                  {[
                    ['新投稿审核', data.pending, '/review'],
                    ['举报工单', data.reports, '/review/reports'],
                    ['申诉复核', data.appeals, '/review/reports'],
                    ['官方内容抽查', data.spotcheck, '/review/spotcheck'],
                  ].map(([label, count, to]) => (
                    <Link key={label as string} to={to as string} className="ops-timeline-item" style={{ textDecoration: 'none' }}>
                      <span className="ops-timeline-dot" />
                      <div><strong>{label as string}</strong><span>{Number(count) === 0 ? '当前无待处理' : `${count} 条等待处理`}</span></div>
                    </Link>
                  ))}
                </div>
              </OpsCard>

              <OpsCard title="最近后台操作" extra={<Link className="small muted" to="/system">审计日志 →</Link>}>
                <div className="ops-table-wrap" style={{ border: 0 }}>
                  <table className="ops-table">
                    <thead><tr><th>动作</th><th>对象</th><th>操作人</th><th>时间</th></tr></thead>
                    <tbody>
                      {(data.recentAudit ?? []).map((log: any) => (
                        <tr key={log.id}>
                          <td><span className="ops-tag">{log.action}</span></td>
                          <td className="mono">{log.targetType}:{String(log.targetId ?? '').slice(0, 12)}</td>
                          <td>{log.actorId ?? '系统'}</td>
                          <td><OpsDateTime value={log.createdAt} /></td>
                        </tr>
                      ))}
                      {!data.recentAudit?.length && <tr><td colSpan={4} className="ops-empty">暂无后台操作</td></tr>}
                    </tbody>
                  </table>
                </div>
              </OpsCard>
            </div>

            <div className="ops-stack">
              <OpsCard title="双科目成本" extra={<Link className="small muted" to="/analytics">看板 →</Link>}>
                {analytics.loading && !a ? <OpsLoading /> : a && (
                  <div className="ops-stack">
                    <CostRow
                      label="用户内容预算"
                      used={a.cost.user.spentCny}
                      cap={a.cost.user.capCny}
                      hint={`存储 ${formatNumber(a.cost.user.breakdown?.storageGb ?? 0, 2)} GB · 流量 ${formatNumber(a.cost.user.breakdown?.trafficGb ?? 0, 2)} GB`}
                    />
                    <CostRow
                      label="官方内容预算"
                      used={a.cost.official.costCny}
                      cap={a.cost.official.capCny}
                      hint={`容量 ${formatNumber(a.cost.official.storageGb, 2)} / 100 GB · 播放流量 ${formatNumber(a.cost.official.trafficGb, 2)} GB`}
                    />
                    <div className="ops-note">官方容量 100GB 是上限，不是可用额度；流量达到 40/45GB 时按配置降级。</div>
                  </div>
                )}
              </OpsCard>

              <OpsCard title="今日摘要">
                <div className="ops-kv"><span>统计日期</span><b>{data.digest?.date ?? '—'}</b></div>
                <div className="ops-kv"><span>操作总数</span><b>{data.digest?.total ?? 0}</b></div>
                <div className="ops-kv"><span>敏感操作</span><b>{data.digest?.sensitive?.length ?? 0}</b></div>
                <div className="ops-divider" />
                <div className="small muted" style={{ lineHeight: 1.7 }}>
                  审核 SLA 24 小时；高风险举报与申诉优先。官方内容单人复核后需进入抽查池。
                </div>
              </OpsCard>

              <OpsCard title="快速入口">
                <div className="ops-stack" style={{ gap: 6 }}>
                  <Link to="/exercises/import" className="ops-kv"><span>批量导入动作</span><b>→</b></Link>
                  <Link to="/exercises/merge" className="ops-kv"><span>合并重复动作</span><b>→</b></Link>
                  <Link to="/configs" className="ops-kv"><span>调整运营配置</span><b>→</b></Link>
                  <Link to="/users" className="ops-kv"><span>用户处置</span><b>→</b></Link>
                </div>
              </OpsCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CostRow({ label, used, cap, hint }: { label: string; used: number; cap: number; hint: string }) {
  const ratio = cap > 0 ? (used / cap) * 100 : 0;
  return (
    <div>
      <div className="ops-spread"><span className="small">{label}</span><strong className="mono">¥{formatNumber(used, 2)} / ¥{formatNumber(cap, 0)}</strong></div>
      <div style={{ margin: '7px 0 5px' }}><OpsProgress value={ratio} tone={ratio >= 80 ? 'danger' : ratio >= 50 ? 'warn' : 'accent'} /></div>
      <span className="ops-sub">{hint} · 使用 {formatNumber(ratio, 1)}%</span>
    </div>
  );
}
