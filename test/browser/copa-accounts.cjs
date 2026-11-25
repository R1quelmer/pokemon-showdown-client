// Native client UI with isolated account-service protocol fixtures. Real scrypt,
// persistence/CAS, token replay and native User merging are tested on the server.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {randomBytes} = require('node:crypto');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const key = 'copa-rinha:account-session:v1';
const accounts = new Map(), sessions = new Map(), grants = new Map(), online = new Map(), transports = new Map();
const password = 'fixture-copa-exclusive-password';
const normalize = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
(async () => {
 const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try { const body = await fs.readFile(file); res.writeHead(200, {'Content-Type': {'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'}[path.extname(file)] || 'application/octet-stream'}).end(body); }
  catch { res.writeHead(404).end(); }
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = `http://127.0.0.1:${server.address().port}`;
 const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const contexts = [], errors = [], wire = [];
 let now = Date.now();
 async function context(state, width=1440) {
  const ctx = await browser.newContext({storageState:state, viewport:{width,height:900}}); contexts.push(ctx);
  await ctx.addInitScript(() => { window.Worker = undefined; });
  await ctx.route('**/*', async route => {
   const url = route.request().url();
   if (url.includes('/config/config.js')) return route.fulfill({contentType:'text/javascript',body:"var Config={routes:{client:'play.pokemonshowdown.com'},defaultserver:{host:'localhost',port:8000},customcolors:{},whitelist:[]};"});
   if (url.startsWith('https://copa-rinha-showdown.onrender.com/copa-rinha/accounts/')) {
    const action = url.split('/').pop(), data = route.request().postDataJSON();
    const token = route.request().headers().authorization?.slice(7), session = sessions.get(token);
    const reply = (status, value) => route.fulfill({status,json:value});
    if (action === 'register' || action === 'login') {
     const id=normalize(data.name);
     if (action==='register') { if (accounts.has(id) || id==='riquelme') return reply(409,{error:'Nickname registrado ou reservado.'}); accounts.set(id,{name:data.name,password:data.password}); }
     if (accounts.get(id)?.password!==data.password) return reply(401,{error:'Nickname ou senha incorretos.'});
     const token=randomBytes(32).toString('base64url'), expires=now+30*86400000;
     sessions.set(token,{id,expires}); return reply(200,{name:accounts.get(id).name,token,expires});
    }
    if(action==='admin') {
     if(route.request().headers().authorization!=='Bearer fixture-admin-only-key')return reply(403,{error:'Acesso administrativo negado.'});
     if(data.action==='reserve'){for(const name of data.names)accounts.set(normalize(name),{name,password:null});return reply(200,{success:true});}
     return reply(200,{accounts:[...accounts.values()].map(account=>({name:account.name,registered:!!account.password,disabled:false,sessions:0}))});
    }
    if (!session || session.expires<=now) return reply(401,{error:'Sessão inválida ou expirada.'});
    if (action==='logout') { sessions.delete(token); return reply(200,{success:true}); }
    if (action==='grant') { grants.set(data.challenge.split('|')[1],session.id); return reply(200,{name:accounts.get(session.id).name,expires:session.expires}); }
    return reply(404,{error:'Unknown fixture action'});
   }
   return url.startsWith(origin) ? route.continue() : route.abort();
  });
  await ctx.routeWebSocket(/^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/, ws => {
   const challenge=randomBytes(128).toString('hex'); let user='';
   ws.send(`|formats|,1|Copa Rinha|[Gen 9] Copa Rinha II,e\n|updateuser| Guest 1|0|167\n|challstr|4|${challenge}`);
   const release=()=>{if(user){online.get(user)?.delete(ws);if(!online.get(user)?.size)online.delete(user);}user='';};
   ws.onClose(() => { release(); ws.close(); });
   transports.set(challenge, () => { release(); ws.close({code:1012,reason:'Synthetic network interruption'}); });
   ws.onMessage(raw=>{
    const message=String(raw);wire.push(message);
    const match=/^\|?\/trn ([^,]+),0,copa$/.exec(message);
    if(match){const id=normalize(match[1]);if(grants.get(challenge)!==id)return ws.send(`|nametaken|${match[1]}|Identificação inválida`);grants.delete(challenge);release();user=id;if(!online.has(id))online.set(id,new Set());online.get(id).add(ws);ws.send(`|updateuser| ${accounts.get(id).name}|1|167`);}
    if(message.includes('/cmd copapresence'))ws.send('|queryresponse|copapresence|'+JSON.stringify({total:online.size,guests:0,users:[...online.keys()].map(id=>({name:accounts.get(id).name,avatar:'lucas',status:'',statusType:'online'}))}));
    if(message==='|/logout'){release();ws.send('|updateuser| Guest 1|0|167');}
   });
  });
  const page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/copa-rinha.html');
  await page.waitForFunction(()=>window.PS?.connection?.connected && !PS.user.initializing);
  if(process.env.COPA_SCREENSHOTS && !state){
   await page.locator('input[name=username]').waitFor();
   await fs.mkdir(process.env.COPA_SCREENSHOTS,{recursive:true});
   await page.evaluate(()=>document.fonts.ready);
   await page.screenshot({path:path.join(process.env.COPA_SCREENSHOTS,`accounts-${width}.png`),fullPage:true});
  }
  return {ctx,page};
 }
 const named=page=>page.waitForFunction(()=>window.PS?.user?.name==='Account QA' && !PS.user.loggingIn);
 try {
  const a=await context();
  if(process.env.COPA_SCREENSHOTS){await fs.mkdir(process.env.COPA_SCREENSHOTS,{recursive:true});await a.page.screenshot({path:path.join(process.env.COPA_SCREENSHOTS,'accounts-1440.png'),fullPage:true});}
  assert.equal(await a.page.locator('#header a[href="/replay.html"]').count(),0);
  assert.equal(await a.page.locator('.mainmenu-footer a[href="/replay.html"]').getAttribute('target'),'_blank');
  await a.page.locator('input[name=username]').fill('Account QA');
  await a.page.locator('input[name=copapassword]').fill(password);
  await a.page.getByRole('button',{name:'Registrar conta',exact:true}).click();await named(a.page);
  assert.equal(await a.page.evaluate(()=>PS.user.registered),null);
  const state=await a.ctx.storageState();assert(state.origins[0].localStorage.some(item=>item.name===key));
  await a.page.evaluate(()=>{window.logoNavigationSentinel=true;PS.join('teambuilder');});
  await a.page.locator('a.copa-brand').first().click();assert(await a.page.evaluate(()=>logoNavigationSentinel && PS.user.name==='Account QA'));
  // Leaving for a standalone page and returning restores the account from its token.
  await a.page.goto(origin+'/team.html');
  await a.page.locator('.wordmark').click();await named(a.page);
  await a.page.goto(origin+'/replay.html');
  await a.page.locator('.wordmark').click();await named(a.page);
  const b=await a.ctx.newPage();b.on('pageerror',error=>errors.push(error.message));await b.goto(origin+'/copa-rinha.html');await named(b);
  assert.equal(online.size,1);assert.equal(online.get('accountqa').size,2);
  await a.page.reload();await named(a.page);assert.equal(online.size,1);
  const oldChallenge=await a.page.evaluate(()=>PS.user.challstr);
  transports.get(oldChallenge.split('|')[1])();
  await a.page.waitForFunction(old=>PS.user.challstr!==old && PS.user.name==='Account QA' && !PS.user.loggingIn,oldChallenge);
  assert.equal(online.size,1,'reconnection keeps one account online');
  const intruder=await context(undefined,390);
  if(process.env.COPA_SCREENSHOTS)await intruder.page.screenshot({path:path.join(process.env.COPA_SCREENSHOTS,'accounts-390.png'),fullPage:true});
  await intruder.page.locator('input[name=username]').fill('Account QA');
  await intruder.page.locator('input[name=copapassword]').fill('wrong-password-value');await intruder.page.getByRole('button',{name:'Entrar',exact:true}).click();
  await intruder.page.getByText('Nickname ou senha incorretos.',{exact:true}).waitFor();assert.equal(await intruder.page.evaluate(()=>PS.user.named),false);
  await intruder.page.getByRole('button',{name:'Registrar conta',exact:true}).click();await intruder.page.getByText('Nickname registrado ou reservado.',{exact:true}).waitFor();
  await a.ctx.close();
  const deadline=Date.now()+5000;while(online.size){assert(Date.now()<deadline,'closed browser has no online identity');await new Promise(resolve=>setTimeout(resolve,20));}
  assert(sessions.size>0,'persistent session is not presence');
  const resumed=await context(state,390);await named(resumed.page);assert.equal(online.size,1);
  const anotherTab=await resumed.ctx.newPage();await anotherTab.goto(origin+'/copa-rinha.html');await named(anotherTab);
  await resumed.page.evaluate(()=>PS.user.logOut());
  await resumed.page.waitForFunction(()=>!PS.connection.connected && !PS.user.named);
  await anotherTab.waitForFunction(()=>!PS.connection.connected && !PS.user.named);
  assert.equal(await resumed.page.evaluate(key=>localStorage.getItem(key),key),null);
  const expired=await context(state);await expired.page.getByText('Sessão inválida ou expirada.',{exact:true}).waitFor();
  assert.equal(await expired.page.evaluate(()=>PS.user.named),false);
  assert.equal(await expired.page.evaluate(key=>localStorage.getItem(key),key),null,'revoked tokens are discarded');
  // Logout also works when revocation happened while the browser remained open.
  await intruder.page.locator('input[name=copapassword]').fill(password);
  await intruder.page.getByRole('button',{name:'Entrar',exact:true}).click();await named(intruder.page);
  sessions.clear();
  await intruder.page.evaluate(()=>PS.user.logOut());
  await intruder.page.waitForFunction(()=>!PS.connection.connected && !PS.user.named);
  assert.equal(await intruder.page.evaluate(key=>localStorage.getItem(key),key),null);
  assert(!wire.some(message=>message.includes(password)), 'password never enters Showdown wire');
  for(const token of sessions.keys())assert(!wire.some(message=>message.includes(token)),'session token never enters Showdown wire');
  await expired.page.goto(origin+'/copa-admin.html');
  await expired.page.locator('#admin-key').fill('wrong-admin-key');await expired.page.getByRole('button',{name:'Executar',exact:true}).count().then(async count=>{if(count)await expired.page.getByRole('button',{name:'Executar',exact:true}).click();else await expired.page.locator('form button').click();});
  await expired.page.getByText('Acesso administrativo negado.',{exact:true}).waitFor();
  await expired.page.locator('#admin-key').fill('fixture-admin-only-key');
  await expired.page.locator('form button').click();await expired.page.locator('#admin-result').filter({hasText:'Account QA'}).waitFor();
  await expired.page.locator('#action').selectOption('reserve');await expired.page.locator('#names').fill('Participant One\nParticipant Two');
  await expired.page.locator('form button').click();await expired.page.getByText('Operação concluída.',{exact:true}).waitFor();
  assert(accounts.has('participantone') && accounts.has('participanttwo'));
  assert(!(await expired.page.evaluate(()=>JSON.stringify(localStorage))).includes('fixture-admin-only-key'));
  assert.deepEqual(errors,[]);
  console.log('Native account UI: registration/login, wrong password/collision, logo, reload, two tabs dedup, browser close/reopen, persisted session vs presence and logout/revocation passed');
 } finally { for(const ctx of contexts)await ctx.close().catch(()=>{});await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
