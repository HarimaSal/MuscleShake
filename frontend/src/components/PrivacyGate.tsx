import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { Button, Modal } from './Ui';

export function PrivacyGate() {
  const { user, me, loadMe, toast } = useApp();
  const [policy, setPolicy] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const open = !!user && me?.privacyAccepted === false;

  useEffect(() => {
    if (open && !policy) {
      api.get('/api/auth/privacy', { auth: false }).then(setPolicy).catch(() => setPolicy(null));
    }
  }, [open, policy]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={() => undefined}
      title="使用前请阅读隐私政策"
      description="我们只采集提供服务所必需的数据，你随时可以导出或注销。"
      width={560}
      footer={
        <Button
          variant="primary"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api.patch('/api/auth/me', { acceptPrivacy: true });
              await loadMe();
              toast('已同意隐私政策', 'success');
            } catch (err) {
              toast('操作失败，请稍后重试', 'error');
            } finally {
              setSaving(false);
            }
          }}
        >
          我已阅读并同意
        </Button>
      }
    >
      <div className="stack-sm">
        <p className="muted small">版本 {policy?.version ?? '1.0'} · 更新于 {policy?.updatedAt ?? '2026-10-18'}</p>
        {(policy?.sections ?? [
          { title: '我们采集什么', body: '手机号或微信标识、你主动填写的训练与身体数据、你上传的媒体。' },
          { title: '用途与边界', body: '仅用于登录、记录、统计与内容展示，不提供健康或医疗结论。' },
          { title: '你的权利', body: '可随时导出数据、修改可见性、关闭提醒或申请注销（30 天内可撤销）。' },
        ]).map((section: any) => (
          <div key={section.title} style={{ marginTop: 10 }}>
            <strong style={{ fontSize: 13 }}>{section.title}</strong>
            <p className="muted small" style={{ marginTop: 3, lineHeight: 1.7 }}>
              {section.body}
            </p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
