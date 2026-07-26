import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../state/Auth.jsx';
import { useApp } from '../state/AppState.jsx';
import { isFirebaseConfigured } from '../lib/firebase.js';

export default function LoginPage() {
  const { login, register, isConfigured } = useAuth();
  const { setModal } = useApp();
  const [params] = useSearchParams();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inviteCode = params.get('invite');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') {
        if (!email || !password) throw new Error('Укажите email и пароль');
        await login(email, password);
      } else {
        if (!email || !username || !password) throw new Error('Заполните все поля');
        await register(email, username.toLowerCase(), password, displayName || username);
      }
      if (inviteCode) setTimeout(() => setModal({ type: 'joinGuild', code: inviteCode }), 300);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!isConfigured) {
    return <SetupScreen />;
  }

  return (
    <div className="h-full w-full flex items-center justify-center bg-flex-server">
      <div className="bg-flex-sidebar rounded-md shadow-2xl p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-flex-accent flex items-center justify-center text-white font-extrabold text-2xl">F</div>
          <div>
            <h1 className="text-2xl font-bold text-white">Flex — P2P Edition</h1>
            <p className="text-flex-muted text-sm">GitHub Pages + Firebase + WebRTC</p>
          </div>
        </div>

        {inviteCode && (
          <div className="bg-flex-accent/20 border border-flex-accent/40 text-indigo-200 text-sm p-3 rounded mb-4">
            Приглашение: <span className="font-bold">{inviteCode}</span>. Войдите или зарегистрируйтесь, чтобы присоединиться.
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded-md font-medium ${mode === 'login' ? 'bg-flex-accent text-white' : 'bg-flex-server text-flex-muted'}`}>Login</button>
          <button onClick={() => setMode('register')} className={`flex-1 py-2 rounded-md font-medium ${mode === 'register' ? 'bg-flex-accent text-white' : 'bg-flex-server text-flex-muted'}`}>Register</button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-flex-muted uppercase">Email <span className="text-flex-red">*</span></label>
            <input className="input mt-1" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" type="email" required />
          </div>
          {mode === 'register' && (
            <>
              <div>
                <label className="text-xs font-semibold text-flex-muted uppercase">Username <span className="text-flex-red">*</span></label>
                <input className="input mt-1" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} placeholder="lowercase latin, digits, - _ ~" required />
                <div className="text-[11px] text-flex-muted mt-1">От 2 до 32 символов, только a-z 0-9 - _ ~</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-flex-muted uppercase">Display name</label>
                <input className="input mt-1" value={displayName} onChange={e => setDisplayName(e.target.value.slice(0, 32))} placeholder="Shown in chat (any characters, up to 32)" />
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-semibold text-flex-muted uppercase">Password <span className="text-flex-red">*</span></label>
            <input type="password" className="input mt-1" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {err && <div className="text-flex-red text-sm break-words">{err}</div>}
          <button disabled={busy} className="btn-primary w-full">{busy ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create account'}</button>
          <div className="text-[11px] text-flex-muted text-center">
            Используется Firebase Authentication (Email/Password). Без бэкенда.
          </div>
        </form>

        <div className="mt-6 text-xs text-flex-muted">
          <div className="bg-[#1e1f22] p-3 rounded text-[11px] leading-relaxed">
            <div className="font-bold text-white mb-1">Как это работает (P2P версия):</div>
            • Тексты и серверы хранятся в Firebase Realtime Database.<br/>
            • Голос — напрямую между браузерами через WebRTC, без сервера.<br/>
            • Для локальной сети и большинства домашних Wi-Fi работает сразу.<br/>
            <span className="text-flex-yellow">В сетях с CGNAT/symmetric NAT без TURN может не соединить.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupScreen() {
  const missing = (typeof window !== 'undefined' && window.__FIREBASE_MISSING__) || null;
  return (
    <div className="h-full w-full flex items-center justify-center bg-flex-server p-4">
      <div className="bg-flex-sidebar rounded-md shadow-2xl p-8 w-full max-w-2xl">
        <h1 className="text-2xl font-bold text-white mb-2">Flex — требуется настройка Firebase</h1>
        <p className="text-flex-muted text-sm mb-4">
          Приложение собрано для GitHub Pages, но переменные окружения Firebase не заданы. Собрать без них нельзя — приложение должно показать этот экран, а не падать.
        </p>
        <div className="bg-[#1e1f22] p-4 rounded text-xs font-mono text-flex-muted mb-4">
          <div>Отсутствуют ENV:</div>
          <ul className="list-disc ml-5 mt-2">
            <li>VITE_FIREBASE_API_KEY</li>
            <li>VITE_FIREBASE_AUTH_DOMAIN</li>
            <li>VITE_FIREBASE_DATABASE_URL</li>
            <li>VITE_FIREBASE_PROJECT_ID</li>
            <li>VITE_FIREBASE_STORAGE_BUCKET</li>
            <li>VITE_FIREBASE_MESSAGING_SENDER_ID</li>
            <li>VITE_FIREBASE_APP_ID</li>
          </ul>
        </div>
        <div className="text-sm text-flex-text space-y-2">
          <p><b>Для владельца репозитория:</b></p>
          <ol className="list-decimal ml-5 space-y-1">
            <li>Создайте проект Firebase: <a className="text-blue-400 underline" href="https://console.firebase.google.com/" target="_blank">console.firebase.google.com</a></li>
            <li>Включите Email/Password Auth, создайте Realtime Database, вставьте Security Rules из <code>firebase-rules.json</code></li>
            <li>Скопируйте web config из Project Settings → Your apps</li>
            <li>Создайте GitHub Secrets в Settings → Secrets and variables → Actions с именами как выше</li>
            <li>В Settings → Pages выберите Source: GitHub Actions, запустите workflow</li>
            <li>Откройте <code>https://&lt;username&gt;.github.io/Flex/</code> — экран логина появится автоматически</li>
          </ol>
          <p className="text-flex-muted text-xs mt-4">
            Подробная инструкция в README.md разделе "Деплой статической P2P версии".
          </p>
        </div>
      </div>
    </div>
  );
}
