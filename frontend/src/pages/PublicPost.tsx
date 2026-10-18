import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync } from '../lib/hooks';
import { formatDate, formatNumber, relativeTime, visibilityLabel } from '../lib/format';
import { Avatar, Button, Card, Field, Modal, Pill, Select, Spinner, Textarea } from '../components/Ui';
import { ArticleBlocks } from '../components/ArticleBlocks';
import type { Post } from '../types';

const REPORT_REASONS = ['违法违规', '色情低俗', '人身攻击', '广告导流', '侵犯隐私', '其他'];

export function PublicPost() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const post = useAsync<Post>(() => api.get(`/api/public/posts/${id}`, { auth: !!user }), [id, user?.id]);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [shareCard, setShareCard] = useState<any>(null);

  useEffect(() => {
    if (post.data?.title) document.title = `${post.data.title} · 练迹 FitLog`;
    const robots = document.querySelector('meta[name="robots"]');
    if (post.data && !post.data.allowIndex) {
      if (!robots) {
        const meta = document.createElement('meta');
        meta.name = 'robots';
        meta.content = 'noindex, nofollow';
        document.head.appendChild(meta);
      }
    }
  }, [post.data]);

  const openShare = async () => {
    setShareOpen(true);
    if (!shareCard) {
      try {
        const data = await api.get(`/api/public/posts/${id}/share-card`, { auth: false });
        setShareCard(data);
      } catch (err) {
        toast(errorMessage(err), 'error');
      }
    }
  };

  const report = async () => {
    setSending(true);
    try {
      await api.post(`/api/public/posts/${id}/report`, { reason, detail }, { auth: !!user });
      toast('举报已提交，我们将在 24 小时内响应', 'success');
      setReportOpen(false);
      setDetail('');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  };

  if (post.loading && !post.data) return <Spinner label="正在打开公开页" />;

  if (post.error || !post.data) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Card style={{ maxWidth: 460, textAlign: 'center' }}>
          <div style={{ fontSize: 34, color: 'var(--muted-2)', marginBottom: 10 }}>◌</div>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>内容暂不可见</h2>
          <p className="muted small" style={{ lineHeight: 1.7 }}>
            {post.error ?? '内容可能正在审核中、未公开，或已被作者删除。'}
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
            <Link to={user ? '/posts' : '/login'} className="btn btn-primary btn-md">
              {user ? '返回我的内容' : '登录练迹'}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const data = post.data;

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ borderBottom: '1px solid var(--border)', backdropFilter: 'blur(14px)', position: 'sticky', top: 0, background: 'rgba(10,11,9,0.8)', zIndex: 20 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to={user ? '/' : '/login'} className="brand">
            <span className="brand-mark">练</span>
            <span>
              练迹 <small>FitLog</small>
            </span>
          </Link>
          <div className="row">
            <Button variant="outline" size="sm" onClick={openShare}>
              分享
            </Button>
            {user ? (
              <Link to="/" className="btn btn-primary btn-sm">
                打开练迹
              </Link>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm">
                登录
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="public-shell">
        {data.isOwner && (
          <div className="notice notice-accent" style={{ marginBottom: 20 }}>
            <span>◉</span>
            <div>
              这是你的内容（{data.status === 'pending' ? '审核中，仅自己可见' : visibilityLabel(data.visibility)}）。
              {data.viewCount !== null && data.viewCount !== undefined && ` 阅读数：${data.viewCount}（同设备同日计 1 次）`}
            </div>
            <Link to={`/posts/${data.id}/edit`} className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }}>
              编辑
            </Link>
          </div>
        )}

        <header className="article-head">
          <h1>{data.title}</h1>
          <div className="article-meta">
            <Avatar name={data.author?.nickname ?? '训练者'} src={data.author?.avatar} size={30} />
            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{data.author?.nickname}</strong>
            <span>·</span>
            <span>{formatDate(data.publishedAt ?? data.createdAt)}</span>
            {data.visibility === 'unlisted' && <Pill tone="info">链接可见</Pill>}
            {data.visibility === 'public' && <Pill tone="accent">公开</Pill>}
            {data.allowIndex ? null : <Pill tone="muted">不被收录</Pill>}
          </div>
        </header>

        {data.coverUrl && (
          <figure className="article-figure" style={{ marginTop: 0 }}>
            <img src={data.coverUrl} alt="" />
          </figure>
        )}

        <ArticleBlocks blocks={data.blocks} />

        <footer className="article-foot">
          <div className="row">
            <Avatar name={data.author?.nickname ?? '训练者'} src={data.author?.avatar} size={34} />
            <div>
              <strong style={{ fontSize: 13 }}>{data.author?.nickname}</strong>
              <div className="muted small">发布于 {formatDate(data.publishedAt ?? data.createdAt)}</div>
            </div>
          </div>
          <div className="row">
            <Button size="sm" variant="ghost" onClick={() => setReportOpen(true)}>
              举报
            </Button>
            <Button size="sm" variant="outline" onClick={openShare}>
              生成分享卡
            </Button>
          </div>
        </footer>

        <div className="notice" style={{ marginTop: 30 }}>
          <span>ⓘ</span>
          <div>
            页面内容由作者发布，数据来自作者本人训练记录。训练与身体数据仅供参考，不构成健康或医疗建议。
            内容已通过机审，并进入人工抽检流程。
          </div>
        </div>
      </main>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="分享卡" description="标题、封面、作者、关键数据与二维码" width={560}>
        {shareCard ? (
          <div className="stack">
            <div className="share-card">
              <div className="share-cover">
                {shareCard.coverUrl ? <img src={shareCard.coverUrl} alt="" /> : '练迹 · 训练记录与成长档案'}
              </div>
              <div className="share-body">
                <div style={{ minWidth: 0 }}>
                  <h3>{shareCard.title}</h3>
                  <p className="muted small">{shareCard.summary || '记录每一次训练，把数据写进文章。'}</p>
                  <div className="share-stats">
                    {shareCard.volumeKg != null && (
                      <div>
                        <b>{formatNumber(shareCard.volumeKg, 0)}</b>
                        <span>容量 kg</span>
                      </div>
                    )}
                    {shareCard.streak != null && (
                      <div>
                        <b>{shareCard.streak}</b>
                        <span>连续打卡</span>
                      </div>
                    )}
                    <div>
                      <b>{shareCard.author}</b>
                      <span>作者</span>
                    </div>
                  </div>
                </div>
                <div className="share-qr" dangerouslySetInnerHTML={{ __html: shareCard.qrSvg }} />
              </div>
            </div>
            <div className="row">
              <Button
                variant="primary"
                style={{ flex: 1 }}
                onClick={() => {
                  navigator.clipboard?.writeText(shareCard.url);
                  toast('分享链接已复制', 'success');
                }}
              >
                复制链接
              </Button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <Button
                  variant="outline"
                  onClick={() =>
                    navigator.share?.({ title: shareCard.title, url: shareCard.url }).catch(() => undefined)
                  }
                >
                  系统分享
                </Button>
              )}
            </div>
            <p className="muted small">二维码指向公开页，发到微信群后点开即可阅读全文。</p>
          </div>
        ) : (
          <Spinner label="正在生成分享卡" />
        )}
      </Modal>

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="举报内容"
        description="我们将在 24 小时内响应，涉及人身安全、未成年与诈骗类 2 小时内响应。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>
              取消
            </Button>
            <Button variant="danger" loading={sending} onClick={report}>
              提交举报
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="举报原因">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REPORT_REASONS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field label="补充说明" hint="可留空">
            <Textarea value={detail} rows={3} maxLength={500} onChange={(e) => setDetail(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <div style={{ textAlign: 'center', padding: '0 24px 40px', color: 'var(--muted-2)', fontSize: 11 }}>
        练迹 FitLog · {relativeTime(data.publishedAt ?? data.createdAt)}更新 · 内容问题可在页面底部举报
      </div>
    </div>
  );
}
