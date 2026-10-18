export type WeightUnit = 'kg' | 'lb';
export type DistanceUnit = 'km' | 'mile';

const KG_TO_LB = 2.2046226;

export function weightValue(kg: number | null | undefined, unit: WeightUnit): number | null {
  if (kg === null || kg === undefined) return null;
  return unit === 'lb' ? Math.round(kg * KG_TO_LB * 10) / 10 : Math.round(kg * 10) / 10;
}

export function weightToKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? Math.round((value / KG_TO_LB) * 2) / 2 : Math.round(value * 2) / 2;
}

export function distanceValue(km: number | null | undefined, unit: DistanceUnit): number | null {
  if (km === null || km === undefined) return null;
  return unit === 'mile' ? Math.round((km / 1.609344) * 100) / 100 : Math.round(km * 100) / 100;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
}

export function formatTime(date: string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function relativeDate(date: string): string {
  const target = new Date(`${date}T00:00:00`).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  if (diff > 0 && diff < 7) return `${diff} 天前`;
  return formatDateLabel(date);
}

export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minute = 60000;
  if (ms < minute) return '刚刚';
  if (ms < 60 * minute) return `${Math.floor(ms / minute)} 分钟前`;
  if (ms < 24 * 60 * minute) return `${Math.floor(ms / (60 * minute))} 小时前`;
  if (ms < 7 * 24 * 60 * minute) return `${Math.floor(ms / (24 * 60 * minute))} 天前`;
  return formatDate(iso);
}

export function sessionTypeLabel(type: string): string {
  return (
    {
      strength: '力量',
      cardio: '有氧',
      stretch: '拉伸',
      other: '其他',
    } as Record<string, string>
  )[type] ?? type;
}

export function setTypeLabel(type: string): string {
  return (
    {
      normal: '普通',
      warmup: '热身',
      drop: '递减',
      superset: '超级组',
    } as Record<string, string>
  )[type] ?? type;
}

export function visibilityLabel(value: string): string {
  return (
    {
      private: '仅自己',
      unlisted: '链接可见',
      public: '公开',
    } as Record<string, string>
  )[value] ?? value;
}

export function postStatusLabel(value: string): string {
  return (
    {
      draft: '草稿',
      pending: '待审核',
      published: '已发布',
      rejected: '未通过',
      offline: '已下线',
    } as Record<string, string>
  )[value] ?? value;
}

export function fileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}
