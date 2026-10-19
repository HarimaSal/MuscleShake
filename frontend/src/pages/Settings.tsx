import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync } from '../lib/hooks';
import { fileSize, formatDate, sessionTypeLabel, visibilityLabel } from '../lib/format';
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Pill,
  Progress,
  Select,
  Spinner,
  Switch,
} from '../components/Ui';
import type { Media, Template } from '../types';

type Section = 'profile' | 'training' | 'privacy' | 'media' | 'account';

const SECTIONS: Array<{ value: Section; label: string }> = [
  { value: 'profile', label: '账号资料' },
  { value: 'training', label: '训练与提醒' },
  { value: 'privacy', label: '隐私与可见性' },
  { value: 'media', label: '存储与媒体' },
  { value: 'account', label: '数据与账号' },
];

export function Settings() {
  const { user, config, loadMe, signOut, toast, setUser } = useApp();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('profile');
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [weeklyGoal, setWeeklyGoal] = useState(String(user?.weeklyGoal ?? 3));
  const [reminderTime, setReminderTime] = useState(user?.reminderTime ?? '19:30');
  const [notifyCheckin, setNotifyCheckin] = useState(user?.notifyCheckin ?? true);
  const [notifyWeekly, setNotifyWeekly] = useState(user?.notifyWeekly ?? true);
  const [notifyInteraction, setNotifyInteraction] = useState(user?.notifyInteraction ?? true);
  const [sessionVisibility, setSessionVisibility] = useState(user?.defaultSessionVisibility ?? 'private');
  const [postVisibility, setPostVisibility] = useState(user?.defaultPostVisibility ?? 'private');
  const [saving, setSaving] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacy, setPrivacy] = useState<any>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMedia, setDeleteMedia] = useState<Media | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const templates = useAsync<{ items: Template[] }>(() => api.get('/api/templates'), []);

  useEffect(() => {
    if (user) {
      setNickname(user.nickname);
      setWeeklyGoal(String(user.weeklyGoal));
      setReminderTime(user.reminderTime);
      setNotifyCheckin(user.notifyCheckin);
      setNotifyWeekly(user.notifyWeekly);
      setNotifyInteraction(user.notifyInteraction);
      setSessionVisibility(user.defaultSessionVisibility);
      setPostVisibility(user.defaultPostVisibility);
    }
  }, [user]);

  const loadMedia = () => {
    api
      .get('/api/media')
      .then((res: any) => {
        setMedia(res.items ?? []);
        setUsage(res.usage);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    if (section === 'media') loadMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const saveProfile = async (extra: Record<string, any> = {}) => {
    setSaving(true);
    try {
      const data = await api.patch('/api/auth/me', {
        nickname,
        weeklyGoal: Number(weeklyGoal),
        reminderTime,
        notifyCheckin,
        notifyWeekly,
        notifyInteraction,
        defaultSessionVisibility: sessionVisibility,
        defaultPostVisibility: postVisibility,
        ...extra,
      });
      setUser(data.user);
      await loadMe();
      toast('设置已保存', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const openPrivacy = async () => {
    setPrivacyOpen(true);
    if (!privacy) {
      const data = await api.get('/api/auth/privacy', { auth: false });
      setPrivacy(data);
    }
  };

  const requestDelete = async () => {
    try {
      const data = await api.post('/api/auth/me/delete');
      setDeleteOpen(false);
      toast(data.message, 'success');
      await loadMe();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const cancelDelete = async () => {
    try {
      await api.post('/api/auth/me/delete/cancel');
      toast('已撤销注销申请', 'success');
      await loadMe();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const removeMedia = async () => {
    if (!deleteMedia) return;
    try {
      await api.del(`/api/media/${deleteMedia.id}`);
      toast('已删除，配额已释放', 'success');
      setDeleteMedia(null);
      loadMedia();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  if (!user) return null;

  return (
    <div>
      <div className="eyebrow">SETTINGS</div>
      <h1 style={{ fontSize: 30, marginBottom: 18 }}>我的</h1>

      <div className="settings-grid">
        <nav className="settings-nav">
          {SECTIONS.map((item) => (
            <button key={item.value} className={section === item.value ? 'active' : ''} onClick={() => setSection(item.value)}>
              {item.label}
            </button>
          ))}
          {user.role === 'admin' && (
            <button onClick={() => navigate('/ops')} style={{ color: 'var(--accent)' }}>
              运营后台 →
            </button>
          )}
        </nav>

        <div>
          {section === 'profile' && (
            <>
              <div className="settings-block">
                <div className="row" style={{ gap: 14, marginBottom: 18 }}>
                  <Avatar name={nickname || user.nickname} src={user.avatar} size={54} />
                  <div>
                    <h3>{user.nickname}</h3>
                    <p className="muted small">
                      {user.phone ? user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '微信账号'} · 注册于 {formatDate(user.createdAt)}
                    </p>
                  </div>
                  {user.role === 'admin' && <Pill tone="accent">审核员</Pill>}
                </div>
                <Field label="昵称">
                  <Input value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} />
                </Field>
                <div className="setting-row">
                  <div className="label">
                    <strong>隐私政策</strong>
                    <span>首次使用时已确认，可随时回看</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={openPrivacy}>
                    查看
                  </Button>
                </div>
                <div className="setting-row">
                  <div className="label">
                    <strong>时区</strong>
                    <span>打卡归属日按设备时区计算，当前 UTC{new Date().getTimezoneOffset() <= 0 ? '+' : '-'}{Math.abs(new Date().getTimezoneOffset() / 60)}</span>
                  </div>
                  <span className="muted small">自动</span>
                </div>
                <div style={{ marginTop: 14 }}>
                  <Button variant="primary" loading={saving} onClick={() => saveProfile()}>
                    保存资料
                  </Button>
                </div>
              </div>
            </>
          )}

          {section === 'training' && (
            <>
              <div className="settings-block">
                <h3 style={{ marginBottom: 14 }}>训练目标</h3>
                <Field label="每周训练天数" hint="目标 1–7 天，达成后首页与打卡页提示">
                  <Select value={weeklyGoal} onChange={(e) => setWeeklyGoal(e.target.value)}>
                    {[1, 2, 3, 4, 5, 6, 7].map((value) => (
                      <option key={value} value={value}>
                        {value} 天
                      </option>
                    ))}
                  </Select>
                </Field>
                <div style={{ marginTop: 14 }}>
                  <Button variant="primary" loading={saving} onClick={() => saveProfile()}>
                    保存目标
                  </Button>
                </div>
              </div>

              <div className="settings-block">
                <h3 style={{ marginBottom: 4 }}>提醒</h3>
                <p className="muted small" style={{ marginBottom: 8 }}>
                  站内提醒每日最多 1 次，已打卡不发送。小程序订阅消息需在微信内单独授权。
                </p>
                <div className="setting-row">
                  <div className="label">
                    <strong>打卡提醒</strong>
                    <span>当日未打卡时提醒</span>
                  </div>
                  <Switch checked={notifyCheckin} onChange={setNotifyCheckin} />
                </div>
                <div className="setting-row">
                  <div className="label">
                    <strong>周报提醒</strong>
                    <span>每周一提示上周复盘</span>
                  </div>
                  <Switch checked={notifyWeekly} onChange={setNotifyWeekly} />
                </div>
                <div className="setting-row">
                  <div className="label">
                    <strong>内容互动提醒</strong>
                    <span>社区未开放，暂时不会触发</span>
                  </div>
                  <Switch checked={notifyInteraction} onChange={setNotifyInteraction} />
                </div>
                <div className="setting-row">
                  <div className="label">
                    <strong>提醒时间</strong>
                    <span>仅站内，Web 打开时生效</span>
                  </div>
                  <Input
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    style={{ width: 120 }}
                  />
                </div>
                <div style={{ marginTop: 14 }}>
                  <Button variant="primary" loading={saving} onClick={() => saveProfile()}>
                    保存提醒设置
                  </Button>
                </div>
              </div>

              <div className="settings-block">
                <div className="between" style={{ marginBottom: 10 }}>
                  <div>
                    <h3>训练模板</h3>
                    <p className="muted small">从模板开练时动作与组数自动填充，重量留空。</p>
                  </div>
                </div>
                {templates.data?.items?.length ? (
                  <div className="stack-sm">
                    {templates.data.items.map((template) => (
                      <div key={template.id} className="setting-row">
                        <div className="label">
                          <strong>{template.name}</strong>
                          <span>
                            {template.payload.items.length} 个动作 ·{' '}
                            {template.payload.items.reduce((sum, item) => sum + item.setCount, 0)} 组 ·{' '}
                            {sessionTypeLabel(template.type)}
                          </span>
                        </div>
                        <div className="row">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              try {
                                const result = await api.post(`/api/templates/${template.id}/start`, {
                                  tzOffset: new Date().getTimezoneOffset(),
                                });
                                navigate(`/sessions/${result.session.id}/edit`);
                              } catch (err) {
                                toast(errorMessage(err), 'error');
                              }
                            }}
                          >
                            开始
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                await api.del(`/api/templates/${template.id}`);
                                templates.reload();
                                toast('模板已删除', 'success');
                              } catch (err) {
                                toast(errorMessage(err), 'error');
                              }
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">还没有模板。在训练详情页点击「保存为模板」即可创建。</p>
                )}
              </div>
            </>
          )}

          {section === 'privacy' && (
            <>
              <div className="settings-block">
                <h3 style={{ marginBottom: 4 }}>默认可见性</h3>
                <p className="muted small" style={{ marginBottom: 8 }}>
                  新创建的内容默认使用这里的设置，仍可逐篇修改。默认「仅自己」。
                </p>
                <div className="setting-row">
                  <div className="label">
                    <strong>训练记录</strong>
                    <span>{visibilityLabel(sessionVisibility)}</span>
                  </div>
                  <Select value={sessionVisibility} onChange={(e) => setSessionVisibility(e.target.value)} style={{ width: 150 }}>
                    <option value="private">仅自己</option>
                    <option value="unlisted">链接可见</option>
                    <option value="public">公开</option>
                  </Select>
                </div>
                <div className="setting-row">
                  <div className="label">
                    <strong>文章</strong>
                    <span>{visibilityLabel(postVisibility)}</span>
                  </div>
                  <Select value={postVisibility} onChange={(e) => setPostVisibility(e.target.value)} style={{ width: 150 }}>
                    <option value="private">仅自己</option>
                    <option value="unlisted">链接可见</option>
                    <option value="public">公开</option>
                  </Select>
                </div>
                <div style={{ marginTop: 14 }}>
                  <Button variant="primary" loading={saving} onClick={() => saveProfile()}>
                    保存可见性
                  </Button>
                </div>
              </div>

              <div className="settings-block">
                <h3 style={{ marginBottom: 4 }}>媒体与访问控制</h3>
                <p className="muted small">
                  所有媒体为私有读，通过有效期 2 小时的签名链接访问，并开启防盗链。复制链接 2 小时后失效，需重新获取。
                </p>
                <div className="setting-row">
                  <div className="label">
                    <strong>剥离照片位置信息</strong>
                    <span>客户端压缩转码时移除 EXIF 地理位置，默认开启</span>
                  </div>
                  <Pill tone="accent">已开启</Pill>
                </div>
                <div className="setting-row">
                  <div className="label">
                    <strong>内容审核</strong>
                    <span>公开内容需机审 + 人审；未通过原因对作者可见，可申诉一次</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={openPrivacy}>
                    规则说明
                  </Button>
                </div>
              </div>
            </>
          )}

          {section === 'media' && (
            <>
              <div className="settings-block">
                <div className="between" style={{ marginBottom: 8 }}>
                  <h3>存储用量</h3>
                  <span className="mono small">
                    {fileSize(usage?.usedBytes ?? 0)} / {usage?.quotaGb ?? 50} GB
                  </span>
                </div>
                <div className="usage-bar">
                  <div className="usage-seg usage-image" style={{ width: `${((usage?.byType?.image ?? 0) / (usage?.quotaBytes || 1)) * 100}%` }} />
                  <div className="usage-seg usage-video" style={{ width: `${((usage?.byType?.video ?? 0) / (usage?.quotaBytes || 1)) * 100}%` }} />
                </div>
                <div className="row" style={{ gap: 18 }}>
                  <span className="legend-pill">
                    <span className="legend-box" style={{ background: 'var(--info)' }} />
                    图片 {fileSize(usage?.byType?.image ?? 0)}
                  </span>
                  <span className="legend-pill">
                    <span className="legend-box" style={{ background: 'var(--accent)' }} />
                    视频 {fileSize(usage?.byType?.video ?? 0)}
                  </span>
                  <span className="muted small">配额为上限，实际受全局预算闸门约束</span>
                </div>
                {usage?.budget && (
                  <div className={`notice ${usage.budget.level === 'normal' ? '' : 'notice-warn'}`} style={{ marginTop: 12 }}>
                    <span>¥</span>
                    <div>
                      内测期外部成本 ¥{usage.budget.spentCny} / ¥{usage.budget.capCny}（{usage.budget.ratio}%）。
                      {usage.budget.message || '当前为小范围内测，存储按预算限量；不承诺 50GB 全部可用。'}
                    </div>
                  </div>
                )}
                <p className="muted small" style={{ marginTop: 10, lineHeight: 1.7 }}>
                  配额口径：720p 转码产物 + 封面 + 30 天内暂存原件的计费用量，按资产去重。删除后 24 小时内释放。
                  单用户日上传 ≤500MB，视频单文件 ≤200MB / ≤3 分钟。
                </p>
              </div>

              <div className="settings-block">
                <div className="between" style={{ marginBottom: 10 }}>
                  <h3>媒体库</h3>
                  <span className="muted small">{media.length} 个资产</span>
                </div>
                {media.length === 0 ? (
                  <p className="muted small">还没有上传媒体。可以在训练详情或文章中上传。</p>
                ) : (
                  <div className="media-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
                    {media.map((item) => (
                      <div key={item.id} className="media-thumb" title={item.originalName}>
                        <img src={item.thumbUrl ?? item.url ?? ''} alt={item.originalName} loading="lazy" />
                        {item.type === 'video' && <span className="media-tag">▶ 视频</span>}
                        {item.watermark && <span className="media-tag" style={{ left: 'auto', right: 4 }}>练迹</span>}
                        <button className="media-remove" onClick={() => setDeleteMedia(item)} aria-label="删除">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {media.some((item) => item.type === 'video' && item.watermark) && (
                  <div style={{ marginTop: 14 }}>
                    <div className="eyebrow">带水印视频</div>
                    {media
                      .filter((item) => item.type === 'video' && item.watermark)
                      .map((item) => (
                        <div key={item.id} className="between" style={{ padding: '6px 0', fontSize: 12 }}>
                          <span className="truncate" style={{ maxWidth: 240 }}>
                            {item.originalName}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                await api.post(`/api/media/${item.id}/watermark-undo`);
                                toast('已撤销水印（每个视频限 1 次，已消耗一次转码）', 'success');
                                loadMedia();
                              } catch (err) {
                                toast(errorMessage(err), 'error');
                              }
                            }}
                          >
                            撤销水印
                          </Button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}

          {section === 'account' && (
            <>
              <div className="settings-block">
                <h3 style={{ marginBottom: 4 }}>数据导出</h3>
                <p className="muted small" style={{ marginBottom: 12 }}>
                  导出训练 / 组 / 打卡 / 身体数据（CSV）与文章块结构、媒体清单（JSON），下载链接 7 天有效。
                </p>
                <Button variant="outline" onClick={() => navigate('/data?tab=export')}>
                  前往导出
                </Button>
              </div>

              <div className="settings-block">
                <h3 style={{ marginBottom: 4 }}>账号注销</h3>
                <p className="muted small" style={{ marginBottom: 12 }}>
                  注销后有 30 天撤销期，到期彻底删除账号与全部媒体（原件与转码产物）。训练与内容不可恢复。
                </p>
                {user.status === 'pending_deletion' ? (
                  <div className="notice notice-warn" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <strong>账号注销申请中</strong>
                    <span>
                      申请于 {formatDate(user.deleteRequestedAt)}，可在 30 天内撤销。
                    </span>
                    <Button size="sm" variant="outline" onClick={cancelDelete}>
                      撤销注销
                    </Button>
                  </div>
                ) : (
                  <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                    申请注销账号
                  </Button>
                )}
              </div>

              <div className="settings-block">
                <h3 style={{ marginBottom: 10 }}>登录</h3>
                <div className="setting-row">
                  <div className="label">
                    <strong>当前账号</strong>
                    <span>{user.phone ? user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '微信账号'}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await signOut();
                      navigate('/login');
                    }}
                  >
                    退出登录
                  </Button>
                </div>
              </div>

              <div className="settings-block">
                <h3 style={{ marginBottom: 6 }}>关于练迹</h3>
                <p className="muted small" style={{ lineHeight: 1.8 }}>
                  版本 v1.3 · Web 端与小程序端同一账号（手机号绑定）。本产品不提供付费、商城或医疗健康服务；
                  身体数据仅呈现，不做健康结论。内容审核为“机审外采 + 人审自建”。
                </p>
                <Link to="/community" className="small" style={{ color: 'var(--accent)' }}>
                  社区能力说明 →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal open={privacyOpen} onClose={() => setPrivacyOpen(false)} title={privacy?.title ?? '隐私政策与用户协议'} width={600}>
        <div className="stack-sm">
          <p className="muted small">
            版本 {privacy?.version ?? '1.0'} · 更新于 {privacy?.updatedAt ?? '2026-10-18'}
          </p>
          <p className="small" style={{ lineHeight: 1.7 }}>{privacy?.summary}</p>
          {(privacy?.sections ?? []).map((item: any) => (
            <div key={item.title} style={{ marginTop: 8 }}>
              <strong style={{ fontSize: 13 }}>{item.title}</strong>
              <p className="muted small" style={{ marginTop: 2, lineHeight: 1.75 }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="申请注销账号？"
        message="注销后 30 天内可撤销；到期将彻底删除账号、训练记录、文章与全部媒体文件，且不可恢复。建议先导出数据。"
        confirmText="申请注销"
        danger
        onConfirm={requestDelete}
        onCancel={() => setDeleteOpen(false)}
      />
      <ConfirmDialog
        open={!!deleteMedia}
        title="删除这个媒体？"
        message={`「${deleteMedia?.originalName ?? ''}」将从媒体库移除，引用它的文章与训练记录会显示占位。配额将在 24 小时内释放。`}
        confirmText="删除"
        danger
        onConfirm={removeMedia}
        onCancel={() => setDeleteMedia(null)}
      />
    </div>
  );
}
