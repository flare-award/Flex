import React, { useState } from 'react';
import { Routes, Route, NavLink, useNavigate, useParams } from 'react-router-dom';
import ServerSidebar from '../components/ServerSidebar.jsx';
import ChannelSidebar from '../components/ChannelSidebar.jsx';
import ChatView from '../components/ChatView.jsx';
import MemberList from '../components/MemberList.jsx';
import DMView from '../components/DMView.jsx';
import DMSidebar from '../components/DMSidebar.jsx';
import UserPanel from '../components/UserPanel.jsx';
import VoiceOverlay from '../components/VoiceOverlay.jsx';
import ModalHost from '../components/ModalHost.jsx';
import Toast from '../components/Toast.jsx';
import { useApp } from '../state/AppState.jsx';

export default function MainApp() {
  const { activeGuildId, activeChannelId, activeDmId, voice } = useApp();
  const isDM = activeGuildId === '@me' || !!activeDmId;

  return (
    <div className="h-full w-full flex flex-col bg-flex-server">
      <div className="flex flex-1 min-h-0">
        <ServerSidebar />
        {isDM ? (
          <>
            <DMSidebar />
            <div className="flex-1 flex flex-col min-w-0 bg-flex-bg">
              <Routes>
                <Route path="@me" element={<FriendsView />} />
                <Route path="@me/:dmId" element={<DMView />} />
                <Route path="*" element={<div />} />
              </Routes>
            </div>
          </>
        ) : (
          <>
            <ChannelSidebar />
            <div className="flex-1 flex flex-col min-w-0 bg-flex-bg">
              <Routes>
                <Route path=":guildId/:channelId" element={<ChatView />} />
                <Route path="*" element={
                  <div className="flex-1 flex items-center justify-center text-flex-muted">
                    Select a channel to start chatting
                  </div>
                } />
              </Routes>
            </div>
            {activeChannelId && <MemberList />}
          </>
        )}
      </div>
      {voice.channelId && <VoiceOverlay />}
      <ModalHost />
      <Toast />
    </div>
  );
}

function FriendsView() {
  const { friends, showToast, refreshFriends } = useApp();
  const [tab, setTab] = useState('online');
  const [addName, setAddName] = useState('');
  const accepted = friends.filter(f => f.status === 'accepted');
  const pending = friends.filter(f => f.status === 'pending');
  const incoming = pending.filter(f => f.direction === 'incoming');
  const outgoing = pending.filter(f => f.direction === 'outgoing');

  async function addFriend(e) {
    e.preventDefault();
    if (!addName.trim()) return;
    try {
      const { api } = await import('../api.js');
      await api.addFriend(addName.trim());
      setAddName('');
      refreshFriends();
      showToast('Friend request sent');
    } catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">Friends</h2>
          <div className="flex gap-2 text-sm">
            {['online','all','pending','blocked'].map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded ${tab===t ? 'bg-flex-accent text-white' : 'text-flex-muted hover:text-white'}`}>{t[0].toUpperCase()+t.slice(1)}</button>
            ))}
            <button className="px-3 py-1 rounded bg-flex-green text-white">Add Friend</button>
          </div>
        </div>
        <form onSubmit={addFriend} className="bg-flex-sidebar p-4 rounded-md mb-4">
          <label className="text-xs uppercase text-flex-green font-bold block mb-1">Add Friend</label>
          <p className="text-flex-muted text-sm mb-2">You can add friends with their Flex username (lowercase).</p>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="username" value={addName} onChange={e=>setAddName(e.target.value)} />
            <button className="btn-primary disabled:opacity-50" disabled={!addName.trim()}>Send Friend Request</button>
          </div>
        </form>

        {tab === 'pending' && (
          <section className="mb-6">
            <h3 className="text-xs uppercase font-bold text-flex-muted mb-2">Pending — Incoming ({incoming.length})</h3>
            {incoming.map(f => <FriendRow key={f.id} f={f} incoming />)}
            <h3 className="text-xs uppercase font-bold text-flex-muted mb-2 mt-4">Pending — Outgoing ({outgoing.length})</h3>
            {outgoing.map(f => <FriendRow key={f.id} f={f} />)}
          </section>
        )}
        {(tab === 'online' || tab === 'all') && (
          <section>
            <h3 className="text-xs uppercase font-bold text-flex-muted mb-2">{tab === 'online' ? 'Online' : 'All friends'} — {accepted.length}</h3>
            {accepted.length === 0 && <div className="text-flex-muted text-sm">No friends yet. Share your username (e.g. "demo") to add people.</div>}
            {accepted.map(f => <FriendRow key={f.id} f={f} />)}
          </section>
        )}
        {tab === 'blocked' && <div className="text-flex-muted text-sm">Block list is empty.</div>}
      </div>
    </div>
  );
}

function FriendRow({ f, incoming }) {
  const { selectDm, refreshFriends } = useApp();
  const navigate = useNavigate();
  async function accept() { const { api } = await import('../api.js'); await api.acceptFriend(f.id); refreshFriends(); }
  async function remove() { const { api } = await import('../api.js'); await api.removeFriend(f.id); refreshFriends(); }
  async function message() {
    const { api } = await import('../api.js');
    const dm = await api.createDm({ userId: f.user.id });
    navigate(`/channels/@me/${dm.id}`);
  }
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded hover:bg-flex-hover/60 group">
      <div className="avatar w-8 h-8 bg-flex-accent flex items-center justify-center font-semibold">
        {f.user.avatar ? <img src={f.user.avatar} className="w-full h-full object-cover" /> : f.user.displayName[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate">{f.user.displayName}</div>
        <div className="text-xs text-flex-muted">@{f.user.username}</div>
      </div>
      {incoming ? (
        <>
          <button onClick={accept} className="text-flex-green hover:bg-flex-green/20 p-2 rounded" title="Accept">✓</button>
          <button onClick={remove} className="text-flex-red hover:bg-flex-red/20 p-2 rounded" title="Decline">✕</button>
        </>
      ) : (
        <>
          <button onClick={message} className="opacity-0 group-hover:opacity-100 text-flex-muted hover:text-white p-2 rounded" title="Message">💬</button>
          <button onClick={remove} className="opacity-0 group-hover:opacity-100 text-flex-red hover:bg-flex-red/20 p-2 rounded" title="Remove">✕</button>
        </>
      )}
    </div>
  );
}
