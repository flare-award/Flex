// Minimal markdown-lite formatter: **bold**, *italic*, __underline__, ~~strike~~, `code`, ``` blocks, links, @mentions
export function formatContent(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  // code blocks
  html = html.replace(/```([a-z]*)\n?([\s\S]*?)```/g, (_, _lang, code) => `<pre>${code.trim()}</pre>`);
  // inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
  // links
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
  // bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // underline
  html = html.replace(/__([^_]+)__/g, '<u>$1</u>');
  // strike
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  // mentions @username
  html = html.replace(/@([a-z0-9\-_~]{2,32})/g, '<span class="mention">@$1</span>');
  // newlines
  html = html.replace(/\n/g, '<br/>');
  return html;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function initials(name) {
  return (name || '?').split(/\s+/).map(s => s[0]).join('').slice(0,2).toUpperCase();
}
