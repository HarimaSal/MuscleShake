import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync } from '../lib/hooks';
import { formatDate, formatNumber, relativeTime } from '../lib/format';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Pill,
  Spinner,
  Stat,
  Switch,
  Tabs,
  Textarea,
} from '../components/Ui';
import { BarChart } from '../components/Charts';
import { ArticleBlocks } from '../components/ArticleBlocks';

type Tab = 'queue' | 'reports' | 'appeals' | 'dashboard' | 'rules' | 'audit' | 'users';

export function Admin() {
  const { user, toast, refreshConfig } = useApp();
  const [tab, setTab] = useState<Tab>('queue');
  const [reviewItem, setReviewItem] = useState<any>(null);
  const [action, setAction] = useState<'approve' | 'limit' | 'takedown' | 'account_action'>('approve');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [ruleCodes, setRuleCodes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [resolution, setResolution] = useState<{ id: string; approve: boolean } | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [ruleEdit, setRuleEdit] = useState<any>(null);
  const [quota, setQuota] = useState('');
  const [assignee, setAssignee] = useState('');
  const [budgetCap, setBudgetCap] = useState('');
  const [communityVisible, setCommunityVisible] = useState(true);
  const [previewPost, setPreviewPost] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const queue = useAsync<any>(() => api.get('/api/admin/queue'), []);
  const dashboard = useAsync<any>(() => api.get('/api/admin/dashboard'), []);
  const rules = useAsync<any>(() => api.get('/api/admin/rules'), []);
  const logs = useAsync<any>(() => api.get('/api/admin/audit-logs'), []);
  const users = useAsync<any>(() => api.get('/api/admin/users'), []);
  const [userQuery, setUserQuery] = useState('');

  if (user?.role !== 'admin') {
    return (
      <Card>
        <EmptyState
          icon="⛔"
          title="需要审核权限"
          description="当前账号不是审核员。可用登录页的「审核账号」体验审核后台。"
          action={
            <Link to="/" className="btn btn-outline btn-md">
              返回首页
            </Link>
          }
        />
      </Card>
    );
  }

  const submitReview = async () => {
    if (!reviewItem) return;
    setSubmitting(true);
    try {
      const result = await api.post(`/api/admin/posts/${reviewItem.id}/review`, {
        action,
        reason: reason || undefined,
        note: note || undefined,
        ruleCodes,
      });
      toast(result.message, 'success');
      setReviewItem(null);
      setReason('');
      setNote('');
      setRuleCodes([]);
      queue.reload();
      dashboard.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const refreshQueue = () => {
    queue.reload();
    dashboard.reload();
  };

  const openQuota = () => {
    setQuota(String(dashboard.data?.quota?.publicDailyQuota ?? 20));
    setAssignee(dashboard.data?.quota?.assignee ?? '');
    setBudgetCap(String(dashboard.data?.budget?.capCny ?? 20));
    setCommunityVisible(dashboard.data?.communityVisible !== false);
  };

  const openPreview = async (postId: string) => {
    setPreviewOpen(true);
    setPreviewPost(null);
    try {
      const data = await api.get(`/api/admin/posts/${postId}`);
      setPreviewPost(data);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 18, alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">REVIEW CONSOLE</div>
          <h1 style={{ fontSize: 30 }}>审核后台</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            机审外采 + 人审自建。审核操作全程留痕；公开内容每日 20 条名额，超时内容维持不可见。
          </p>
        </div>
        <div className="row">
          <Pill tone="warn">当值：{queue.data?.assignee || '未指定'}</Pill>
          <Button variant="outline" onClick={refreshQueue}>
            刷新
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'queue', label: '审核队列', count: queue.data?.posts?.length ?? 0 },
          { value: 'reports', label: '举报', count: queue.data?.reports?.length ?? 0 },
          { value: 'appeals', label: '申诉', count: queue.data?.appeals?.length ?? 0 },
          { value: 'dashboard', label: '数据看板' },
          { value: 'rules', label: '规则库' },
          { value: 'audit', label: '审计日志' },
          { value: 'users', label: '用户' },
        ]}
      />

      <div style={{ marginTop: 18 }}>
        {tab === 'queue' && (
          <div className="admin-grid">
            <div>
              {queue.loading && !queue.data ? (
                <Spinner />
              ) : !queue.data?.posts?.length ? (
                <Card>
                  <EmptyState icon="✓" title="队列已清空" description="没有待审核内容。超出公开名额的内容会自动进入次日队列。" />
                </Card>
              ) : (
                queue.data.posts.map((post: any) => (
                  <div key={post.id} className="queue-item">
                    <div className="queue-meta">
                      <Pill tone="warn">{post.reviewStatus === 'quota_deferred' ? '名额顺延' : '待人审'}</Pill>
                      <span>{post.author}</span>
                      <span>·</span>
                      <span>{relativeTime(post.publishedAt ?? post.updatedAt)}</span>
                      <span>·</span>
                      <span>{post.blockCount} 块</span>
                      {post.hasVideo && <Pill tone="info">含视频</Pill>}
                      <Pill tone="muted">{post.visibility === 'public' ? '公开' : '链接可见'}</Pill>
                    </div>
                    <h3>{post.title}</h3>
                    <p className="queue-preview">{post.preview || '（无文字内容）'}</p>
                    <div className="row">
                      <Button size="sm" variant="outline" onClick={() => openPreview(post.id)}>
                        查看全文
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setReviewItem(post);
                          setAction('approve');
                          setReason('');
                          setNote('');
                          setRuleCodes([]);
                        }}
                      >
                        审核判定
                      </Button>
                      <span className="muted small" style={{ marginLeft: 'auto' }}>
                        公开名额 {dashboard.data?.quota?.usedToday ?? 0}/{dashboard.data?.quota?.publicDailyQuota ?? 20}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Card>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>审核 SLA</h3>
              <div className="stack-sm muted small" style={{ lineHeight: 1.7 }}>
                <p>· 机审同步完成，P95 ≤3 秒；超时降级为仅自己可见</p>
                <p>· 高危命中 15 分钟内响应；常规人审 T+24h</p>
                <p>· 举报 24h 内响应、48h 内结论</p>
                <p>· 申诉 48h 内答复；成功后标记误判、不计违规</p>
                <p>· 覆盖 7×12（09:00–21:00），夜间仅机审 + T+1 复核</p>
              </div>
              <div className="divider" style={{ margin: '12px 0' }} />
              <div className="eyebrow">判定档位</div>
              <div className="stack-sm small">
                <div className="between">
                  <span>通过</span>
                  <span className="muted">正常发布</span>
                </div>
                <div className="between">
                  <span>限流</span>
                  <span className="muted">仅自己可见</span>
                </div>
                <div className="between">
                  <span>下架</span>
                  <span className="muted">不可见 + 可申诉</span>
                </div>
                <div className="between">
                  <span>账号处置</span>
                  <span className="muted">7 日禁发</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {tab === 'reports' && (
          <div className="stack">
            {queue.data?.reports?.length ? (
              queue.data.reports.map((report: any) => (
                <Card key={report.id}>
                  <div className="between">
                    <div>
                      <div className="queue-meta">
                        <Pill tone="danger">举报</Pill>
                        <span>{report.reason}</span>
                        <span>·</span>
                        <span>{relativeTime(report.createdAt)}</span>
                        <span>· 举报人 {report.reporter ?? '访客'}</span>
                      </div>
                      <h3 style={{ marginTop: 4 }}>{report.postTitle}</h3>
                      {report.detail && <p className="muted small">{report.detail}</p>}
                    </div>
                    <div className="row">
                      <Button size="sm" variant="outline" onClick={() => openPreview(report.postId)}>
                        查看
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await api.post(`/api/admin/reports/${report.id}/handle`, { result: 'dismiss' });
                            toast('已驳回举报', 'success');
                            refreshQueue();
                          } catch (err) {
                            toast(errorMessage(err), 'error');
                          }
                        }}
                      >
                        驳回
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          try {
                            await api.post(`/api/admin/reports/${report.id}/handle`, { result: 'takedown' });
                            toast('已下架内容并通知作者', 'success');
                            refreshQueue();
                          } catch (err) {
                            toast(errorMessage(err), 'error');
                          }
                        }}
                      >
                        下架
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <Card>
                <EmptyState icon="✓" title="没有待处理举报" description="用户可在公开页底部提交举报。" />
              </Card>
            )}
          </div>
        )}

        {tab === 'appeals' && (
          <div className="stack">
            {queue.data?.appeals?.length ? (
              queue.data.appeals.map((appeal: any) => (
                <Card key={appeal.id}>
                  <div className="between">
                    <div>
                      <div className="queue-meta">
                        <Pill tone="warn">申诉</Pill>
                        <span>{relativeTime(appeal.createdAt)}</span>
                      </div>
                      <h3 style={{ marginTop: 4 }}>{appeal.postTitle}</h3>
                      <p className="muted small">{appeal.reason}</p>
                    </div>
                    <div className="row">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setResolution({ id: appeal.id, approve: false });
                          setResolutionText('');
                        }}
                      >
                        驳回
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setResolution({ id: appeal.id, approve: true });
                          setResolutionText('经复核，原判定为误判，已恢复内容并不计入违规次数。');
                        }}
                      >
                        申诉成立
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <Card>
                <EmptyState icon="✓" title="没有待处理申诉" description="作者对下架/限流结果可提交一次申诉。" />
              </Card>
            )}
          </div>
        )}

        {tab === 'dashboard' && (
          <div className="stack">
            {dashboard.loading && !dashboard.data ? (
              <Spinner />
            ) : (
              <>
                <div className="grid grid-3">
                  <Card>
                    <div className="metric-grid">
                      <div className="metric-box">
                        <b>{dashboard.data?.review.dailyVolume ?? 0}</b>
                        <span>日审核量（累计提交）</span>
                      </div>
                      <div className="metric-box">
                        <b>{dashboard.data?.review.machineHitRate ?? 0}%</b>
                        <span>机审命中率</span>
                      </div>
                      <div className="metric-box">
                        <b>{dashboard.data?.review.humanApprovalRate ?? 0}%</b>
                        <span>人审通过率</span>
                      </div>
                      <div className="metric-box">
                        <b>{dashboard.data?.review.avgHandleHours ?? 0}h</b>
                        <span>平均处理时长</span>
                      </div>
                      <div className="metric-box">
                        <b>{dashboard.data?.review.appealRate ?? 0}%</b>
                        <span>申诉率</span>
                      </div>
                      <div className="metric-box">
                        <b>{dashboard.data?.review.misjudgeRate ?? 0}%</b>
                        <span>误判率</span>
                      </div>
                    </div>
                    {dashboard.data?.review.alert && <div className="notice notice-warn" style={{ marginTop: 12 }}>{dashboard.data.review.alert}</div>}
                  </Card>
                  <Card>
                    <div className="metric-grid">
                      <div className="metric-box">
                        <b>{dashboard.data?.platform.users ?? 0}</b>
                        <span>注册用户</span>
                      </div>
                      <div className="metric-box">
                        <b>{dashboard.data?.platform.sessions ?? 0}</b>
                        <span>训练记录</span>
                      </div>
                      <div className="metric-box">
                        <b>{dashboard.data?.platform.mediaCount ?? 0}</b>
                        <span>媒体资产</span>
                      </div>
                      <div className="metric-box">
                        <b>{dashboard.data?.platform.postViews ?? 0}</b>
                        <span>公开页阅读</span>
                      </div>
                      <div className="metric-box">
                        <b>{dashboard.data?.review.pending ?? 0}</b>
                        <span>待审核</span>
                      </div>
                      <div className="metric-box">
                        <b>{dashboard.data?.review.openReports ?? 0}</b>
                        <span>待处理举报</span>
                      </div>
                    </div>
                  </Card>
                  <Card>
                    <h3 style={{ fontSize: 15, marginBottom: 4 }}>成本与预算</h3>
                    <p className="muted small">月度外部成本硬上限 ¥{dashboard.data?.budget.capCny}</p>
                    <div className="between" style={{ margin: '10px 0 4px' }}>
                      <span className="mono" style={{ fontSize: 24 }}>¥{dashboard.data?.budget.spentCny}</span>
                      <Pill tone={dashboard.data?.budget.level === 'normal' ? 'accent' : 'warn'}>
                        {dashboard.data?.budget.ratio}%
                      </Pill>
                    </div>
                    <div className="progress">
                      <div className="progress-fill" style={{ width: `${Math.min(100, dashboard.data?.budget.ratio ?? 0)}%` }} />
                    </div>
                    <div className="muted small" style={{ marginTop: 8, lineHeight: 1.7 }}>
                      存储 {dashboard.data?.budget.breakdown.storageCny} 元 · 流量 {dashboard.data?.budget.breakdown.trafficCny} 元 · 转码{' '}
                      {dashboard.data?.budget.breakdown.transcodeCny} 元
                    </div>
                    <Button size="sm" variant="outline" style={{ marginTop: 10 }} onClick={openQuota}>
                      调整名额与预算
                    </Button>
                  </Card>
                </div>
                <Card>
                  <div className="between" style={{ marginBottom: 8 }}>
                    <h3 style={{ fontSize: 15 }}>近 14 天成本</h3>
                    <span className="muted small">单位：元</span>
                  </div>
                  <BarChart
                    items={(dashboard.data?.costSeries ?? []).map((item: any) => ({ label: item.date.slice(5), value: item.costCny }))}
                    height={160}
                    formatValue={(value) => formatNumber(value, 2)}
                  />
                </Card>
              </>
            )}
          </div>
        )}

        {tab === 'rules' && (
          <Card padded={false}>
            <div className="editor-panel-head">
              <span>审核规则库 · 版本化</span>
              <span className="muted" style={{ textTransform: 'none' }}>
                规则变更对历史内容不追溯（高危除外）
              </span>
            </div>
            <table className="pr-table">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>规则</th>
                  <th>处置档位</th>
                  <th>版本</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(rules.data?.items ?? []).map((rule: any) => (
                  <tr key={rule.code}>
                    <td className="mono">{rule.code}</td>
                    <td className="name">
                      <strong>{rule.title}</strong>
                      <div className="muted small" style={{ maxWidth: 420 }}>
                        {rule.description}
                      </div>
                    </td>
                    <td>{rule.level === 'takedown' ? '下架' : rule.level === 'limit' ? '限流' : rule.level}</td>
                    <td>v{rule.version}</td>
                    <td>{rule.active ? <Pill tone="accent">启用</Pill> : <Pill tone="muted">停用</Pill>}</td>
                    <td className="right">
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" onClick={() => setRuleEdit(rule)}>
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await api.put(`/api/admin/rules/${rule.code}`, { ...rule, active: !rule.active });
                              rules.reload();
                              toast(rule.active ? '已停用规则' : '已启用规则', 'success');
                            } catch (err) {
                              toast(errorMessage(err), 'error');
                            }
                          }}
                        >
                          {rule.active ? '停用' : '启用'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === 'audit' && (
          <Card padded={false}>
            <div className="editor-panel-head">
              <span>审计日志</span>
              <span className="mono">{logs.data?.items?.length ?? 0}</span>
            </div>
            <table className="pr-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作</th>
                  <th>对象</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {(logs.data?.items ?? []).map((log: any) => (
                  <tr key={log.id}>
                    <td className="name">{new Date(log.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="mono">{log.action}</td>
                    <td>{log.targetType} {log.targetId?.slice(0, 8)}</td>
                    <td className="name muted" style={{ maxWidth: 360, whiteSpace: 'normal' }}>
                      {log.detail ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === 'users' && (
          <Card padded={false}>
            <div style={{ padding: 14 }}>
              <Input
                placeholder="搜索昵称或手机号"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    api.get(`/api/admin/users?q=${encodeURIComponent(userQuery)}`).then((data: any) => users.setData?.(data)).catch(() => undefined);
                  }
                }}
              />
            </div>
            <table className="pr-table">
              <thead>
                <tr>
                  <th>昵称</th>
                  <th>手机号</th>
                  <th>角色</th>
                  <th>训练</th>
                  <th>文章</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(users.data?.items ?? []).map((item: any) => (
                  <tr key={item.id}>
                    <td className="name">{item.nickname}</td>
                    <td>{item.phone ?? '—'}</td>
                    <td>{item.role === 'admin' ? '审核员' : '用户'}</td>
                    <td>{item.sessions}</td>
                    <td>{item.posts}</td>
                    <td>
                      {item.bannedUntil ? <Pill tone="danger">禁发至 {formatDate(item.bannedUntil)}</Pill> : <Pill tone="accent">正常</Pill>}
                    </td>
                    <td className="right">
                      {item.bannedUntil && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await api.post(`/api/admin/users/${item.id}/unban`);
                            users.reload();
                            toast('已解除限制', 'success');
                          }}
                        >
                          解除
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal
        open={!!reviewItem}
        onClose={() => setReviewItem(null)}
        title="审核判定"
        description="操作会记录操作人、时间与原因，作者可见处理结果。"
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewItem(null)}>
              取消
            </Button>
            <Button variant={action === 'approve' ? 'primary' : 'danger'} loading={submitting} onClick={submitReview}>
              确认判定
            </Button>
          </>
        }
      >
        {reviewItem && (
          <div className="stack">
            <div className="notice">
              <div>
                <strong>{reviewItem.title}</strong>
                <div className="muted small">{reviewItem.author} · {reviewItem.preview}</div>
              </div>
            </div>
            <Field label="判定结果">
              <div className="row wrap">
                {[
                  { value: 'approve', label: '通过' },
                  { value: 'limit', label: '限流（仅自己）' },
                  { value: 'takedown', label: '下架' },
                  { value: 'account_action', label: '下架 + 账号禁发 7 天' },
                ].map((item) => (
                  <button
                    key={item.value}
                    className={`btn ${action === item.value ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => setAction(item.value as any)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="适用规则" hint="可多选，用于留痕">
              <div className="row wrap">
                {(rules.data?.items ?? []).filter((rule: any) => rule.active).map((rule: any) => (
                  <label key={rule.code} className="row" style={{ gap: 5, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={ruleCodes.includes(rule.code)}
                      onChange={(e) =>
                        setRuleCodes((codes) => (e.target.checked ? [...codes, rule.code] : codes.filter((code) => code !== rule.code)))
                      }
                    />
                    {rule.code}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="原因（作者可见）">
              <Input value={reason} maxLength={200} placeholder="例如：正文含广告导流信息" onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label="内部备注" hint="仅审核后台可见">
              <Textarea value={note} rows={2} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!resolution}
        onClose={() => setResolution(null)}
        title={resolution?.approve ? '申诉成立' : '申诉驳回'}
        description="结论将通知作者；申诉成立时恢复内容并标记为误判，不计入违规次数。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolution(null)}>
              取消
            </Button>
            <Button
              variant={resolution?.approve ? 'primary' : 'danger'}
              onClick={async () => {
                if (!resolution || !resolutionText) {
                  toast('请填写复核结论', 'error');
                  return;
                }
                try {
                  await api.post(`/api/admin/appeals/${resolution.id}/resolve`, {
                    approve: resolution.approve,
                    resolution: resolutionText,
                  });
                  toast('已处理申诉', 'success');
                  setResolution(null);
                  refreshQueue();
                } catch (err) {
                  toast(errorMessage(err), 'error');
                }
              }}
            >
              提交结论
            </Button>
          </>
        }
      >
        <Field label="复核结论">
          <Textarea value={resolutionText} rows={3} onChange={(e) => setResolutionText(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={!!ruleEdit}
        onClose={() => setRuleEdit(null)}
        title="编辑规则"
        description="规则变更后版本号 +1，历史内容不追溯（高危除外）。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRuleEdit(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!ruleEdit) return;
                try {
                  await api.put(`/api/admin/rules/${ruleEdit.code}`, ruleEdit);
                  toast('规则已更新', 'success');
                  setRuleEdit(null);
                  rules.reload();
                } catch (err) {
                  toast(errorMessage(err), 'error');
                }
              }}
            >
              保存
            </Button>
          </>
        }
      >
        {ruleEdit && (
          <div className="stack">
            <Field label="规则名称">
              <Input value={ruleEdit.title} onChange={(e) => setRuleEdit({ ...ruleEdit, title: e.target.value })} />
            </Field>
            <Field label="判定说明">
              <Textarea value={ruleEdit.description} rows={3} onChange={(e) => setRuleEdit({ ...ruleEdit, description: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!quota || !!budgetCap}
        onClose={() => {
          setQuota('');
          setBudgetCap('');
        }}
        title="名额与预算"
        description="名额上调前必须指定当值审核人；连续 2 个月触发预算闸门应降配或追加预算。"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setQuota('');
                setBudgetCap('');
              }}
            >
              取消
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  if (quota) {
                    await api.put('/api/admin/quota', { publicDailyQuota: Number(quota), assignee });
                  }
                  if (budgetCap) {
                    await api.put('/api/admin/budget', { capCny: Number(budgetCap) });
                  }
                  await api.put('/api/admin/features', { communityVisible });
                  await refreshConfig();
                  toast('配置已更新', 'success');
                  setQuota('');
                  setBudgetCap('');
                  dashboard.reload();
                } catch (err) {
                  toast(errorMessage(err), 'error');
                }
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="每日公开名额" hint="默认 20；人力未到位不得上调">
            <Input type="number" min={0} max={1000} value={quota} onChange={(e) => setQuota(e.target.value)} />
          </Field>
          <Field label="当值审核人">
            <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="至少 1 名，可兼任" />
          </Field>
          <Field label="月度预算上限（元）" hint="默认 ¥20，达 80% 暂停新用户视频，达 100% 全站视频关闭">
            <Input type="number" min={1} value={budgetCap} onChange={(e) => setBudgetCap(e.target.value)} />
          </Field>
          <div className="between">
            <div>
              <strong style={{ fontSize: 13 }}>显示社区占位入口</strong>
              <p className="muted small">关闭后 Web 导航与小程序 Tab 恢复无占位状态（feature flag）</p>
            </div>
            <Switch checked={communityVisible} onChange={setCommunityVisible} />
          </div>
        </div>
      </Modal>

      <Modal
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewPost(null);
        }}
        title={previewPost?.title ?? '内容预览'}
        description={previewPost ? `${previewPost.author?.nickname ?? ''} · ${previewPost.status} · ${previewPost.visibility}` : '正在载入全文'}
        width={780}
      >
        {previewPost ? (
          <div>
            <div className="queue-meta" style={{ marginBottom: 12 }}>
              <Pill tone="warn">{previewPost.reviewStatus}</Pill>
              <span>{previewPost.blocks.length} 个块</span>
              <span>·</span>
              <span>{previewPost.wordCount ?? 0} 字</span>
            </div>
            {previewPost.reviewReason && <div className="notice notice-danger" style={{ marginBottom: 12 }}>{previewPost.reviewReason}</div>}
            <ArticleBlocks blocks={previewPost.blocks} />
          </div>
        ) : (
          <Spinner label="正在载入内容" />
        )}
      </Modal>
    </div>
  );
}
