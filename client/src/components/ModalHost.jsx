import React, { useState, useEffect } from 'react';
import { useApp } from '../state/AppState.jsx';
import { useAuth } from '../state/Auth.jsx';
import { ref, get } from 'firebase/database';
import { db } from '../lib/firebase.js';

export default function ModalHost() {
  const { modal, setModal, showToast } = useApp();
  if (!modal) return null;
  function close() { setModal(null); }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {modal.type === 'createGuild' && <CreateGuildModal close={close} />}
        {modal.type === 'joinGuild' && <JoinGuildModal code={modal.code} close={close} />}
        {modal.type === 'invite' && <InviteModal guild={modal.guild} close={close} />}
        {modal.type === 'createChannel' && <CreateChannelModal guild={modal.guild} categoryId={modal.categoryId} close={close} />}
        {modal.type === 'createCategory' && <CreateCategoryModal guild={modal.guild} close={close} />}
        {modal.type === 'deleteGuild' && <DeleteGuildModal guild={modal.guild} close={close} />}
        {modal.type === 'settings' && <UserSettingsModal close={close} />}
        {modal.type === 'profile' && <ProfileModal user={modal.user} close={close} />}
        {modal.type === 'leaveGuild' && <LeaveGuildModal guild={modal.guild} close={close} />}
      </div>
    </div>
  );
}

function ModalHeader({ title, close }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-black/30">
      <h2 className="text-white font-bold text-lg">{title}</h2>
      <button onClick={close} className="text-flex-muted hover:text-white text-xl leading-none">✕</button>
    </div>
  );
}

function CreateGuildModal({ close }) {
  const { createGuild } = useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try { await createGuild(name.trim()); close(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  return (
    <>
      <ModalHeader title="Create a server" close={close} />
      <div className="p-5">
        <p className="text-flex-muted text-sm mb-3">Your server is where you and your friends hang out. Make yours and start talking. In P2P edition server data is stored in Firebase.</p>
        <label className="text-xs font-semibold text-flex-muted uppercase">Server Name</label>
        <input className="input mt-1" autoFocus value={name} onChange={e=>setName(e.target.value.slice(0,100))} placeholder="My Awesome Server" />
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn" onClick={close}>Back</button>
          <button className="btn-primary disabled:opacity-50" disabled={busy || !name.trim()} onClick={create}>Create</button>
        </div>
      </div>
    </>
  );
}

function JoinGuildModal({ close, code: initial = '' }) {
  const { joinInvite } = useApp();
  const [code, setCode] = useState(initial || '');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!code) { setPreview(null); return; }
    let t = setTimeout(async () => {
      try {
        const snap = await get(ref(db, `invites/${code.trim()}`));
        if (snap.exists()) {
          const inv = snap.val();
          const gSnap = await get(ref(db, `guilds/${inv.guildId}`));
          if (gSnap.exists()) setPreview(gSnap.val());
          else setPreview(null);
        } else setPreview(null);
      } catch { setPreview(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [code]);

  async function join() {
    if (!code.trim()) return;
    setBusy(true);
    try { await joinInvite(code.trim()); close(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <ModalHeader title="Присоединиться к серверу" close={close} />
      <div className="p-5">
        <label className="text-xs font-semibold text-flex-muted uppercase">Код приглашения</label>
        <input className="input mt-1" autoFocus value={code} onChange={e=>setCode(e.target.value)} placeholder="AbCd1234" />
        {preview && (
          <div className="mt-3 bg-flex-server rounded-md p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-flex-accent flex items-center justify-center text-white font-bold">
              {(preview.name[0]||'?').toUpperCase()}
            </div>
            <div>
              <div className="text-white font-semibold">{preview.name}</div>
              <div className="text-flex-muted text-xs">ID: {preview.id.slice(0,8)}…</div>
            </div>
          </div>
        )}
        <p className="text-xs text-flex-muted mt-2">Ссылка на приглашение: <span className="text-white">{location.origin + location.pathname.split('/').slice(0,2).join('/') + '/'}#/invite/{'{code}'}</span> — для GitHub Pages используйте hash-роут <code>/#/invite/CODE</code> или обычный путь с 404.html fallback.</p>
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn" onClick={close}>Отмена</button>
          <button className="btn-primary disabled:opacity-50" disabled={busy||!code.trim()} onClick={join}>Войти</button>
        </div>
      </div>
    </>
  );
}

function InviteModal({ guild, close }) {
  const { createInviteForGuild, showToast } = useApp();
  const [codes, setCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState('');

  useEffect(() => {
    // fetch existing invites for this guild
    (async () => {
      try {
        const snap = await get(ref(db, `guildInvites/${guild.id}`));
        if (snap.exists()) {
          const obj = snap.val();
          setCodes(Object.keys(obj));
          if (Object.keys(obj).length > 0) setNewCode(Object.keys(obj)[0]);
        }
      } catch {}
    })();
  }, [guild.id]);

  async function gen() {
    setBusy(true);
    try {
      const inv = await createInviteForGuild(guild.id);
      setCodes(prev => [...prev, inv.code]);
      setNewCode(inv.code);
      showToast('Приглашение создано');
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }

  const base = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
  // For GH Pages, base includes /Flex/
  const linkHash = `${base}#/invite/${newCode}`;
  const linkNormal = `${base}invite/${newCode}`;

  function copy(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Скопировано'));
  }

  return (
    <>
      <ModalHeader title={`Invite friends to ${guild.name}`} close={close} />
      <div className="p-5">
        <p className="text-flex-muted text-sm mb-2">Поделитесь кодом приглашения. Для GitHub Pages используйте hash-ссылку — она гарантированно работает без 404.</p>
        <div className="flex gap-2 mb-3">
          <input className="input flex-1" readOnly value={newCode} placeholder="Нажмите 'Создать приглашение'" onFocus={e=>e.target.select()} />
          <button className="btn-secondary" onClick={()=>copy(newCode)} disabled={!newCode}>Copy code</button>
        </div>
        <div className="space-y-2 text-xs">
          <div>
            <div className="text-flex-muted">Hash invite (рекомендуется для GH Pages):</div>
            <div className="flex gap-2 mt-1">
              <input className="input flex-1 text-xs" readOnly value={newCode ? linkHash : ''} />
              <button className="btn-secondary text-xs" disabled={!newCode} onClick={()=>copy(linkHash)}>Copy</button>
            </div>
          </div>
          <div>
            <div className="text-flex-muted">Обычная ссылка (работает с 404.html fallback):</div>
            <div className="flex gap-2 mt-1">
              <input className="input flex-1 text-xs" readOnly value={newCode ? linkNormal : ''} />
              <button className="btn-secondary text-xs" disabled={!newCode} onClick={()=>copy(linkNormal)}>Copy</button>
            </div>
          </div>
        </div>
        <div className="flex justify-between mt-6">
          <button className="btn-secondary" onClick={gen} disabled={busy}>{busy ? '...' : 'Создать новое приглашение'}</button>
          <button className="btn-primary" onClick={close}>Готово</button>
        </div>
        {codes.length > 1 && (
          <div className="mt-4 text-xs text-flex-muted">
            Существующие коды: {codes.join(', ')}
          </div>
        )}
      </div>
    </>
  );
}

function CreateChannelModal({ guild, categoryId, close }) {
  const { createChannel } = useApp();
  const [type, setType] = useState('text');
  const [name, setName] = useState('');

  async function create() {
    if (!name.trim()) return;
    try { await createChannel(guild.id, { type, name, categoryId }); close(); }
    catch (e) { alert(e.message); }
  }

  return (
    <>
      <ModalHeader title="Create Channel" close={close} />
      <div className="p-5">
        <div className="flex gap-4 mb-4">
          <label className={`flex-1 p-3 rounded cursor-pointer border-2 ${type==='text' ? 'border-flex-accent bg-flex-hover' : 'border-transparent bg-flex-server'}`}>
            <input type="radio" name="ctype" className="hidden" checked={type==='text'} onChange={()=>setType('text')} />
            <div className="text-white font-semibold flex items-center gap-2"># Text</div>
            <div className="text-xs text-flex-muted">Send messages — realtime via Firebase</div>
          </label>
          <label className={`flex-1 p-3 rounded cursor-pointer border-2 ${type==='voice' ? 'border-flex-accent bg-flex-hover' : 'border-transparent bg-flex-server'}`}>
            <input type="radio" name="ctype" className="hidden" checked={type==='voice'} onChange={()=>setType('voice')} />
            <div className="text-white font-semibold flex items-center gap-2">🔊 Voice</div>
            <div className="text-xs text-flex-muted">P2P voice via WebRTC (STUN default)</div>
          </label>
        </div>
        <label className="text-xs font-semibold text-flex-muted uppercase">Channel Name</label>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xl text-flex-muted">{type==='voice' ? '🔊' : '#'}</span>
          <input className="input flex-1" autoFocus value={name} onChange={e=>setName(e.target.value.replace(/[^a-z0-9-_]/gi,'-'))} placeholder="new-channel" />
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn-primary disabled:opacity-50" disabled={!name.trim()} onClick={create}>Create Channel</button>
        </div>
      </div>
    </>
  );
}

function CreateCategoryModal({ guild, close }) {
  const { createCategory } = useApp();
  const [name, setName] = useState('');

  async function create() {
    if (!name.trim()) return;
    try { await createCategory(guild.id, name); close(); } catch (e) { alert(e.message); }
  }

  return (
    <>
      <ModalHeader title="Create Category" close={close} />
      <div className="p-5">
        <input className="input" autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Category Name" />
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn-primary disabled:opacity-50" disabled={!name.trim()} onClick={create}>Create</button>
        </div>
      </div>
    </>
  );
}

function DeleteGuildModal({ guild, close }) {
  const { deleteGuild } = useApp();
  async function doDelete() {
    if (!confirm(`Delete server ${guild.name}? This cannot be undone.`)) return;
    try { await deleteGuild(guild.id); close(); } catch (e) { alert(e.message); }
  }
  return (
    <>
      <ModalHeader title={`Delete ${guild.name}`} close={close} />
      <div className="p-5">
        <p className="text-sm text-flex-muted">Are you sure you want to delete <span className="text-white">{guild.name}</span>? This will delete all channels, messages and voice data.</p>
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn-danger" onClick={doDelete}>Delete Server</button>
        </div>
      </div>
    </>
  );
}

function LeaveGuildModal({ guild, close }) {
  const { leaveGuild } = useApp();
  async function doLeave() {
    try { await leaveGuild(guild.id); close(); } catch (e) { alert(e.message); }
  }
  return (
    <>
      <ModalHeader title={`Leave ${guild.name}`} close={close} />
      <div className="p-5">
        <p className="text-sm text-flex-muted">Leave <span className="text-white">{guild.name}</span>?</p>
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn-danger" onClick={doLeave}>Leave Server</button>
        </div>
      </div>
    </>
  );
}

function ProfileModal({ user, close }) {
  return (
    <>
      <div className="p-5">
        <div className="flex gap-3 items-center">
          <div className="avatar w-16 h-16 bg-flex-accent flex items-center justify-center font-bold text-xl">
            {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : (user.displayName?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <div className="text-white font-bold text-lg">{user.displayName}</div>
            <div className="text-flex-muted text-sm">@{user.username}</div>
          </div>
        </div>
        <div className="mt-4 bg-flex-server rounded p-3 text-sm">
          <div className="text-xs uppercase text-flex-muted font-semibold">About</div>
          <div className="text-flex-text mt-1">{user.aboutMe || 'No info'}</div>
          <div className="text-xs uppercase text-flex-muted font-semibold mt-3">Created</div>
          <div>{user.createdAt ? new Date(user.createdAt).toLocaleString() : '—'}</div>
        </div>
        <div className="flex justify-end mt-4">
          <button className="btn-primary" onClick={close}>Close</button>
        </div>
      </div>
    </>
  );
}

function UserSettingsModal({ close }) {
  const { user, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [about, setAbout] = useState(user?.aboutMe || '');

  async function save() {
    try {
      const { updateProfile } = await import('../lib/db.js');
      await updateProfile(user.id, { displayName, aboutMe: about });
      // update local cache
      close();
    } catch (e) { alert(e.message); }
  }

  return (
    <>
      <ModalHeader title="User Settings — P2P Edition" close={close} />
      <div className="p-5">
        <div className="text-sm text-flex-muted mb-3">Профиль хранится в Firebase Realtime Database. Аватар — пока только URL/dataURL (можно вставить позже).</div>
        <label className="text-xs font-semibold text-flex-muted uppercase">Display Name</label>
        <input className="input mt-1 mb-3" value={displayName} onChange={e=>setDisplayName(e.target.value.slice(0,32))} />
        <label className="text-xs font-semibold text-flex-muted uppercase">About Me</label>
        <textarea className="input mt-1 mb-3" rows={3} value={about} onChange={e=>setAbout(e.target.value.slice(0,280))} />
        <div className="flex justify-between mt-6">
          <button className="btn-danger" onClick={()=>{ logout(); close(); }}>Log Out</button>
          <div className="flex gap-2">
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
        <div className="mt-6 text-[11px] text-flex-muted bg-[#1e1f22] p-2 rounded">
          Памятка: голос P2P без TURN не всегда соединяет. Если в вашей сети не работает — добавьте TURN сервер в <code>VITE_ICE_SERVERS</code> secret и пересоберите.
        </div>
      </div>
    </>
  );
}
