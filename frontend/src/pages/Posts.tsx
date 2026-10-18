import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync } from '../lib/hooks';
import { formatDate, postStatusLabel, relativeTime, visibilityLabel } from '../lib/format';
import { Button, Card, ConfirmDialog, EmptyState, Modal, Pill, Spinner, Tabs } from '../components/Ui';
import type { Post } from '../types';

const TEMPLATES = [
  { value: '', title: '空白文章', desc: '从零开始，自由组织块。' },
  { value: 'session-review', title: '单次训练复盘', desc: '预置标题、训练卡、感受与下次调整。' },
  { value: 'cycle-summary', title: '周期总结', desc: '适合周/月复盘，含打卡卡与计划。' },
  { value: 'exercise-guide', title: '动作讲解', desc: '动作要点、嵌入动作卡与常见错误。' },
];

export function Posts() {
  const navigate = useNavigate();
  const { toast } = useApp();
  const [tab, setTab] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Post | null>(null);

  const list = useAsync<{ items: Post[]; counts: Record<string, number> }>(
    () => api.get(`/api/posts?status=${tab}`),
    [tab],
  );

  const create = async (template: string) => {
    setCreating(true);
    try {
      const post = await api.post('/api/posts', { template: template || undefined, title: '未命名文章' });
      navigate(`/posts/${post.id}/edit`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.del(`/api/posts/${deleting.id}`);
      toast('文章已删除', 'success');
      setDeleting(null);
      list.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const unpublish = async (post: Post) => {
    try {
      await api.post(`/api/posts/${post.id}/unpublish`);
      toast('已下线，公开链接不再可访问', 'success');
      list.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const counts = list.data?.counts ?? {};

  return (
    <div>
      <div className="between" style={{ marginBottom: 18, alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">CONTENT</div>
          <h1 style={{ fontSize: 30 }}>内容</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            把训练数据写进文章。发布前需通过机审与人审，公开名额每日 20 条。
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          + 写文章
        </Button>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'all', label: '全部' },
          { value: 'draft', label: '草稿', count: counts.draft },
          { value: 'pending', label: '待审核', count: counts.pending },
          { value: 'published', label: '已发布', count: counts.published },
          { value: 'rejected', label: '未通过', count: counts.rejected },
          { value: 'offline', label: '已下线', count: counts.offline },
        ]}
      />

      <div className="stack" style={{ marginTop: 16 }}>
        {list.loading && !list.data ? (
          <Spinner label="正在读取内容" />
        ) : !list.data?.items.length ? (
          <Card>
            <EmptyState
              icon="✎"
              title={tab === 'all' ? '还没有文章' : '这个分组是空的'}
              description="从一次训练复盘开始，把真实数据嵌进文章。数据是引用，记录变了卡片也会更新。"
              action={
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  写第一篇
                </Button>
              }
            />
          </Card>
        ) : (
          list.data.items.map((post) => (
            <div key={post.id} className="post-card">
              <div className="post-cover">
                {post.coverUrl ? <img src={post.coverUrl} alt="" /> : '无封面'}
              </div>
              <div className="post-info">
                <h3>{post.title || '未命名文章'}</h3>
                <p>
                  {post.summary || `${post.blocks.length} 个块 · ${post.wordCount ?? 0} 字 · ${visibilityLabel(post.visibility)}`}
                </p>
                <div className="row wrap" style={{ gap: 6, marginTop: 7 }}>
                  <Pill
                    tone={
                      post.status === 'published'
                        ? 'accent'
                        : post.status === 'pending'
                          ? 'warn'
                          : post.status === 'rejected'
                            ? 'danger'
                            : 'muted'
                    }
                  >
                    {postStatusLabel(post.status)}
                    {post.reviewStatus === 'quota_deferred' ? ' · 名额顺延' : ''}
                  </Pill>
                  <Pill tone="muted">{visibilityLabel(post.visibility)}</Pill>
                  <span className="muted small">
                    更新于 {relativeTime(post.updatedAt)}
                    {post.status === 'published' && ` · ${post.viewCount ?? 0} 次阅读`}
                  </span>
                </div>
                {post.reviewReason && (
                  <p className="small" style={{ color: 'var(--danger)', marginTop: 6, whiteSpace: 'normal' }}>
                    {post.reviewReason}
                  </p>
                )}
              </div>
              <div className="post-tools">
                {post.status === 'published' && (
                  <Link to={`/p/${post.id}`} className="btn btn-ghost btn-sm" target="_blank">
                    公开页
                  </Link>
                )}
                <Button size="sm" variant="outline" onClick={() => navigate(`/posts/${post.id}/edit`)}>
                  编辑
                </Button>
                {(post.status === 'draft' || post.status === 'rejected') && (
                  <Button size="sm" variant="primary" onClick={() => navigate(`/posts/${post.id}/edit?publish=1`)}>
                    发布
                  </Button>
                )}
                {post.status === 'published' && (
                  <Button size="sm" variant="ghost" onClick={() => unpublish(post)}>
                    下线
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDeleting(post)}>
                  删除
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建文章"
        description="选择一个结构模板，创建后仍可自由调整块。"
        width={640}
      >
        <div className="template-grid">
          {TEMPLATES.map((template) => (
            <button key={template.value} className="template-card" disabled={creating} onClick={() => create(template.value)}>
              <strong>{template.title}</strong>
              <span>{template.desc}</span>
            </button>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 14 }}>
          块数据以统一 JSON 存储，双端渲染一致；不以 HTML 作为存储格式。
        </p>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="删除这篇文章？"
        message={`「${deleting?.title}」删除后公开链接失效。媒体资产不会自动删除，避免影响其它文章引用。`}
        confirmText="删除"
        danger
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
