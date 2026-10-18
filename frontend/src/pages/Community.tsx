import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { Button } from '../components/Ui';

export function Community() {
  const { config } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    api.post('/api/config/events', { name: 'reserved_page_view', props: { from: 'tab' } }).catch(() => undefined);
  }, []);

  return (
    <div className="community-page">
      <div className="community-mark">◍</div>
      <h1>社区 · 敬请期待</h1>
      <p>
        {config?.communityVisible
          ? config.communityNote || '社区功能正在规划中，暂未开放'
          : '社区入口当前未开放'}
      </p>
      <p className="muted small" style={{ maxWidth: 420, lineHeight: 1.8 }}>
        一期只保留入口，不做 feed、关注、点赞与评论。公开内容仍可通过单篇链接访问，欢迎继续记录与写作。
      </p>
      <div className="row" style={{ marginTop: 18 }}>
        <Button variant="outline" onClick={() => navigate(-1)}>
          返回
        </Button>
        <Button variant="primary" onClick={() => navigate('/posts')}>
          去看内容
        </Button>
      </div>
      <p className="muted" style={{ fontSize: 10.5, marginTop: 22 }}>
        入口点击次数会作为社区需求信号被统计（不含个人身份信息）。
      </p>
    </div>
  );
}
