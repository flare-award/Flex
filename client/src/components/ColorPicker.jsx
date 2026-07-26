import React, { useState } from 'react';

/**
 * A lightweight color picker with:
 *  - native color picker (for slider/dragging)
 *  - hex input
 *  - preset palette
 *  - gradient preview (two colors) not here, composed outside
 */
export default function ColorPicker({ value, onChange }) {
  const [text, setText] = useState(value);
  function commit(v) {
    onChange(v); setText(v);
  }
  return (
    <div className="flex items-center gap-2 my-1">
      <input type="color" value={value} onChange={e => commit(e.target.value)} className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0" />
      <input
        className="input w-28 font-mono text-sm py-1 uppercase"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={() => { if (/^#[0-9a-fA-F]{6}$/.test(text)) commit(text.toLowerCase()); else setText(value); }}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
      />
      <div className="flex gap-1">
        {PRESETS.map(c => (
          <button key={c} onClick={() => commit(c)} className="w-5 h-5 rounded border border-black/40 hover:scale-110 transition-transform" style={{background:c}} title={c} />
        ))}
      </div>
    </div>
  );
}

const PRESETS = ['#1e1f22','#5865f2','#eb459e','#57f287','#fee75c','#f23f43','#ed4245','#ffffff'];
