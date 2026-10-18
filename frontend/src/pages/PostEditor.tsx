import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage, deviceId } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync } from '../lib/hooks';
import { formatNumber, formatDateLabel, relativeTime, visibilityLabel } from '../lib/format';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Pill,
  Select,
  Spinner,
  Switch,
  Textarea,
} from '../components/Ui';
import { MediaUploader } from '../components/MediaUploader';
import type { Block, Media, Post, SessionSummary, Exercise } from '../types';

const BLOCK_MENU: Array<{ type: Block['type']; label: string; hint: string; icon: string }> = [
  { type: 'paragraph', label: '正文', hint: '普通段落', icon: '¶' },
  { type: 'heading', label: '标题', hint: 'H2 / H3', icon: 'H' },
  { type: 'image', label: '图片', hint: '单图 · 比例 · alt', icon: '▣' },
  { type: 'gallery', label: '相册', hint: '2–9 张图片', icon: '▦' },
  { type: 'video', label: '视频', hint: '封面与播放控制', icon: '▶' },
  { type: 'quote', label: '引用', hint: '突出的一段话', icon: '❝' },
  { type: 'list', label: '列表', hint: '有序 / 无序', icon: '≡' },
  { type: 'todo', label: '待办', hint: '勾选清单', icon: '☑' },
  { type: 'divider', label: '分割线', hint: '分隔内容', icon: '—' },
  { type: 'embed', label: '嵌入卡片', hint: '训练 / 打卡 / 动作', icon: '▤' },
];

function makeBlock(type: Block['type']): Block {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `b-${Math.random().toString(36).slice(2)}`;
  const base = { id, type, version: 1 } as Block;
  switch (type) {
    case 'paragraph':
      return { ...base, props: { text: '' } };
    case 'heading':
      return { ...base, props: { level: 2, text: '' } };
    case 'quote':
      return { ...base, props: { text: '', cite: '' } };
    case 'list':
      return { ...base, props: { ordered: false, items: [''] } };
    case 'todo':
      return { ...base, props: { items: [{ text: '', done: false }] } };
    case 'image':
      return { ...base, props: { mediaId: '', caption: '', alt: '', ratio: 'original' } };
    case 'gallery':
      return { ...base, props: { mediaIds: [], caption: '' } };
    case 'video':
      return { ...base, props: { mediaId: '', caption: '' } };
    case 'embed':
      return { ...base, props: { embedType: 'session', refId: '' } };
    default:
      return { ...base, props: {} };
  }
}

export function PostEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, toast } = useApp();
  const creating = useRef(false);

  const [post, setPost] = useState<Post | null>(null);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [summary, setSummary] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [allowShare, setAllowShare] = useState(true);
  const [allowIndex, setAllowIndex] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [sidebarTab, setSidebarTab] = useState<'media' | 'embed' | 'versions'>('media');
  const [mediaList, setMediaList] = useState<Media[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<any>(null);
  const [mediaPicker, setMediaPicker] = useState<{ kind: 'image' | 'video' | 'gallery' } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<any>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(id ?? null);
  const stateRef = useRef({ title, blocks, summary, visibility, allowShare, allowIndex, readOnly, postId });

  stateRef.current = { title, blocks, summary, visibility, allowShare, allowIndex, readOnly, postId };

  /* --------------------------- 创建 / 载入 --------------------------- */
  useEffect(() => {
    if (id) {
      setPostId(id);
      void load(id);
      return;
    }
    if (creating.current) return;
    creating.current = true;
    const template = searchParams.get('template') ?? undefined;
    const sessionId = searchParams.get('sessionId');
    api
      .post('/api/posts', { template, title: '未命名文章', visibility: user?.defaultPostVisibility ?? 'private' })
      .then(async (created: Post) => {
        if (sessionId) {
          try {
            const session = await api.get<any>(`/api/sessions/${sessionId}`);
            const nextBlocks: Block[] = [
              { id: makeBlock('heading').id, type: 'heading', version: 1, props: { level: 2, text: '本次训练' } },
              { id: makeBlock('embed').id, type: 'embed', version: 1, props: { embedType: 'session', refId: sessionId } },
              { id: makeBlock('paragraph').id, type: 'paragraph', version: 1, props: { text: '' } },
            ];
            await api.patch(`/api/posts/${created.id}`, {
              title: session.title ? `${session.title} 复盘` : '训练复盘',
              blocks: nextBlocks,
            });
          } catch {
            /* ignore */
          }
        }
        navigate(`/posts/${created.id}/edit`, { replace: true });
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load(postIdValue: string) {
    setLoading(true);
    try {
      const data = await api.get<Post>(`/api/posts/${postIdValue}`);
      setPost(data);
      setTitle(data.title);
      setBlocks(data.blocks);
      setSummary(data.summary ?? '');
      setVisibility(data.visibility);
      setAllowShare(data.allowShare);
      setAllowIndex(data.allowIndex);
      setDirty(false);
      const lock = await api.post(`/api/posts/${postIdValue}/lock`, { device: deviceId() });
      if (lock.locked) {
        setReadOnly(true);
        setLockMessage(lock.message);
      } else {
        setReadOnly(false);
      }
      api
        .get('/api/media')
        .then((res: any) => setMediaList(res.items ?? []))
        .catch(() => undefined);
      loadVersions(postIdValue);
      setError(null);
      if (searchParams.get('publish') === '1') setPublishOpen(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const loadVersions = (postIdValue: string) => {
    api
      .get(`/api/posts/${postIdValue}/versions`)
      .then((res: any) => setVersions(res.items ?? []))
      .catch(() => undefined);
  };

  /* ----------------------------- 自动保存 ----------------------------- */
  const save = useCallback(async () => {
    const state = stateRef.current;
    if (!state.postId || state.readOnly) return;
    setSaveState('saving');
    try {
      const data = await api.patch<Post>(`/api/posts/${state.postId}`, {
        title: state.title.slice(0, 60),
        blocks: state.blocks,
        summary: state.summary,
        visibility: state.visibility,
        allowShare: state.allowShare,
        allowIndex: state.allowIndex,
        device: deviceId(),
      });
      setPost(data);
      setDirty(false);
      setSaveState('saved');
      setLastSavedAt(new Date().toISOString());
      loadVersions(state.postId);
    } catch (err) {
      setSaveState('error');
      toast(errorMessage(err), 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void save(), 2200);
    const interval = setInterval(() => void save(), 10000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [title, blocks, summary, visibility, allowShare, allowIndex, dirty, save]);

  useEffect(() => {
    return () => {
      if (stateRef.current.postId) {
        api.post(`/api/posts/${stateRef.current.postId}/unlock`, { device: deviceId() }).catch(() => undefined);
      }
    };
  }, []);

  /* ------------------------------ 块操作 ------------------------------ */
  const touch = () => setDirty(true);

  const updateBlock = (blockId: string, props: Record<string, any>) => {
    setBlocks((list) =>
      list.map((block) => (block.id === blockId ? { ...block, props: { ...block.props, ...props } } : block)),
    );
    touch();
  };

  const addBlock = (type: Block['type'], afterId?: string) => {
    const block = makeBlock(type);
    setBlocks((list) => {
      const index = afterId ? list.findIndex((item) => item.id === afterId) : list.length - 1;
      const next = [...list];
      next.splice(index + 1, 0, block);
      return next;
    });
    setFocusId(block.id);
    touch();
  };

  const removeBlock = (blockId: string) => {
    setBlocks((list) => {
      const index = list.findIndex((item) => item.id === blockId);
      const next = list.filter((item) => item.id !== blockId);
      const prev = list[index - 1];
      if (prev) setFocusId(prev.id);
      return next;
    });
    touch();
  };

  const moveBlock = (from: number, to: number) => {
    if (from === to) return;
    setBlocks((list) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    touch();
  };

  const replaceBlockType = (block: Block, type: Block['type']) => {
    setBlocks((list) =>
      list.map((item) => (item.id === block.id ? { ...item, ...makeBlock(type), id: block.id } : item)),
    );
    touch();
  };

  /* ------------------------------ 发布 ------------------------------ */
  const doPublish = async () => {
    if (!post) return;
    setPublishing(true);
    setPublishError(null);
    try {
      await save();
      const result = await api.post(`/api/posts/${post.id}/publish`, {
        visibility,
        allowShare,
        allowIndex,
        summary,
      });
      setPost(result.post);
      setDirty(false);
      setPublishOpen(false);
      if (result.deferred) {
        toast(result.message ?? '今日公开名额已用完，已保存为仅自己可见', 'error');
      } else if (visibility === 'private') {
        toast('已保存（仅自己可见）', 'success');
      } else {
        toast('已提交审核，通过前仅自己可见', 'success');
      }
    } catch (err) {
      setPublishError(err);
      if ((err as any)?.details?.hits) {
        toast('内容命中安全规则，请修改后重试', 'error');
      } else {
        toast(errorMessage(err), 'error');
      }
    } finally {
      setPublishing(false);
    }
  };

  const takeover = async () => {
    if (!post) return;
    try {
      await api.post(`/api/posts/${post.id}/takeover`, { device: deviceId() });
      setReadOnly(false);
      setLockMessage('');
      toast('已接管编辑', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const mediaById = useMemo(() => new Map(mediaList.map((item) => [item.id, item])), [mediaList]);
  const wordCount = useMemo(
    () =>
      blocks.reduce((sum, block) => {
        if (['paragraph', 'heading', 'quote'].includes(block.type)) return sum + (block.props.text ?? '').length;
        if (block.type === 'list') return sum + (block.props.items ?? []).join('').length;
        if (block.type === 'todo') return sum + (block.props.items ?? []).map((item: any) => item.text).join('').length;
        return sum;
      }, 0),
    [blocks],
  );

  if (loading && !post) return <Spinner label="正在载入文章" />;
  if (error && !post) return <div className="notice notice-danger">{error}</div>;
  if (!post) return null;

  return (
    <div>
      <div className="between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div className="row">
          <Link to="/posts" className="muted small">
            ← 内容
          </Link>
          <span className={`save-state ${saveState === 'saved' ? 'ok' : ''}`}>
            {saveState === 'saving'
              ? '保存中…'
              : saveState === 'error'
                ? '保存失败，请检查网络'
                : lastSavedAt
                  ? `已保存 ${relativeTime(lastSavedAt)}`
                  : '已保存'}
          </span>
          <span className="muted small">{blocks.length} 块 · {wordCount} 字</span>
        </div>
        <div className="row">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await save();
              window.open(`/p/${post.id}`, '_blank');
            }}
          >
            预览
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/posts')}>
            返回列表
          </Button>
          <Button variant="primary" size="sm" onClick={() => setPublishOpen(true)}>
            发布
          </Button>
        </div>
      </div>

      {readOnly && (
        <div className="notice notice-warn" style={{ marginBottom: 14 }}>
          <span>⚠</span>
          <div>
            <strong>{lockMessage || '该文章正在另一设备编辑'}</strong>，当前为只读模式。
          </div>
          <Button size="sm" variant="outline" style={{ marginLeft: 'auto' }} onClick={takeover}>
            接管编辑
          </Button>
        </div>
      )}

      {post.status === 'rejected' && post.reviewReason && (
        <div className="notice notice-danger" style={{ marginBottom: 14 }}>
          <span>⚠</span>
          <div>
            未通过审核：{post.reviewReason}。修改后可重新发布。
            {(post.status === 'rejected' || post.status === 'offline') && !post.appeal && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 8 }}
                onClick={async () => {
                  const reason = window.prompt('请说明申诉理由（5–500 字），审核主管将在 48 小时内复核。');
                  if (!reason) return;
                  try {
                    await api.post(`/api/posts/${post.id}/appeal`, { reason });
                    toast('申诉已提交', 'success');
                    load(post.id);
                  } catch (err) {
                    toast(errorMessage(err), 'error');
                  }
                }}
              >
                提交申诉
              </button>
            )}
            {post.appeal && <span className="small"> · 申诉{post.appeal.status === 'open' ? '审核中' : post.appeal.status === 'approved' ? '已通过' : '未通过'}</span>}
          </div>
        </div>
      )}

      <div className="post-editor">
        <div className="post-editor-main">
          <input
            className="post-title-input"
            value={title}
            maxLength={60}
            placeholder="文章标题（≤60 字）"
            onChange={(e) => {
              setTitle(e.target.value);
              touch();
            }}
            disabled={readOnly}
          />
          <div className="post-meta-bar">
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
              {post.status === 'draft' ? '草稿' : post.status === 'pending' ? '审核中' : post.status === 'published' ? '已发布' : post.status === 'rejected' ? '未通过' : '已下线'}
            </Pill>
            <Pill tone="muted">{visibilityLabel(visibility)}</Pill>
            {post.status === 'pending' && <span className="muted small">审核通过前仅自己可见</span>}
            {post.status === 'published' && (
              <button
                className="small"
                style={{ background: 'none', border: 0, color: 'var(--accent)', cursor: 'pointer' }}
                onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}/p/${post.id}`);
                  toast('公开链接已复制', 'success');
                }}
              >
                复制公开链接
              </button>
            )}
            {post.viewCount !== undefined && post.status === 'published' && (
              <span className="muted small">{post.viewCount} 次阅读（同设备同日计 1 次）</span>
            )}
          </div>

          <div className="block-list">
            {blocks.map((block, index) => (
              <div
                key={block.id}
                className="block-row"
                draggable={!readOnly}
                onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = Number(event.dataTransfer.getData('text/plain'));
                  if (!Number.isNaN(from)) moveBlock(from, index);
                }}
              >
                <div className="block-handle">
                  <button className="block-grip" title="拖拽排序" aria-label="拖拽排序">
                    ⠿
                  </button>
                  {!readOnly && (
                    <div className="block-tools">
                      <button className="block-tool" onClick={() => removeBlock(block.id)} title="删除块">
                        ✕
                      </button>
                    </div>
                  )}
                </div>
                <div className="block-content">
                  <BlockEditor
                    block={block}
                    readOnly={readOnly}
                    autoFocus={focusId === block.id}
                    mediaById={mediaById}
                    allMedia={mediaList}
                    onFocusHandled={() => setFocusId(null)}
                    onChange={(props) => updateBlock(block.id, props)}
                    onReplaceType={(type) => replaceBlockType(block, type)}
                    onEnter={() => addBlock('paragraph', block.id)}
                    onBackspaceEmpty={() => removeBlock(block.id)}
                    onOpenMedia={(kind) => setMediaPicker({ kind })}
                    onPickMedia={(media) => {
                      const target = blocks.find(
                        (item) =>
                          item.id === block.id &&
                          (item.type === 'gallery' ||
                            ((item.type === 'image' || item.type === 'video') && !item.props.mediaId)),
                      );
                      if (block.type === 'gallery') {
                        updateBlock(block.id, { mediaIds: [...(block.props.mediaIds ?? []), media.id].slice(0, 9) });
                      } else if (target) {
                        updateBlock(block.id, { mediaId: media.id });
                      }
                      setMediaPicker(null);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {!readOnly && (
            <div style={{ padding: '14px 0 0 34px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" variant="ghost" onClick={() => addBlock('paragraph')}>
                + 正文
              </Button>
              <Button size="sm" variant="ghost" onClick={() => addBlock('heading')}>
                + 标题
              </Button>
              <Button size="sm" variant="ghost" onClick={() => addBlock('image')}>
                + 图片
              </Button>
              <Button size="sm" variant="ghost" onClick={() => addBlock('embed')}>
                + 嵌入卡片
              </Button>
              <Button size="sm" variant="ghost" onClick={() => addBlock('divider')}>
                + 分割线
              </Button>
              <span className="muted small" style={{ alignSelf: 'center', marginLeft: 6 }}>
                在正文输入 / 可唤起块菜单
              </span>
            </div>
          )}
        </div>

        <aside className="editor-sidebar">
          <div className="sidebar-card">
            <div className="sidebar-tabs">
              <button className={sidebarTab === 'media' ? 'active' : ''} onClick={() => setSidebarTab('media')}>
                媒体库
              </button>
              <button className={sidebarTab === 'embed' ? 'active' : ''} onClick={() => setSidebarTab('embed')}>
                嵌入
              </button>
              <button className={sidebarTab === 'versions' ? 'active' : ''} onClick={() => setSidebarTab('versions')}>
                版本
              </button>
            </div>
            {sidebarTab === 'media' && (
              <div className="sidebar-body">
                <MediaUploader
                  compact
                  allowWatermark
                  onUploaded={async () => {
                    const res: any = await api.get('/api/media');
                    setMediaList(res.items ?? []);
                  }}
                />
                <div className="media-lib-grid" style={{ marginTop: 10 }}>
                  {mediaList.map((media) => (
                    <button
                      key={media.id}
                      className="media-lib-item"
                      title={media.originalName}
                      onClick={() => {
                        const type = media.type === 'video' ? 'video' : 'image';
                        const block = makeBlock(type);
                        block.props = { ...block.props, mediaId: media.id };
                        setBlocks((list) => [...list, block]);
                        setFocusId(block.id);
                        touch();
                      }}
                    >
                      <img src={media.thumbUrl ?? media.url ?? ''} alt={media.originalName} loading="lazy" />
                      {media.type === 'video' && <span className="media-tag">▶</span>}
                    </button>
                  ))}
                </div>
                {mediaList.length === 0 && <p className="muted small">还没有媒体。上传后可插入正文。</p>}
                <p className="muted small" style={{ marginTop: 10, fontSize: 10.5 }}>
                  插入后需在正文中选择具体图片；同一媒体被多篇文章引用只占 1 份配额。
                </p>
              </div>
            )}
            {sidebarTab === 'embed' && (
              <div className="sidebar-body">
                <EmbedSidebar
                  onInsert={(embedType, refId) => {
                    const block = makeBlock('embed');
                    block.props = { embedType, refId };
                    setBlocks((list) => [...list, block]);
                    setFocusId(block.id);
                    touch();
                  }}
                />
              </div>
            )}
            {sidebarTab === 'versions' && (
              <div className="sidebar-body">
                <Button
                  size="sm"
                  variant="outline"
                  style={{ width: '100%', marginBottom: 8 }}
                  onClick={async () => {
                    try {
                      const res: any = await api.post(`/api/posts/${post.id}/versions`);
                      setVersions(res.items ?? []);
                      toast('已创建手动快照', 'success');
                    } catch (err) {
                      toast(errorMessage(err), 'error');
                    }
                  }}
                >
                  创建快照
                </Button>
                {versions.length === 0 ? (
                  <p className="muted small">编辑 5 分钟后自动生成版本，最多保留 20 个。</p>
                ) : (
                  versions.map((version) => (
                    <div key={version.id} className="version-row">
                      <div className="between">
                        <b>{version.kind === 'manual' ? '手动快照' : '自动版本'}</b>
                        <button className="block-tool" onClick={() => setRestoreTarget(version)}>
                          恢复
                        </button>
                      </div>
                      <span>{new Date(version.createdAt).toLocaleString('zh-CN')} · {version.blockCount} 块</span>
                      {version.preview && <p className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{version.preview}</p>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="sidebar-card">
            <div className="sidebar-head">
              <span>发布设置</span>
              <Pill tone={visibility === 'private' ? 'muted' : visibility === 'public' ? 'accent' : 'info'}>
                {visibilityLabel(visibility)}
              </Pill>
            </div>
            <div className="sidebar-body">
              <Field label="可见性">
                <Select
                  value={visibility}
                  onChange={(e) => {
                    setVisibility(e.target.value);
                    touch();
                  }}
                  disabled={readOnly}
                >
                  <option value="private">仅自己</option>
                  <option value="unlisted">链接可见（不列出）</option>
                  <option value="public">公开</option>
                </Select>
              </Field>
              <div className="between" style={{ marginTop: 10 }}>
                <span className="field-label">允许生成分享卡</span>
                <Switch
                  checked={allowShare}
                  onChange={(value) => {
                    setAllowShare(value);
                    touch();
                  }}
                />
              </div>
              <div className="between" style={{ marginTop: 8 }}>
                <span className="field-label">允许搜索引擎收录</span>
                <Switch
                  checked={allowIndex}
                  onChange={(value) => {
                    setAllowIndex(value);
                    touch();
                  }}
                />
              </div>
              <p className="muted" style={{ fontSize: 10.5, marginTop: 10, lineHeight: 1.6 }}>
                公开与链接可见内容需通过机审与人审；公开名额每日 20 条，超出自动转仅自己可见。
              </p>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="发布文章"
        description="标题 ≤60 字、正文至少 1 个块；发布前会进行文本与媒体审核。"
        width={560}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={publishing} onClick={doPublish}>
              确认发布
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="可见性">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="private">仅自己</option>
              <option value="unlisted">链接可见（不列出，可被链接访问）</option>
              <option value="public">公开</option>
            </Select>
          </Field>
          <Field label="摘要" hint="用于分享卡与列表，可留空">
            <Textarea value={summary} rows={2} maxLength={200} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          <div className="between">
            <div>
              <strong style={{ fontSize: 13 }}>允许生成分享卡</strong>
              <p className="muted" style={{ fontSize: 11 }}>关闭后旧分享卡也不可访问</p>
            </div>
            <Switch checked={allowShare} onChange={setAllowShare} />
          </div>
          <div className="between">
            <div>
              <strong style={{ fontSize: 13 }}>允许搜索引擎收录</strong>
              <p className="muted" style={{ fontSize: 11 }}>关闭时公开页返回 noindex</p>
            </div>
            <Switch checked={allowIndex} onChange={setAllowIndex} />
          </div>
          <div className="notice notice-accent">
            <span>◉</span>
            <div>{visibility === 'private' ? '仅自己可见，无需公开名额。' : '提交后先机审；通过后进入人审队列，期间仅自己可见。审核通过才对外公开。'}</div>
          </div>
          {publishError?.details?.hits && (
            <div className="notice notice-danger" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <strong>内容命中规则，请修改后重试：</strong>
              {publishError.details.hits.slice(0, 5).map((hit: any, index: number) => (
                <span key={index} className="small">
                  {hit.category}（{hit.ruleCode}）· {hit.snippet}
                </span>
              ))}
            </div>
          )}
          {dirty && <p className="muted small">发布前会自动保存当前内容。</p>}
        </div>
      </Modal>

      <MediaPickerModal
        open={!!mediaPicker}
        kind={mediaPicker?.kind ?? 'image'}
        media={mediaList.filter((item) => (mediaPicker?.kind === 'video' ? item.type === 'video' : item.type === 'image'))}
        onClose={() => setMediaPicker(null)}
        onPick={(media) => {
          if (!mediaPicker) return;
          if (mediaPicker.kind === 'gallery') {
            const gallery = blocks.find((block) => block.type === 'gallery' && (block.props.mediaIds ?? []).length < 9);
            if (gallery) updateBlock(gallery.id, { mediaIds: [...(gallery.props.mediaIds ?? []), media.id].slice(0, 9) });
            else {
              const block = makeBlock('gallery');
              block.props.mediaIds = [media.id];
              setBlocks((list) => [...list, block]);
              touch();
            }
          } else {
            const block = blocks.find((item) => item.type === mediaPicker.kind && !item.props.mediaId);
            if (block) updateBlock(block.id, { mediaId: media.id });
          }
          setMediaPicker(null);
        }}
        onUploaded={async () => {
          const res: any = await api.get('/api/media');
          setMediaList(res.items ?? []);
        }}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        title="恢复到该版本？"
        message={`当前内容会被保存为一个新版本，然后回滚到 ${restoreTarget ? new Date(restoreTarget.createdAt).toLocaleString('zh-CN') : ''}。`}
        confirmText="恢复"
        onConfirm={async () => {
          if (!restoreTarget) return;
          try {
            const data = await api.post(`/api/posts/${post.id}/versions/${restoreTarget.id}/restore`);
            setTitle(data.title);
            setBlocks(data.blocks);
            setDirty(false);
            setRestoreTarget(null);
            toast('已恢复历史版本', 'success');
          } catch (err) {
            toast(errorMessage(err), 'error');
          }
        }}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}

/* ----------------------------- 块渲染 ----------------------------- */
function BlockEditor({
  block,
  readOnly,
  autoFocus,
  mediaById,
  allMedia,
  onFocusHandled,
  onChange,
  onReplaceType,
  onEnter,
  onBackspaceEmpty,
  onOpenMedia,
  onPickMedia,
}: {
  block: Block;
  readOnly: boolean;
  autoFocus: boolean;
  mediaById: Map<string, Media>;
  allMedia: Media[];
  onFocusHandled: () => void;
  onChange: (props: Record<string, any>) => void;
  onReplaceType: (type: Block['type']) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onOpenMedia: (kind: 'image' | 'video' | 'gallery') => void;
  onPickMedia: (media: Media) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const textProps = block.props;

  if (block.type === 'divider') {
    return <hr className="block-divider" />;
  }

  if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote') {
    const className = block.type === 'heading' ? (textProps.level === 3 ? 'h3' : 'h2') : block.type === 'quote' ? 'quote' : '';
    const placeholder =
      block.type === 'heading' ? (textProps.level === 3 ? '小标题' : '大标题') : block.type === 'quote' ? '写一段引用…' : '开始写正文，输入 / 插入内容…';
    const value = textProps.text ?? '';
    const query = value.startsWith('/') ? value.slice(1).trim() : '';
    const options = BLOCK_MENU.filter((item) => !query || item.label.includes(query) || item.type.includes(query));
    return (
      <div style={{ position: 'relative' }}>
        <AutoTextarea
          className={`block-textarea ${className}`}
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          autoFocus={autoFocus}
          onFocusHandled={onFocusHandled}
          onChange={(next) => {
            onChange({ text: next });
            const slash = next.startsWith('/');
            setMenuOpen(slash);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              setMenuOpen(false);
              onEnter();
            } else if (event.key === 'Backspace' && !value && !readOnly) {
              event.preventDefault();
              onBackspaceEmpty();
            } else if (event.key === 'Escape') {
              setMenuOpen(false);
            }
          }}
        />
        {!readOnly && menuOpen && (
          <div className="slash-menu">
            {options.length === 0 && <p className="muted small" style={{ padding: 8 }}>没有匹配的块</p>}
            {options.map((item) => (
              <button
                key={item.type}
                className="slash-item"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange({ text: '' });
                  setMenuOpen(false);
                  onReplaceType(item.type);
                }}
              >
                <span className="si-icon">{item.icon}</span>
                {item.label}
                <span>{item.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (block.type === 'list' || block.type === 'todo') {
    const items = block.type === 'list' ? block.props.items ?? [''] : block.props.items ?? [{ text: '', done: false }];
    const update = (next: any[]) => onChange({ items: next });
    return (
      <div className="block-list-editor">
        {items.map((item: any, index: number) => {
          const text = block.type === 'list' ? item : item.text;
          return (
            <div className="list-item-row" key={index}>
              {block.type === 'todo' ? (
                <input
                  type="checkbox"
                  checked={!!item.done}
                  style={{ marginTop: 10 }}
                  onChange={(e) => update(items.map((entry: any, i: number) => (i === index ? { ...entry, done: e.target.checked } : entry)))}
                />
              ) : (
                <span className="bullet">{block.props.ordered ? `${index + 1}.` : '•'}</span>
              )}
              <input
                type="text"
                value={text}
                placeholder="列表项"
                readOnly={readOnly}
                onChange={(e) =>
                  update(
                    items.map((entry: any, i: number) =>
                      i === index ? (block.type === 'list' ? e.target.value : { ...entry, text: e.target.value }) : entry,
                    ),
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (block.type === 'list') update([...items, '']);
                    else update([...items, { text: '', done: false }]);
                    setTimeout(() => {
                      const inputs = document.querySelectorAll<HTMLInputElement>('.block-list-editor input[type="text"]');
                      inputs[inputs.length - 1]?.focus();
                    }, 30);
                  } else if (event.key === 'Backspace' && !text && items.length > 1) {
                    event.preventDefault();
                    update(items.filter((_: any, i: number) => i !== index));
                  }
                }}
              />
              {!readOnly && items.length > 1 && (
                <button className="remove" onClick={() => update(items.filter((_: any, i: number) => i !== index))}>
                  ✕
                </button>
              )}
            </div>
          );
        })}
        {!readOnly && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => update(block.type === 'list' ? [...items, ''] : [...items, { text: '', done: false }])}
          >
            + 添加一项
          </button>
        )}
        {block.type === 'list' && !readOnly && (
          <button className="btn btn-ghost btn-sm" onClick={() => onChange({ ordered: !block.props.ordered })}>
            {block.props.ordered ? '改为无序' : '改为有序'}
          </button>
        )}
      </div>
    );
  }

  if (block.type === 'image') {
    const media = mediaById.get(block.props.mediaId);
    return (
      <figure style={{ margin: '10px 0' }}>
        {media ? (
          <div className="block-media">
            <img src={media.url ?? ''} alt={block.props.alt ?? ''} />
            <input
              className="block-media-caption"
              value={block.props.caption ?? ''}
              placeholder="图片说明（可选）"
              readOnly={readOnly}
              onChange={(e) => onChange({ caption: e.target.value })}
            />
          </div>
        ) : (
          <button className="block-placeholder-media" style={{ width: '100%' }} onClick={() => onOpenMedia('image')} disabled={readOnly}>
            ▣ 选择一张图片
          </button>
        )}
        {media && !readOnly && (
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onOpenMedia('image')}>
              更换图片
            </button>
            <input
              className="input"
              style={{ maxWidth: 220, padding: '5px 8px', fontSize: 11 }}
              value={block.props.alt ?? ''}
              placeholder="alt 文本（无障碍）"
              onChange={(e) => onChange({ alt: e.target.value })}
            />
            <select
              className="input select"
              style={{ width: 110, padding: '5px 8px', fontSize: 11 }}
              value={block.props.ratio ?? 'original'}
              onChange={(e) => onChange({ ratio: e.target.value })}
            >
              <option value="original">原始比例</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="16:9">16:9</option>
            </select>
          </div>
        )}
      </figure>
    );
  }

  if (block.type === 'gallery') {
    const ids: string[] = block.props.mediaIds ?? [];
    return (
      <figure style={{ margin: '10px 0' }}>
        <div className="media-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {ids.map((mediaId) => {
            const media = mediaById.get(mediaId);
            return (
              <div key={mediaId} className="media-thumb">
                <img src={media?.thumbUrl ?? media?.url ?? ''} alt="" />
                {!readOnly && (
                  <button
                    className="media-remove"
                    onClick={() => onChange({ mediaIds: ids.filter((item) => item !== mediaId) })}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          {!readOnly && ids.length < 9 && (
            <button className="block-placeholder-media" onClick={() => onOpenMedia('gallery')}>
              + 添加
            </button>
          )}
        </div>
        <input
          className="block-media-caption"
          value={block.props.caption ?? ''}
          placeholder="相册说明（可选）"
          readOnly={readOnly}
          onChange={(e) => onChange({ caption: e.target.value })}
        />
      </figure>
    );
  }

  if (block.type === 'video') {
    const media = mediaById.get(block.props.mediaId);
    return (
      <figure style={{ margin: '10px 0' }}>
        {media ? (
          <div className="block-media">
            <video src={media.url ?? ''} poster={media.thumbUrl ?? ''} controls preload="metadata" />
            <input
              className="block-media-caption"
              value={block.props.caption ?? ''}
              placeholder="视频说明（可选）"
              readOnly={readOnly}
              onChange={(e) => onChange({ caption: e.target.value })}
            />
          </div>
        ) : (
          <button className="block-placeholder-media" style={{ width: '100%' }} onClick={() => onOpenMedia('video')} disabled={readOnly}>
            ▶ 选择一个视频
          </button>
        )}
        {media && !readOnly && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => onOpenMedia('video')}>
            更换视频
          </button>
        )}
      </figure>
    );
  }

  if (block.type === 'embed') {
    return <EmbedBlockEditor block={block} readOnly={readOnly} onChange={onChange} />;
  }

  return <p className="muted small">不支持的块类型：{block.type}</p>;
}

function AutoTextarea({
  value,
  className,
  placeholder,
  readOnly,
  autoFocus,
  onFocusHandled,
  onChange,
  onKeyDown,
}: {
  value: string;
  className: string;
  placeholder: string;
  readOnly: boolean;
  autoFocus: boolean;
  onFocusHandled: () => void;
  onChange: (value: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const length = ref.current.value.length;
      ref.current.setSelectionRange(length, length);
      onFocusHandled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);
  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

/* --------------------------- 嵌入卡片编辑 --------------------------- */
function EmbedBlockEditor({
  block,
  readOnly,
  onChange,
}: {
  block: Block;
  readOnly: boolean;
  onChange: (props: Record<string, any>) => void;
}) {
  const { embedType, refId } = block.props;
  const [editing, setEditing] = useState(!refId);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [checkinDate, setCheckinDate] = useState(refId || new Date().toISOString().slice(0, 10));
  const preview = useAsync<any>(async () => {
    if (!refId || editing) return null;
    if (embedType === 'session') return api.get(`/api/sessions/${refId}`);
    if (embedType === 'exercise') return api.get(`/api/exercises/${refId}`);
    const month = refId.slice(0, 7);
    const res: any = await api.get(`/api/checkins?month=${month}`);
    const day = res.days?.find((item: any) => item.date === refId);
    return {
      date: refId,
      checkin: day?.checkin ?? null,
      days: (res.days ?? []).filter((item: any) => item.status !== 'none').map((item: any) => ({ date: item.date })),
      streak: res.summary?.streak ?? 0,
    };
  }, [refId, embedType, editing]);

  useEffect(() => {
    if (!editing) return;
    if (embedType === 'session' && sessions.length === 0) {
      api.get('/api/sessions?pageSize=20').then((res: any) => setSessions(res.items ?? [])).catch(() => undefined);
    }
    if (embedType === 'exercise' && exercises.length === 0) {
      api.get('/api/exercises').then((res: any) => setExercises(res.items ?? [])).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, embedType]);

  if (editing) {
    return (
      <div style={{ border: '1px dashed var(--border-strong)', borderRadius: 12, padding: 14 }}>
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <span className="eyebrow" style={{ margin: 0 }}>嵌入卡片</span>
          <div className="segmented" style={{ marginLeft: 'auto' }}>
            {[
              { value: 'session', label: '训练' },
              { value: 'checkin', label: '打卡' },
              { value: 'exercise', label: '动作' },
            ].map((item) => (
              <button
                key={item.value}
                className={embedType === item.value ? 'active' : ''}
                onClick={() => onChange({ embedType: item.value, refId: '' })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {embedType === 'session' && (
          <div className="embed-picker">
            {sessions.slice(0, 6).map((session) => (
              <button key={session.id} className="embed-option" onClick={() => { onChange({ embedType, refId: session.id }); setEditing(false); }}>
                <strong style={{ fontSize: 12.5 }}>{session.title || '训练记录'}</strong>
                <span>{session.localDate} · {session.volumeKg} kg · {session.itemCount} 个动作</span>
              </button>
            ))}
            {sessions.length === 0 && <p className="muted small">还没有训练记录。</p>}
          </div>
        )}
        {embedType === 'exercise' && (
          <div className="embed-picker">
            {exercises.slice(0, 8).map((exercise) => (
              <button key={exercise.id} className="embed-option" onClick={() => { onChange({ embedType, refId: exercise.id }); setEditing(false); }}>
                <strong style={{ fontSize: 12.5 }}>{exercise.name}</strong>
                <span>{exercise.primaryMuscle} · {exercise.equipment}</span>
              </button>
            ))}
          </div>
        )}
        {embedType === 'checkin' && (
          <div className="row">
            <Input type="date" value={checkinDate} onChange={(e) => setCheckinDate(e.target.value)} style={{ maxWidth: 180 }} />
            <Button size="sm" variant="primary" onClick={() => { onChange({ embedType, refId: checkinDate }); setEditing(false); }}>
              插入该日打卡
            </Button>
          </div>
        )}
        {readOnly && <p className="muted small">只读模式不可修改引用。</p>}
      </div>
    );
  }

  return (
    <div className="embed-card">
      <span className="embed-tag">数据引用 · {embedType === 'session' ? '训练' : embedType === 'checkin' ? '打卡' : '动作'}</span>
      <div className="embed-title">
        {embedType === 'session' ? '训练记录卡' : embedType === 'checkin' ? '打卡卡' : '动作卡'}
      </div>
      {preview.loading ? (
        <p className="muted small">正在读取引用数据…</p>
      ) : preview.data ? (
        embedType === 'session' ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{preview.data.title || '训练记录'}</div>
            <div className="embed-metrics">
              <div className="embed-metric">
                <b>{formatNumber(preview.data.volumeKg, 0)}</b>
                <span>容量 kg</span>
              </div>
              <div className="embed-metric">
                <b>{Math.round(preview.data.durationSec / 60)}</b>
                <span>分钟</span>
              </div>
              <div className="embed-metric">
                <b>{preview.data.itemCount}</b>
                <span>动作</span>
              </div>
              <div className="embed-metric">
                <b>{preview.data.setCount}</b>
                <span>组</span>
              </div>
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              {formatDateLabel(preview.data.localDate)} · 数据为引用，记录变动后卡片同步更新
            </p>
          </>
        ) : embedType === 'checkin' ? (
          <div>
            <div className="row" style={{ marginBottom: 8 }}>
              <b>{formatDateLabel(preview.data.date)}</b>
              <Pill tone={preview.data.checkin ? 'accent' : 'muted'}>{preview.data.checkin ? '已打卡' : '未打卡'}</Pill>
            </div>
            <div className="embed-calendar">
              {Array.from({ length: 35 }, (_, index) => {
                const day = index + 1;
                const date = `${preview.data.date.slice(0, 8)}${String(day).padStart(2, '0')}`;
                const active = preview.data.days?.some((item: any) => item.date === date);
                return (
                  <span key={day} className={active ? 'on' : ''} style={{ opacity: day > 31 ? 0 : 1 }}>
                    {day > 31 ? '' : day}
                  </span>
                );
              })}
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>连续打卡 {preview.data.streak} 天</p>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{preview.data.name}</div>
            <div className="embed-metrics" style={{ marginTop: 8 }}>
              <div className="embed-metric">
                <b>{preview.data.prs?.maxE1RM ? formatNumber(preview.data.prs.maxE1RM.value, 0) : '—'}</b>
                <span>估算 1RM kg</span>
              </div>
              <div className="embed-metric">
                <b>{preview.data.prs?.maxWeight ? formatNumber(preview.data.prs.maxWeight.weight, 0) : '—'}</b>
                <span>单组最大 kg</span>
              </div>
              <div className="embed-metric">
                <b>{preview.data.prs?.maxReps?.reps ?? '—'}</b>
                <span>单组最大次数</span>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="embed-deleted">引用数据不可用</div>
      )}
      {!readOnly && (
        <div className="row" style={{ marginTop: 10 }}>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            更换引用
          </Button>
        </div>
      )}
    </div>
  );
}

/* --------------------------- 嵌入侧栏 --------------------------- */
function EmbedSidebar({ onInsert }: { onInsert: (type: string, refId: string) => void }) {
  const sessions = useAsync<any>(() => api.get('/api/sessions?pageSize=8'), []);
  const exercises = useAsync<any>(() => api.get('/api/exercises'), []);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  return (
    <div className="stack-sm">
      <div className="eyebrow" style={{ margin: 0 }}>训练记录卡</div>
      {(sessions.data?.items ?? []).slice(0, 4).map((session: any) => (
        <button key={session.id} className="embed-option" onClick={() => onInsert('session', session.id)}>
          <strong style={{ fontSize: 12 }}>{session.title || '训练记录'}</strong>
          <span>{session.localDate} · {session.volumeKg} kg</span>
        </button>
      ))}
      <div className="eyebrow" style={{ margin: '6px 0 0' }}>打卡卡</div>
      <div className="row">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: '5px 8px', fontSize: 11 }} />
        <Button size="sm" variant="outline" onClick={() => onInsert('checkin', date)}>
          插入
        </Button>
      </div>
      <div className="eyebrow" style={{ margin: '6px 0 0' }}>动作卡</div>
      <select
        className="input select"
        style={{ fontSize: 12 }}
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) onInsert('exercise', e.target.value);
        }}
      >
        <option value="">选择动作…</option>
        {(exercises.data?.items ?? []).slice(0, 40).map((exercise: any) => (
          <option key={exercise.id} value={exercise.id}>
            {exercise.name}
          </option>
        ))}
      </select>
      <p className="muted" style={{ fontSize: 10.5, lineHeight: 1.6 }}>
        嵌入是数据引用而不是快照：训练补一组，文章里的容量会同步更新；引用的记录被删除时降级为占位说明。
      </p>
    </div>
  );
}

/* --------------------------- 媒体选择 --------------------------- */
function MediaPickerModal({
  open,
  kind,
  media,
  onClose,
  onPick,
  onUploaded,
}: {
  open: boolean;
  kind: 'image' | 'video' | 'gallery';
  media: Media[];
  onClose: () => void;
  onPick: (media: Media) => void;
  onUploaded: () => Promise<void>;
}) {
  return (
    <Modal open={open} onClose={onClose} title={kind === 'video' ? '选择视频' : '选择图片'} description="从媒体库选择，或先上传新文件。">
      <div className="stack">
        <MediaUploader compact onUploaded={onUploaded} />
        <div className="media-lib-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {media.map((item) => (
            <button key={item.id} className="media-lib-item" onClick={() => onPick(item)} title={item.originalName}>
              <img src={item.thumbUrl ?? item.url ?? ''} alt={item.originalName} loading="lazy" />
              {item.type === 'video' && <span className="media-tag">▶</span>}
            </button>
          ))}
        </div>
        {media.length === 0 && <p className="muted small">媒体库为空，先上传一个文件。</p>}
      </div>
    </Modal>
  );
}
