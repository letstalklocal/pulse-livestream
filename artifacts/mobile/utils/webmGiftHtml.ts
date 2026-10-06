/** Trusted bundled bytes only; no network or file permissions. */
export function webmGiftHtml(base64: string): string {
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error("Invalid WebM data");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}video{width:100%;height:100%;object-fit:contain;background:transparent}</style></head>
<body><video id="gift" autoplay muted playsinline preload="auto" src="data:video/webm;base64,${base64}"></video>
<script>const video=document.getElementById('gift');const send=event=>window.ReactNativeWebView.postMessage(event);
video.addEventListener('ended',()=>send('ended'));video.addEventListener('error',()=>send('error'));
video.addEventListener('playing',()=>send('ready'));video.muted=true;video.play().catch(()=>send('error'));
document.addEventListener('visibilitychange',()=>{if(document.hidden){video.pause();send('ended')}});</script></body></html>`;
}
