import React from 'react';
export default function Tooltip({ text }) {
  if (!text) return null;
  return <div className="tooltip">{text}</div>;
}
