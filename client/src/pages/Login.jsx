import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/Auth.jsx';
import { useApp } from '../state/AppState.jsx';

export default function LoginPage() {
  const { login, register } = useAuth();
  const { setModal } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('demo@flex.app');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('demo1234');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inviteCode = params.get('invite');

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      let me;
      if (mode === 'login') {
        me = await login(email, password);
      } else {
        if (!username.match(/^[a-z0-9\-_~]{2,32}$/)) throw new Error('Никнейм: 2-32 символа, только строчные латинские буквы/цифры, дефис, подчёркивание или тильда.');
        if (password.length < 6) throw new Error('Пароль минимум 6 символов.');
        me = await register(email, username, password, displayName || username);
      }
      if (inviteCode) setTimeout(() => setModal({ type: 'joinGuild', code: inviteCode }), 300);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="h-full w-full flex items-center justify-center bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%23404249%22/><circle cx=%2220%22 cy=%2220%22 r=%221%22 fill=%22%235865f2%22 opacity=%22.4%22/><circle cx=%2280%22 cy=%2270%22 r=%221.2%22 fill=%22%23eb459e%22 opacity=%22.35%22/><circle cx=%2255%22 cy=%2240%22 r=%22.8%22 fill=%22white%22 opacity=%22.1%22/></svg>')] bg-center bg-cover">
      <div className="bg-flex-sidebar rounded-md shadow-2xl p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-flex-accent flex items-center justify-center text-white font-extrabold text-2xl">F</div>
          <div>
            <h1 className="text-2xl font-bold text-white">Flex</h1>
            <p className="text-flex-muted text-sm">Chat for you and your friends</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded-md font-medium ${mode==='login' ? 'bg-flex-accent text-white' : 'bg-flex-server text-flex-muted'}`}>Login</button>
          <button onClick={() => setMode('register')} className={`flex-1 py-2 rounded-md font-medium ${mode==='register' ? 'bg-flex-accent text-white' : 'bg-flex-server text-flex-muted'}`}>Register</button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <>
              <div>
                <label className="text-xs font-semibold text-flex-muted uppercase">Username <span className="text-flex-red">*</span></label>
                <input className="input mt-1" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} placeholder="lowercase latin, digits, - _ ~" />
              </div>
              <div>
                <label className="text-xs font-semibold text-flex-muted uppercase">Display name</label>
                <input className="input mt-1" value={displayName} onChange={e => setDisplayName(e.target.value.slice(0, 32))} placeholder="Shown in chat (any characters, up to 32)" />
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-semibold text-flex-muted uppercase">Email or username</label>
            <input className="input mt-1" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus={mode==='login'} />
          </div>
          <div>
            <label className="text-xs font-semibold text-flex-muted uppercase">Password</label>
            <input type="password" className="input mt-1" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {err && <div className="text-flex-red text-sm">{err}</div>}
          <button disabled={busy} className="btn-primary w-full">{busy ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create account'}</button>
          {mode === 'login' && (
            <div className="text-xs text-flex-muted">
              Demo account pre-filled: <span className="text-white">demo@flex.app / demo1234</span>. Invite code: <span className="text-white">flex-demo</span>.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
