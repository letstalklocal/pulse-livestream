/** Trusted bundled bytes only; no network or file permissions. */
export function webmGiftHtml(base64: string, muted = false): string {
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error("Invalid WebM data");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}video{width:100%;height:100%;object-fit:contain;background:transparent}</style></head>
<body><video id="gift" autoplay playsinline preload="auto" src="data:video/webm;base64,${base64}"></video>
<script>const video=document.getElementById('gift');const send=event=>window.ReactNativeWebView.postMessage(event);
video.addEventListener('ended',()=>send('ended'));video.addEventListener('error',()=>send('error'));
video.addEventListener('playing',()=>send('ready'));video.muted=${muted};video.volume=1;video.play().catch(()=>send('error'));
let previousGain=1;
function fade(){const d=video.duration;const gain=Number.isFinite(d)&&d>0?Math.max(0,Math.min(1,(d-video.currentTime)/Math.min(1,d))):1;
video.style.opacity=String(gain);video.volume=gain;if(Math.abs(previousGain-gain)>=0.025||gain===0&&previousGain!==0){previousGain=gain;send('gain:'+gain)}
if(!video.ended)requestAnimationFrame(fade)}requestAnimationFrame(fade);
document.addEventListener('visibilitychange',()=>{if(document.hidden){video.pause();send('ended')}});</script></body></html>`;
}
