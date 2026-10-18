import { useRef, useState } from 'react';
import { errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { fileSize } from '../lib/format';
import { uploadMedia, validateFiles } from '../lib/upload';
import type { Media } from '../types';
import { Button, Switch } from './Ui';

interface Task {
  name: string;
  size: number;
  progress: number;
  phase: string;
  error?: string;
  controller: AbortController;
}

export function MediaUploader({
  onUploaded,
  compact = false,
  allowWatermark = false,
}: {
  onUploaded: (media: Media[]) => void | Promise<void>;
  compact?: boolean;
  allowWatermark?: boolean;
}) {
  const { config, toast } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [watermark, setWatermark] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = validateFiles(files);
    const nextTasks: Task[] = list.map((file) => ({
      name: file.name,
      size: file.size,
      progress: 0,
      phase: '准备中',
      controller: new AbortController(),
    }));
    setTasks((prev) => [...prev, ...nextTasks]);
    setBusy(true);
    const uploaded: Media[] = [];
    for (let index = 0; index < list.length; index++) {
      const file = list[index];
      const task = nextTasks[index];
      try {
        const result = await uploadMedia(file, {
          watermark: allowWatermark && watermark,
          signal: task.controller.signal,
          onProgress: (progress, phase) => {
            setTasks((prev) =>
              prev.map((item) => (item === task ? { ...item, progress, phase } : item)),
            );
          },
        });
        uploaded.push(result.media);
        setTasks((prev) => prev.filter((item) => item !== task));
      } catch (err) {
        const message = errorMessage(err);
        setTasks((prev) => prev.map((item) => (item === task ? { ...item, error: message } : item)));
        toast(message, 'error');
      }
    }
    setBusy(false);
    if (uploaded.length) {
      await onUploaded(uploaded);
      toast(`已上传 ${uploaded.length} 个媒体`, 'success');
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="stack-sm">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button type="button" className="upload-drop" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? '上传中，可继续浏览其它内容' : compact ? '+ 上传图片 / 视频' : '点击选择图片或视频（单次最多 9 个）'}
      </button>
      {allowWatermark && (
        <>
          <div className="between" style={{ fontSize: 11.5 }}>
            <span className="muted">视频加「{config?.brandWatermarkText ?? '练迹'}」水印（左上角，可撤销 1 次）</span>
            <Switch checked={watermark} onChange={setWatermark} />
          </div>
          {watermark && (
            <div className="watermark-preview" aria-label="水印预览">
              <span>{config?.brandWatermarkText ?? '练迹'}</span>
              <em>水印预览 · 距左/上 4%，文字高度为视频高度 4.5%</em>
            </div>
          )}
        </>
      )}
      {tasks.map((task, index) => (
        <div key={`${task.name}-${index}`} className="upload-item">
          <span className="grow" title={task.name}>
            {task.name} · {fileSize(task.size)}
          </span>
          {task.error ? (
            <span style={{ color: 'var(--danger)' }}>{task.error}</span>
          ) : (
            <>
              <span className="mono">{task.progress}%</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => task.controller.abort()}
                aria-label="取消上传"
              >
                ✕
              </button>
            </>
          )}
        </div>
      ))}
      <p className="muted" style={{ fontSize: 10.5, lineHeight: 1.6 }}>
        图片自动压缩至长边 ≤1920px、≤500KB；视频 ≤3 分钟 / ≤200MB；单日上传上限 500MB。
        {config?.budget.message ? ` ${config.budget.message}。` : ''}
      </p>
    </div>
  );
}
