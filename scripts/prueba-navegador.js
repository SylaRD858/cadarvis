// Prueba de humo en Chrome headless vía CDP. Uso: node scripts/prueba-navegador.js <url> <usuario> <clave> <carpeta-salida>
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const [url, user, pass, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9333',
  '--window-size=1366,850', '--user-data-dir=/tmp/cadarvis-chrome', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let ws;
  for (let i = 0; i < 40; i++) {
    try { const t = await (await fetch('http://127.0.0.1:9333/json')).json(); ws = t.find(x => x.type === 'page').webSocketDebuggerUrl; break; }
    catch { await sleep(250); }
  }
  const sock = new WebSocket(ws);
  await new Promise(r => sock.onopen = r);
  let id = 0; const pend = new Map(); const errores = [];
  sock.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errores.push(m.params.args.map(a => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${out}/${name}.png`, Buffer.from(r.result.data, 'base64')); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url }); await sleep(1500);
  await shot('01-login');
  await js(`(() => { const f = document.querySelector('form'); f.username.value=${JSON.stringify(user)}; f.password.value=${JSON.stringify(pass)}; f.requestSubmit(); })()`);
  await sleep(1500);
  for (const [h, n] of [['#/inicio', '00-inicio'], ['#/clientes', '02-clientes'], ['#/clientes/nuevo', '03-cliente-nuevo'], ['#/planes', '04-planes'],
    ['#/usuarios', '05-usuarios'], ['#/rangos', '06-rangos'], ['#/mapa', '07-mapa'], ['#/config', '08-config'], ['#/bitacora', '09-bitacora']]) {
    await js(`location.hash='${h}'`); await sleep(1300); await shot(n);
    const txt = await js(`document.getElementById('vista')?.innerText.slice(0,120)`);
    console.log(h, '→', JSON.stringify(txt));
  }
  console.log('ERRORES:', errores.length ? errores : 'ninguno');
  sock.close(); chrome.kill();
  process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
