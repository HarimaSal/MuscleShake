import { formatDateLabel, formatDuration, formatNumber, sessionTypeLabel } from '../lib/format';
import type { Block, Media } from '../types';
import { Pill } from './Ui';

export function ArticleBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="article-body">
      {blocks.map((block) => (
        <ArticleBlock key={block.id} block={block} />
      ))}
    </div>
  );
}

function ArticleBlock({ block }: { block: Block }) {
  const props = block.props ?? {};
  switch (block.type) {
    case 'paragraph':
      return <p>{props.text}</p>;
    case 'heading':
      return props.level === 3 ? <h3>{props.text}</h3> : <h2>{props.text}</h2>;
    case 'quote':
      return (
        <blockquote>
          {props.text}
          {props.cite && <div style={{ fontSize: 12, color: 'var(--muted-2)', marginTop: 6 }}>—— {props.cite}</div>}
        </blockquote>
      );
    case 'list': {
      const items: string[] = props.items ?? [];
      return props.ordered ? (
        <ol>{items.map((item, index) => <li key={index}>{item}</li>)}</ol>
      ) : (
        <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
      );
    }
    case 'todo':
      return (
        <ul className="todo-read">
          {(props.items ?? []).map((item: any, index: number) => (
            <li key={index}>
              <span className={`box ${item.done ? 'on' : ''}`}>{item.done ? '✓' : ''}</span>
              <span style={{ opacity: item.done ? 0.6 : 1 }}>{item.text}</span>
            </li>
          ))}
        </ul>
      );
    case 'divider':
      return <hr />;
    case 'image': {
      const media: Media | undefined = props.media?.[0];
      if (!media) return null;
      const ratio = props.ratio === '1:1' ? '1 / 1' : props.ratio === '4:3' ? '4 / 3' : props.ratio === '16:9' ? '16 / 9' : undefined;
      return (
        <figure className="article-figure">
          <img
            src={media.url ?? media.thumbUrl ?? ''}
            alt={props.alt || props.caption || '训练图片'}
            loading="lazy"
            style={ratio ? { aspectRatio: ratio, objectFit: 'cover' } : undefined}
          />
          {props.caption && <figcaption>{props.caption}</figcaption>}
        </figure>
      );
    }
    case 'gallery': {
      const media: Media[] = props.media ?? [];
      if (!media.length) return null;
      return (
        <figure className="article-figure">
          <div className="article-gallery" style={{ gridTemplateColumns: media.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}>
            {media.map((item) => (
              <a key={item.id} href={item.url ?? undefined} target="_blank" rel="noreferrer">
                <img src={item.thumbUrl ?? item.url ?? ''} alt={props.caption || '训练相册'} loading="lazy" style={media.length === 1 ? { aspectRatio: 'auto' } : undefined} />
              </a>
            ))}
          </div>
          {props.caption && <figcaption>{props.caption}</figcaption>}
        </figure>
      );
    }
    case 'video': {
      const media: Media | undefined = props.media?.[0];
      if (!media) return null;
      return (
        <figure className="article-figure">
          <div style={{ position: 'relative', lineHeight: 0 }}>
            <video src={media.url ?? ''} poster={media.thumbUrl ?? ''} controls preload="metadata" playsInline />
            {media.watermark && (
              <span
                aria-label="练迹水印"
                style={{
                  position: 'absolute',
                  top: '4%',
                  left: '4%',
                  color: '#fff',
                  opacity: 0.9,
                  fontSize: 'clamp(13px, 2vw, 30px)',
                  fontWeight: 600,
                  textShadow: '0 0 1px rgba(0,0,0,0.35), 1px 1px 0 rgba(0,0,0,0.35), -1px -1px 0 rgba(0,0,0,0.35)',
                  pointerEvents: 'none',
                  letterSpacing: '0.02em',
                  lineHeight: 1.2,
                }}
              >
                {media.watermarkText || '练迹'}
              </span>
            )}
          </div>
          {props.caption && <figcaption>{props.caption}</figcaption>}
        </figure>
      );
    }
    case 'embed':
      return <EmbedCard block={block} />;
    default:
      return null;
  }
}

function EmbedCard({ block }: { block: Block }) {
  const data = block.props.data;
  if (!data || data.deleted) {
    return <div className="embed-deleted">{data?.message ?? '引用内容已删除'}</div>;
  }
  if (data.type === 'session') {
    return (
      <div className="embed-card">
        <span className="embed-tag">训练记录 · 引用</span>
        <div className="embed-title">{data.title || `${sessionTypeLabel(data.typeLabel)}训练`}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          {formatDateLabel(data.localDate)} · {formatDuration(data.durationSec)}
        </div>
        <div className="embed-metrics">
          <div className="embed-metric">
            <b>{formatNumber(data.volumeKg, 0)}</b>
            <span>容量 kg</span>
          </div>
          <div className="embed-metric">
            <b>{data.itemCount}</b>
            <span>动作</span>
          </div>
          <div className="embed-metric">
            <b>{data.setCount}</b>
            <span>组数</span>
          </div>
        </div>
        {data.exerciseNames?.length > 0 && (
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            {data.exerciseNames.slice(0, 5).join(' / ')}
            {data.exerciseNames.length > 5 ? ' …' : ''}
          </p>
        )}
      </div>
    );
  }
  if (data.type === 'checkin') {
    const activeDates = new Set((data.days ?? []).map((item: any) => item.date));
    const [year, month] = String(data.month).split('-').map(Number);
    const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return (
      <div className="embed-card">
        <span className="embed-tag">打卡 · 引用</span>
        <div className="embed-title">打卡月历</div>
        <div className="row" style={{ marginBottom: 10 }}>
          <b style={{ fontSize: 15 }}>{data.month}</b>
          <Pill tone="accent">连续 {data.streak} 天</Pill>
        </div>
        <div className="embed-calendar">
          {Array.from({ length: firstWeekday }, (_, index) => (
            <span key={`blank-${index}`} style={{ opacity: 0 }} />
          ))}
          {Array.from({ length: dayCount }, (_, index) => {
            const date = `${data.month}-${String(index + 1).padStart(2, '0')}`;
            return (
              <span key={date} className={activeDates.has(date) ? 'on' : ''}>
                {index + 1}
              </span>
            );
          })}
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          当月打卡 {data.days?.length ?? 0} 天
        </p>
      </div>
    );
  }
  if (data.type === 'exercise') {
    return (
      <div className="embed-card">
        <span className="embed-tag">动作 · 引用</span>
        <div className="embed-title">{data.primaryMuscle} · {data.equipment}</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{data.name}</div>
        {data.prs ? (
          <div className="embed-metrics">
            <div className="embed-metric">
              <b>{data.prs.maxE1RM ? formatNumber(data.prs.maxE1RM.value, 0) : '—'}</b>
              <span>估算 1RM kg</span>
            </div>
            <div className="embed-metric">
              <b>{data.prs.maxWeight ? formatNumber(data.prs.maxWeight.weight, 0) : '—'}</b>
              <span>单组最大 kg</span>
            </div>
            <div className="embed-metric">
              <b>{data.prs.maxReps?.reps ?? '—'}</b>
              <span>单组最大次数</span>
            </div>
          </div>
        ) : (
          <p className="muted small">作者尚未记录该动作数据</p>
        )}
      </div>
    );
  }
  return null;
}
