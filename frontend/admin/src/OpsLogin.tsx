import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '../../src/components/Ui';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { useOpsAuth } from './OpsAuth';
import { ops, type OpsSession } from './opsApi';

export function OpsLogin() {
  const { admin, signIn } = useOpsAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('FitLog@2026!');
  const [totp, setTotp] = useState('');
  const [devCode, setDevCode] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ops.get<{ totp: string }>('/auth/dev-code').then((data) => {
      setDevCode(data.totp);
      setTotp(data.totp);
    }).catch(() => undefined);
  }, []);

  if (admin) return <Navigate to="/" replace />;

  const finish = (session: OpsSession) => {
    signIn(session);
    const from = (location.state as any)?.from ?? '/';
    navigate(from, { replace: true });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = recoveryMode
        ? await ops.post<OpsSession>('/auth/recovery', { username, code: recoveryCode.trim() })
        : await ops.post<OpsSession>('/auth/login', { username, password, totp });
      finish(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const demo = async () => {
    setLoading(true);
    setError(null);
    try {
      finish(await ops.post<OpsSession>('/auth/demo'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '演示登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ops-login">
      <div className="ops-login-art">
        <div className="ops-login-brand"><span>练</span> FitLog Ops</div>
        <div>
          <div className="ops-login-eyebrow">OPERATIONS CONSOLE · V2.0</div>
          <h1>把“不敢改”<br />变成<em>“敢改且可撤回”。</em></h1>
          <p>动作库、官方内容、审核与配置，在同一套可追溯、可复核、可回滚的后台里完成。</p>
        </div>
        <div className="ops-login-points">
          <span>动作版本与影响评估</span>
          <span>官方内容单人复核</span>
          <span>双科目成本护栏</span>
        </div>
      </div>

      <div className="ops-login-panel">
        <div className="ops-login-panel-head">
          <span className="ops-eyebrow">INTERNAL ACCESS</span>
          <ThemeToggle />
        </div>
        <h2>登录运营后台</h2>
        <p className="muted small">独立账号体系，与前台用户物理隔离。</p>

        <form onSubmit={submit} className="ops-login-form">
          <Field label="后台账号">
            <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </Field>
          {recoveryMode ? (
            <Field label="一次性恢复码" hint="10 个恢复码用后即焚；用于密码与 TOTP 均丢失时">
              <Input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} placeholder="输入恢复码" autoComplete="one-time-code" />
            </Field>
          ) : (
            <>
              <Field label="密码">
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
              </Field>
              <Field label="动态验证码（TOTP）" hint={devCode ? `开发环境当前验证码：${devCode}` : '使用认证器 App 生成 6 位验证码'}>
                <Input value={totp} onChange={(event) => setTotp(event.target.value)} inputMode="numeric" maxLength={6} placeholder="6 位动态码" />
              </Field>
            </>
          )}
          {error && <div className="notice notice-danger" style={{ fontSize: 12 }}>{error}</div>}
          <Button variant="primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? '正在验证…' : recoveryMode ? '使用恢复码登录' : '进入后台'}
          </Button>
        </form>

        <div className="ops-login-divider"><span>开发环境</span></div>
        <div className="row" style={{ gap: 8 }}>
          <Button variant="outline" onClick={demo} disabled={loading} style={{ flex: 1 }}>演示登录</Button>
          <Button variant="ghost" onClick={() => setRecoveryMode((value) => !value)} style={{ flex: 1 }}>
            {recoveryMode ? '返回密码登录' : '使用恢复码'}
          </Button>
        </div>
        <p className="ops-login-hint">
          演示账号：<code>admin</code> / <code>FitLog@2026!</code>，TOTP 已自动填充。正式环境请立即更换凭据并离线保存恢复码。
        </p>
      </div>
    </div>
  );
}
