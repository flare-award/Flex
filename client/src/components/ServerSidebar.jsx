import React from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../state/AppState.jsx';
import Tooltip from './Tooltip.jsx';

export default function ServerSidebar() {
  const { guilds, mentions, notifications, showToast, setModal } = useApp();
  const navigate = useNavigate();
  const totalMentions = Object.values(mentions).reduce((a,b)=>a+b,0);

  return (
    <div className="w-[72px] bg-flex-server flex flex-col items-center py-3 gap-2 overflow-y-auto flex-shrink-0">
      <ServerButton
        onClick={() => navigate('/channels/@me')}
        to="/channels/@me"
        tooltip="Direct Messages"
        badge={totalMentions || null}
      >
        <svg width="28" height="20" viewBox="0 0 28 20" fill="currentColor"><path d="M23.02 1.68A22.4 22.4 0 0017.42 0l-.24.26a20.56 20.56 0 015 3.1A16.4 16.4 0 002.6 4.16C1.5 8.04 1.46 12 2.36 15.88a22.6 22.6 0 005.6 2.9l.3-.36a13.5 13.5 0 01-2.1-1.6 15.6 15.6 0 00.6-.4c4.44 2.04 9.24 2.04 13.6 0 .2.14.4.28.6.4a13.5 13.5 0 01-2.12 1.6l.3.36a22.4 22.4 0 005.62-2.9c1.08-4.48.9-8.36-.74-11.78a20.2 20.2 0 01-2.3-2.3l-.7-.04zM9.38 13.5c-1.34 0-2.46-1.24-2.46-2.76S8 8 9.38 8s2.48 1.24 2.46 2.76c0 1.52-1.12 2.74-2.46 2.74zm8.86 0c-1.34 0-2.44-1.24-2.46-2.76 0-1.52 1.12-2.76 2.46-2.76s2.46 1.24 2.46 2.76S19.6 13.5 18.24 13.5z"/></svg>
      </ServerButton>
      <div className="w-8 h-[2px] bg-flex-hover rounded-full my-1" />
      {guilds.map(g => {
        const guildMentions = g.channels.reduce((acc, c) => acc + (mentions[c.id] || 0), 0);
        const unread = g.channels.some(c => notifications[c.id] > 0);
        const initials = g.name.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase();
        return (
          <ServerButton
            key={g.id}
            to={`/channels/${g.id}/${g.channels.find(c=>c.type==='text')?.id || ''}`}
            tooltip={g.name}
            badge={guildMentions || (unread ? '•' : null)}
            icon={g.icon}
          >
            {g.icon ? <img src={g.icon} className="w-full h-full object-cover" /> : initials}
          </ServerButton>
        );
      })}
      <ServerButton onClick={() => setModal({ type: 'createGuild' })} tooltip="Add a Server" plus>
        <span className="text-2xl text-flex-green leading-none">+</span>
      </ServerButton>
      <ServerButton onClick={() => setModal({ type: 'joinGuild' })} tooltip="Join a Server" compass>
        <span className="text-xl text-flex-green leading-none">🧭</span>
      </ServerButton>
    </div>
  );
}

function ServerButton({ children, to, tooltip, onClick, badge, icon, plus, compass }) {
  return (
    <div className="group relative w-12 flex justify-center">
      <span className="server-pill h-0 group-hover:h-5 group-[.active]:h-10" style={{ top: '50%', transform: 'translateY(-50%)' }} />
      {to ? (
        <NavLink to={to} className={({isActive}) => `server-icon ${isActive ? 'active' : 'bg-flex-sidebar'} ${plus || compass ? 'bg-flex-sidebar hover:bg-flex-green text-flex-green hover:text-white' : ''}`} onClick={onClick}>
          {children}
        </NavLink>
      ) : (
        <button className={`server-icon ${plus||compass ? 'bg-flex-sidebar hover:bg-flex-green text-flex-green hover:text-white' : ''}`} onClick={onClick}>{children}</button>
      )}
      {badge && (
        <div className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-flex-red text-white text-[11px] font-bold rounded-full flex items-center justify-center border-[3px] border-flex-server">
          {badge === true ? '' : badge}
        </div>
      )}
      <Tooltip text={tooltip} />
    </div>
  );
}
