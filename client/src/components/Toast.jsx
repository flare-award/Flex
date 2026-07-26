import React, { useEffect, useState } from 'react';
import { useApp } from '../state/AppState.jsx';

export default function Toast() {
  const { toast } = useApp();
  const [show, setShow] = useState(false);
  useEffect(() => { if (toast) { setShow(true); setTimeout(() => setShow(false), 3300); } }, [toast?.id]);
  if (!toast || !show) return null;
  const color = toast.kind === 'error' ? 'bg-flex-red' : toast.kind === 'success' ? 'bg-flex-green' : 'bg-[#111214]';
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 ${color} text-white px-4 py-2 rounded-md shadow-2xl z-50 text-sm`}>
      {toast.msg}
    </div>
  );
}
