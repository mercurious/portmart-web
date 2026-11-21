// portmart.app: the launch intro over the XMB, which loads underneath; input goes to the XMB once the intro
// ends or is skipped. A service worker keeps the last build and catalog for offline starts.
import { runSplash } from './splash.js';
import { enableInput, start } from './xmb/xmb.js';

start();
runSplash(document.getElementById('splash')).then(enableInput);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* online only, then */ });
