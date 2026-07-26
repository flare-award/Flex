import React, { useState } from 'react';
import { useApp } from '../state/AppState.jsx';
import { useAuth } from '../state/Auth.jsx';
import { api } from '../api.js';
import ColorPicker from './ColorPicker.jsx';

export default function ModalHost() {
  const { modal, setModal, refreshGuild, selectGuild, guilds, showToast, user, updateUser, refreshFriends, refreshDms } = useApp();
  const { logout } = useAuth();
  if (!modal) return null;

  function close() { setModal(null); }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {modal.type === 'createGuild' && <CreateGuildModal close={close} onCreated={async (g) => { await refreshGuild(g.id); selectGuild(g.id); close(); }} />}
        {modal.type === 'joinGuild' && <JoinGuildModal code={modal.code} close={close} onJoined={async (g) => { await refreshGuild(g.id); selectGuild(g.id); close(); }} />}
        {modal.type === 'invite' && <InviteModal guild={modal.guild} close={close} />}
        {modal.type === 'createChannel' && <CreateChannelModal guild={modal.guild} categoryId={modal.categoryId} close={close} onDone={async () => { await refreshGuild(modal.guild.id); close(); }} />}
        {modal.type === 'createCategory' && <CreateCategoryModal guild={modal.guild} close={close} onDone={async () => { await refreshGuild(modal.guild.id); close(); }} />}
        {modal.type === 'channelSettings' && <ChannelSettingsModal channel={modal.channel} guild={modal.guild} close={close} onDone={async () => { await refreshGuild(modal.guild.id); close(); }} />}
        {modal.type === 'guildSettings' && <GuildSettingsModal guild={modal.guild} close={close} onDone={async () => { await refreshGuild(modal.guild.id); close(); }} />}
        {modal.type === 'profile' && <ProfileModal user={modal.user} close={close} />}
        {modal.type === 'settings' && <UserSettingsModal close={close} />}
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

function CreateGuildModal({ close, onCreated }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try { const g = await api.createGuild(name.trim()); onCreated(g); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  return (
    <>
      <ModalHeader title="Create a server" close={close} />
      <div className="p-5">
        <p className="text-flex-muted text-sm mb-3">Your server is where you and your friends hang out. Make yours and start talking.</p>
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

function JoinGuildModal({ close, onJoined, code: initial = '' }) {
  const [code, setCode] = useState(initial || '');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  async function join() {
    if (!code.trim()) return;
    setBusy(true);
    try { const g = await api.joinInvite(code.trim()); onJoined(g); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  React.useEffect(() => {
    if (!code) { setPreview(null); return; }
    let t = setTimeout(async () => {
      try { const p = await api.lookupInvite(code.trim()); setPreview(p.guild); } catch { setPreview(null); }
    }, 400);
    return () => clearTimeout(t);
  }, [code]);
  return (
    <>
      <ModalHeader title="Присоединиться к серверу" close={close} />
      <div className="p-5">
        <label className="text-xs font-semibold text-flex-muted uppercase">Код приглашения</label>
        <input className="input mt-1" autoFocus value={code} onChange={e=>setCode(e.target.value)} placeholder="flex-home" />
        {preview && (
          <div className="mt-3 bg-flex-server rounded-md p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-flex-accent flex items-center justify-center text-white font-bold">
              {preview.icon ? <img src={preview.icon} className="w-full h-full object-cover rounded-full"/> : (preview.name[0]||'?').toUpperCase()}
            </div>
            <div>
              <div className="text-white font-semibold">{preview.name}</div>
              <div className="text-flex-muted text-xs">{preview.memberCount} участников</div>
            </div>
          </div>
        )}
        <p className="text-xs text-flex-muted mt-1">Ссылка на приглашение: <span className="text-white">/invite/код</span></p>
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn" onClick={close}>Отмена</button>
          <button className="btn-primary disabled:opacity-50" disabled={busy||!code.trim()} onClick={join}>Войти</button>
        </div>
      </div>
    </>
  );
}

function InviteModal({ guild, close }) {
  const code = guild.invites?.[0]?.code || '';
  const link = `${location.origin}/invite/${code}`;
  function copy() { navigator.clipboard.writeText(code); alert('Invite code copied: ' + code); }
  return (
    <>
      <ModalHeader title={`Invite friends to ${guild.name}`} close={close} />
      <div className="p-5">
        <p className="text-flex-muted text-sm mb-2">Share this invite code with friends. It never expires by default.</p>
        <div className="flex gap-2">
          <input className="input flex-1" readOnly value={code} onFocus={e=>e.target.select()} />
          <button className="btn-primary" onClick={copy}>Copy</button>
        </div>
        <div className="mt-2 text-xs text-flex-muted break-all">or send the link: {link}</div>
      </div>
    </>
  );
}

function CreateChannelModal({ guild, categoryId, close, onDone }) {
  const [type, setType] = useState('text');
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  async function create() {
    if (!name.trim()) return;
    await api.createChannel(guild.id, { type, name, categoryId, isPrivate });
    onDone();
  }
  return (
    <>
      <ModalHeader title="Create Channel" close={close} />
      <div className="p-5">
        <div className="flex gap-4 mb-4">
          <label className={`flex-1 p-3 rounded cursor-pointer border-2 ${type==='text' ? 'border-flex-accent bg-flex-hover' : 'border-transparent bg-flex-server'}`}>
            <input type="radio" name="ctype" className="hidden" checked={type==='text'} onChange={()=>setType('text')} />
            <div className="text-white font-semibold flex items-center gap-2"># Text</div>
            <div className="text-xs text-flex-muted">Send messages, images, GIFs, emoji</div>
          </label>
          <label className={`flex-1 p-3 rounded cursor-pointer border-2 ${type==='voice' ? 'border-flex-accent bg-flex-hover' : 'border-transparent bg-flex-server'}`}>
            <input type="radio" name="ctype" className="hidden" checked={type==='voice'} onChange={()=>setType('voice')} />
            <div className="text-white font-semibold flex items-center gap-2">🔊 Voice</div>
            <div className="text-xs text-flex-muted">Hang out together with voice, video, and screen share</div>
          </label>
        </div>
        <label className="text-xs font-semibold text-flex-muted uppercase">Channel Name</label>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xl text-flex-muted">{type==='voice' ? '🔊' : '#'}</span>
          <input className="input flex-1" autoFocus value={name} onChange={e=>setName(e.target.value.replace(/[^a-z0-9\-_]/gi,'-'))} placeholder="new-channel" />
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm">
          <input type="checkbox" checked={isPrivate} onChange={e=>setIsPrivate(e.target.checked)} /> Private channel
        </label>
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn-primary disabled:opacity-50" disabled={!name.trim()} onClick={create}>Create Channel</button>
        </div>
      </div>
    </>
  );
}

function CreateCategoryModal({ guild, close, onDone }) {
  const [name, setName] = useState('');
  return (
    <>
      <ModalHeader title="Create Category" close={close} />
      <div className="p-5">
        <input className="input" autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Category Name" />
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn-primary disabled:opacity-50" disabled={!name.trim()} onClick={async () => { await api.createCategory(guild.id, name); onDone(); }}>Create</button>
        </div>
      </div>
    </>
  );
}

function ChannelSettingsModal({ channel, guild, close, onDone }) {
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic || '');
  const [isPrivate, setIsPrivate] = useState(channel.isPrivate);
  const { user } = useAuth();
  const isOwner = guild.ownerId === user.id;
  return (
    <>
      <ModalHeader title={`Edit Channel — #${channel.name}`} close={close} />
      <div className="p-5 overflow-y-auto">
        <label className="text-xs font-semibold text-flex-muted uppercase">Channel Name</label>
        <input className="input mt-1 mb-3" value={name} onChange={e=>setName(e.target.value)} />
        <label className="text-xs font-semibold text-flex-muted uppercase">Topic</label>
        <input className="input mt-1 mb-3" value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Add a topic" />
        <label className="flex items-center gap-2 mb-3 text-sm">
          <input type="checkbox" checked={isPrivate} onChange={e=>setIsPrivate(e.target.checked)} /> Private channel
        </label>
        <div className="flex gap-2 justify-end mt-6">
          {isOwner && <button className="btn-danger mr-auto" onClick={async () => { if (!confirm('Delete this channel?')) return; await api.deleteChannel(channel.id); onDone(); }}>Delete Channel</button>}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn-primary" onClick={async () => { await api.updateChannel(channel.id, { name, topic, isPrivate }); onDone(); }}>Save</button>
        </div>
      </div>
    </>
  );
}

function GuildSettingsModal({ guild, close, onDone }) {
  const [name, setName] = useState(guild.name);
  const [icon, setIcon] = useState(null);
  const [banner, setBanner] = useState(null);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  async function save() {
    const fd = new FormData();
    if (name !== guild.name) fd.append('name', name);
    if (icon) fd.append('icon', icon);
    if (banner) fd.append('banner', banner);
    await api.updateGuild(guild.id, fd);
    onDone();
  }
  async function makeRole() {
    if (!newRoleName.trim()) return;
    await api.createRole(guild.id, { name: newRoleName });
    setNewRoleName(''); onDone();
  }
  return (
    <>
      <ModalHeader title={`Server Settings — ${guild.name}`} close={close} />
      <div className="p-5 overflow-y-auto">
        <label className="text-xs font-semibold text-flex-muted uppercase">Server Name</label>
        <input className="input mt-1 mb-3" value={name} onChange={e=>setName(e.target.value)} />
        <label className="text-xs font-semibold text-flex-muted uppercase block">Icon</label>
        <div className="flex items-center gap-3 my-2">
          <div className="w-16 h-16 rounded-2xl bg-flex-accent flex items-center justify-center overflow-hidden">
            {guild.icon && !icon && <img src={guild.icon} className="w-full h-full object-cover"/>}
            {icon && <img src={URL.createObjectURL(icon)} className="w-full h-full object-cover"/>}
            {!guild.icon && !icon && <span className="text-white font-bold text-xl">{name[0]?.toUpperCase()}</span>}
          </div>
          <input type="file" accept="image/png,image/jpeg,image/gif" onChange={e=>setIcon(e.target.files[0])} />
        </div>
        <label className="text-xs font-semibold text-flex-muted uppercase block mt-2">Banner</label>
        <input type="file" accept="image/png,image/jpeg,image/gif" onChange={e=>setBanner(e.target.files[0])} className="mb-3" />

        <div className="border-t border-black/30 my-4 pt-4">
          <button onClick={() => setRolesOpen(o => !o)} className="text-white font-semibold flex items-center justify-between w-full">
            Roles <span>{rolesOpen ? '▼' : '▶'}</span>
          </button>
          {rolesOpen && (
            <div className="mt-3 space-y-2">
              {guild.roles.map(r => (
                <div key={r.id} className="flex items-center gap-2 bg-flex-server p-2 rounded">
                  <span className="w-4 h-4 rounded-full" style={{background: r.color}} />
                  <span className="flex-1 text-white text-sm">{r.name}</span>
                  <input type="color" value={r.color} onChange={async e => { await api.updateRole(guild.id, r.id, { color: e.target.value }); onDone(); }} />
                </div>
              ))}
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="New role name" value={newRoleName} onChange={e=>setNewRoleName(e.target.value)} />
                <button className="btn-primary" onClick={makeRole}>Add</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </>
  );
}

function ProfileModal({ user: profileUser, close }) {
  const { user: me, refreshFriends } = useApp();
  const isMe = me.id === profileUser.id;
  const friends = useApp().friends;
  const fr = friends.find(f => f.user?.id === profileUser.id);
  async function addFriend() {
    try { await api.addFriend(profileUser.username); refreshFriends(); showToast?.('Friend request sent'); } catch (e) { alert(e.message); }
  }
  async function dm() {
    const dm = await api.createDm({ userId: profileUser.id });
    location.hash = '';
    window.location.href = `/channels/@me/${dm.id}`;
    close();
  }
  const banner = profileUser.banner;
  return (
    <>
      <div className="h-[120px] relative" style={{ background: banner ? `url(${banner}) center/cover` : `linear-gradient(135deg, ${profileUser.profileColor1||'#5865f2'}, ${profileUser.profileColor2||'#eb459e'})` }} />
      <div className="p-5 pt-0 relative">
        <div className="avatar w-[80px] h-[80px] border-[6px] border-flex-sidebar -mt-10 bg-flex-accent flex items-center justify-center text-3xl font-bold overflow-hidden">
          {profileUser.avatar ? <img src={profileUser.avatar} className="w-full h-full object-cover" /> : profileUser.displayName[0]?.toUpperCase()}
        </div>
        <div className="bg-flex-server rounded-md p-4 mt-3">
          <div className="text-white text-xl font-bold">{profileUser.displayName}</div>
          <div className="text-flex-muted text-sm">@{profileUser.username}</div>
          {profileUser.customStatus && <div className="mt-2 text-sm bg-black/30 rounded px-2 py-1 inline-block">{profileUser.customStatus}</div>}
          <div className="border-t border-black/30 my-3" />
          <div className="text-xs font-semibold text-flex-muted uppercase mb-1">About Me</div>
          <div className="text-sm whitespace-pre-wrap">{profileUser.aboutMe || 'No about me set.'}</div>
          <div className="text-xs font-semibold text-flex-muted uppercase mt-3 mb-1">Member Since</div>
          <div className="text-sm">{new Date(profileUser.createdAt).toLocaleDateString()}</div>
        </div>
        {!isMe && (
          <div className="flex gap-2 mt-3 justify-end">
            <button className="btn-secondary" onClick={dm}>Message</button>
            {!fr && <button className="btn-primary" onClick={addFriend}>Add Friend</button>}
            <button className="btn-secondary" onClick={() => { navigator.clipboard.writeText(profileUser.id); }}>Copy ID</button>
          </div>
        )}
        <button className="absolute top-2 right-2 text-white/80 hover:text-white text-xl" onClick={close}>✕</button>
      </div>
    </>
  );
}

function UserSettingsModal({ close }) {
  const { user, updateUser, logout } = useAuth();
  const { refreshFriends, refreshDms, showToast } = useApp();
  const [tab, setTab] = useState('account');
  const [displayName, setDisplayName] = useState(user.displayName);
  const [about, setAbout] = useState(user.aboutMe);
  const [username, setUsername] = useState(user.username);
  const [customStatus, setCustomStatus] = useState(user.customStatus);
  const [avatar, setAvatar] = useState(null);
  const [banner, setBanner] = useState(null);
  const [c1, setC1] = useState(user.profileColor1 || '#5865f2');
  const [c2, setC2] = useState(user.profileColor2 || '#eb459e');
  const [bc, setBc] = useState(user.bannerColor || '#1e1f22');
  async function save() {
    const fd = new FormData();
    if (displayName !== user.displayName) fd.append('displayName', displayName);
    if (about !== user.aboutMe) fd.append('aboutMe', about);
    if (username !== user.username) fd.append('username', username);
    if (customStatus !== user.customStatus) fd.append('customStatus', customStatus);
    fd.append('profileColor1', c1); fd.append('profileColor2', c2);
    fd.append('bannerColor', bc);
    if (avatar) fd.append('avatar', avatar);
    if (banner) fd.append('banner', banner);
    try {
      const u = await api.updateMe(fd);
      updateUser(u);
      showToast('Profile saved');
      close();
    } catch (e) { alert(e.message); }
  }
  return (
    <>
      <ModalHeader title="User Settings" close={close} />
      <div className="flex min-h-[500px]">
        <div className="w-48 bg-flex-server p-2 text-sm">
          {[
            ['account','My Account'],
            ['profile','User Profile'],
            ['appearance','Appearance'],
          ].map(([id,label]) => (
            <button key={id} onClick={()=>setTab(id)} className={`w-full text-left px-2 py-1.5 rounded ${tab===id ? 'bg-flex-active text-white' : 'text-flex-muted hover:bg-flex-hover/60 hover:text-white'}`}>{label}</button>
          ))}
          <button onClick={() => { logout(); close(); }} className="w-full text-left px-2 py-1.5 rounded text-flex-red hover:bg-flex-red/20 mt-4">Log Out</button>
        </div>
        <div className="flex-1 p-5 overflow-y-auto">
          {tab === 'account' && (
            <div>
              <h3 className="text-white font-bold mb-3">My Account</h3>
              <label className="text-xs font-semibold text-flex-muted uppercase">Display Name</label>
              <input className="input mt-1 mb-3" value={displayName} onChange={e=>setDisplayName(e.target.value.slice(0,32))} maxLength={32} />
              <label className="text-xs font-semibold text-flex-muted uppercase">Username</label>
              <input className="input mt-1 mb-1" value={username} onChange={e=>setUsername(e.target.value.toLowerCase())} />
              <div className="text-xs text-flex-muted mb-3">2-32 lowercase latin letters/digits/dash/underscore/tilde. Can be changed once every 15 minutes.</div>
              <label className="text-xs font-semibold text-flex-muted uppercase">Custom status</label>
              <input className="input mt-1 mb-3" value={customStatus} onChange={e=>setCustomStatus(e.target.value.slice(0,64))} />
              <label className="text-xs font-semibold text-flex-muted uppercase">About Me</label>
              <textarea className="input mt-1 mb-3" rows={3} value={about} onChange={e=>setAbout(e.target.value.slice(0,280))} />
              <div className="border-t border-black/30 my-3" />
              <div className="text-flex-muted text-sm mb-2">Email: <span className="text-white">{user.email || '—'}</span></div>
              <div className="flex gap-2 justify-end">
                <button className="btn" onClick={close}>Cancel</button>
                <button className="btn-primary" onClick={save}>Save Changes</button>
              </div>
            </div>
          )}
          {tab === 'profile' && (
            <div>
              <h3 className="text-white font-bold mb-3">User Profile</h3>
              <div className="rounded-md overflow-hidden mb-4">
                <div className="h-28 relative" style={{ background: banner ? `url(${URL.createObjectURL(banner)}) center/cover` : (user.banner ? `url(${user.banner}) center/cover` : bc) }} />
                <div className="p-3 pt-0 bg-flex-server">
                  <div className="avatar w-16 h-16 border-[5px] border-flex-server -mt-8 bg-flex-accent flex items-center justify-center text-xl font-bold overflow-hidden">
                    {avatar ? <img src={URL.createObjectURL(avatar)} className="w-full h-full object-cover"/> : (user.avatar ? <img src={user.avatar} className="w-full h-full object-cover"/> : displayName[0]?.toUpperCase())}
                  </div>
                </div>
              </div>
              <label className="text-xs font-semibold text-flex-muted uppercase">Avatar (10MB, png/jpg/gif)</label>
              <input type="file" accept="image/png,image/jpeg,image/gif" onChange={e=>setAvatar(e.target.files[0])} className="mb-3" />
              <label className="text-xs font-semibold text-flex-muted uppercase">Banner (10MB, 558×197 auto-cropped)</label>
              <input type="file" accept="image/png,image/jpeg,image/gif" onChange={e=>setBanner(e.target.files[0])} className="mb-3" />
              <label className="text-xs font-semibold text-flex-muted uppercase">Banner color (if no banner image)</label>
              <ColorPicker value={bc} onChange={setBc} />
              <label className="text-xs font-semibold text-flex-muted uppercase mt-4 block">Profile gradient</label>
              <div className="flex gap-2 items-center">
                <ColorPicker value={c1} onChange={setC1} />
                <span className="text-flex-muted">→</span>
                <ColorPicker value={c2} onChange={setC2} />
                <div className="h-8 flex-1 rounded" style={{ background: `linear-gradient(90deg, ${c1}, ${c2})` }} />
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <button className="btn" onClick={close}>Cancel</button>
                <button className="btn-primary" onClick={save}>Save Changes</button>
              </div>
            </div>
          )}
          {tab === 'appearance' && (
            <AppearanceTab close={close} />
          )}
        </div>
      </div>
    </>
  );
}

function AppearanceTab({ close }) {
  const { user, updateUser } = useAuth();
  const [theme, setTheme] = useState(user.theme || 'dark');
  const [customColor, setCustomColor] = useState(user.customColor || '#5865f2');
  function applyTheme(t) {
    setTheme(t);
    document.documentElement.classList.toggle('dark', t !== 'light');
    api.updateMe({ theme: t });
    updateUser({ ...user, theme: t });
  }
  return (
    <div>
      <h3 className="text-white font-bold mb-3">Appearance</h3>
      <div className="text-xs font-semibold text-flex-muted uppercase mb-2">Theme</div>
      <div className="flex gap-3 mb-4">
        {['dark','light','custom'].map(t => (
          <button key={t} onClick={() => applyTheme(t)} className={`w-32 rounded overflow-hidden border-2 ${theme===t ? 'border-flex-accent' : 'border-transparent'}`}>
            <div className={`h-16 ${t==='dark' ? 'bg-[#313338]' : t==='light' ? 'bg-white' : ''}`} style={t==='custom' ? {background: customColor} : {}} />
            <div className="py-1 bg-flex-sidebar text-white text-center text-sm capitalize">{t}</div>
          </button>
        ))}
      </div>
      {theme === 'custom' && <ColorPicker value={customColor} onChange={c => { setCustomColor(c); document.documentElement.style.setProperty('--flex-bg', c); }} />}
      <div className="text-xs font-semibold text-flex-muted uppercase mt-4 mb-2">Chat font scaling</div>
      <div className="text-sm text-flex-muted">15px (default) — can be adjusted in future updates.</div>
      <div className="flex justify-end mt-6">
        <button className="btn-primary" onClick={close}>Done</button>
      </div>
    </div>
  );
}
