import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { Button, Field, Input } from '../components/Ui';
import { ThemeToggle } from '../components/ThemeToggle';

export function Login() {
  const { user, signIn, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<'sms' | 'wechat'>('sms');
  const [phone, setPhone] = useState('13800000000');
  const [code, setCode] = useState('123456');
  const [devCode, setDevCode] = useState<string | null>('123456');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const from = (location.state as any)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;

  const afterLogin = async (data: any) => {
    await signIn(data.tokens, data.user);
    toast('登录成功', 'success');
    navigate(from, { replace: true });
  };

  const sendCode = async () => {
    setSending(true);
    try {
      const data = await api.post('/api/auth/sms/send', { phone }, { auth: false });
      if (data.devCode) setDevCode(data.devCode);
      toast('验证码已发送', 'success');
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((value) => {
          if (value <= 1) {
            clearInterval(timer);
            return 0;
          }
          return value - 1;
        });
      }, 1000);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  };

  const login = async () => {
    setLoading(true);
    try {
      const data = await api.post('/api/auth/sms/login', { phone, code }, { auth: false });
      await afterLogin(data);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const loginDemo = async (kind: 'demo' | 'admin') => {
    setLoading(true);
    try {
      const data = await api.post(kind === 'demo' ? '/api/auth/demo-login' : '/api/auth/admin-login', {}, { auth: false });
      await afterLogin(data);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const wechatLogin = async () => {
    setLoading(true);
    try {
      const data = await api.post('/api/auth/wechat/login', { code: `dev-${Date.now()}`, nickname: '微信训练者' }, { auth: false });
      await afterLogin(data);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <ThemeToggle className="auth-theme-toggle" />
      <section className="auth-hero">
        <div className="row" style={{ marginBottom: 26 }}>
          <span className="brand-mark">练</span>
          <strong style={{ letterSpacing: '-0.02em' }}>练迹 FitLog</strong>
        </div>
        <h1>
          练了三年，
          <br />
          终于翻得到
          <br />
          <em>那段时间怎么练的。</em>
        </h1>
        <p>
          以训练记录为地基，以图文视频内容为表达方式的个人健身成长档案。
          手机端记录与打卡，桌面端沉淀与复盘。
        </p>
        <div className="auth-points">
          <div className="auth-point">
            <strong>一组三次点击</strong>
            <span>记住上次重量与次数，热身组不计入容量。</span>
          </div>
          <div className="auth-point">
            <strong>数据直接写进文章</strong>
            <span>训练卡是引用，记录更新，文章里的数据同步更新。</span>
          </div>
          <div className="auth-point">
            <strong>打卡必须绑定训练</strong>
            <span>有记录才算打卡，连续天数与月历都可追溯。</span>
          </div>
          <div className="auth-point">
            <strong>内容默认私有</strong>
            <span>媒体私有读，签名链接 2 小时有效，发布需审核。</span>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="eyebrow">WELCOME BACK</div>
        <h2>登录练迹</h2>
        <p className="muted small">双端同一账号：手机号与微信绑定后指向同一个用户。</p>

        <div className="auth-tabs">
          <button className={tab === 'sms' ? 'active' : ''} onClick={() => setTab('sms')}>
            手机号验证码
          </button>
          <button className={tab === 'wechat' ? 'active' : ''} onClick={() => setTab('wechat')}>
            微信登录
          </button>
        </div>

        {tab === 'sms' ? (
          <div className="stack">
            <Field label="手机号">
              <Input
                value={phone}
                inputMode="numeric"
                maxLength={11}
                placeholder="请输入 11 位手机号"
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field label="短信验证码">
              <div className="code-row">
                <Input
                  value={code}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 位验证码"
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') login();
                  }}
                />
                <Button variant="outline" onClick={sendCode} loading={sending} disabled={phone.length !== 11 || countdown > 0}>
                  {countdown > 0 ? `${countdown}s` : '获取验证码'}
                </Button>
              </div>
            </Field>
            {devCode && <div className="dev-code">开发环境验证码：{devCode}（短信通道未接入时的兜底）</div>}
            <Button variant="primary" size="lg" loading={loading} onClick={login} disabled={phone.length !== 11 || code.length !== 6}>
              登录 / 注册
            </Button>
            <p className="login-note">
              未注册手机号将自动创建账号。登录即表示同意《隐私政策与用户协议》，我们只采集登录与训练所必需的信息。
            </p>
          </div>
        ) : (
          <div className="stack">
            <div className="notice notice-accent">
              <span>◍</span>
              <div>
                小程序登录需在微信内打开。当前 Web 环境提供模拟微信登录，用于验证双端同一账号的绑定逻辑。
              </div>
            </div>
            <Button variant="primary" size="lg" onClick={wechatLogin} loading={loading}>
              微信一键登录（模拟）
            </Button>
            <Button variant="outline" disabled>
              小程序扫码登录（待小程序上线）
            </Button>
          </div>
        )}

        <div className="auth-divider">或使用内置体验账号</div>
        <div className="login-accounts">
          <div className="login-account">
            <span>
              <b>演示账号</b> · 8 周训练数据 / 文章 / 打卡
            </span>
            <button onClick={() => loginDemo('demo')}>一键进入</button>
          </div>
          <div className="login-account">
            <span>
              <b>审核账号</b> · 审核队列 / 举报 / 看板
            </span>
            <button onClick={() => loginDemo('admin')}>一键进入</button>
          </div>
        </div>
      </section>
    </div>
  );
}
