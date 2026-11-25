// Native Home/background controls with isolated protocol and genuine wallpaper bytes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {createHash} = require('node:crypto');
const {chromium} = require('playwright');
const {serveNativeSprite,assertSpriteElementsLoaded} = require('./copa-sprite-assets.cjs');
const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const screenshots = process.env.COPA_HOME_SCREENSHOTS || '/tmp/copa-home-qa';
const wallpaperPath = path.join(root,'fx/client-bg-horizon.jpg');
(async () => {
 const wallpaper = await fs.readFile(wallpaperPath);
 assert.equal(createHash('sha1').update(`blob ${wallpaper.length}\0`).update(wallpaper).digest('hex'),'282e51ad1f131e0791ed138307aa9a2842f05a8f');
 const server = http.createServer(async (req,res) => {
  const file = path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  try {const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.woff2':'font/woff2','.txt':'text/plain'}[path.extname(file)]||'application/octet-stream'}).end(body);}
  catch {res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 await fs.mkdir(screenshots,{recursive:true});
 try {
  for(const width of [1440,1000,390,320]){
   const context=await browser.newContext({viewport:{width,height:900}});
   const page=await context.newPage(), errors=[];let socket, connections=0, clockPaused=false;
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{window.Worker=undefined;if(!localStorage.getItem('showdown_bg'))localStorage.setItem('showdown_bg','solidblue');});
   await page.routeWebSocket(/^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/,ws=>{
    socket=ws;connections++;
    ws.send('|formats|,1|Copa Rinha|[Gen 9] Copa Rinha II,e\n|updateuser| Home QA|1|1');
   });
   await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url.includes('/config/config.js'))return route.fulfill({contentType:'text/javascript',body:
     `var Config={routes:{client:'play.pokemonshowdown.com'},customcolors:{},whitelist:[],defaultserver:{host:'localhost',port:8000},includes:{mainmenuHTML:'<div id="fixture-ad" style="height:700px">Advertisement</div>',htmlDidMount:function(){window.fixtureAdMounted=true;}}};`});
    if(url.endsWith('/fx/client-bg-horizon.jpg'))return route.fulfill({contentType:'image/jpeg',body:wallpaper});
    if(await serveNativeSprite(route))return;
    return url.startsWith(origin)?route.continue():route.abort();
   });
   const entry=origin+'/testclient-new.html?~~copa-rinha-showdown.onrender.com:443&copa-rinha=1';
   const ready=async()=>{await page.waitForFunction(()=>window.PS?.connection?.connected&&PS.user.named);await page.evaluate(()=>{PS.closePopupsAbove(null);PS.join('');});};
   const capture=async name=>{if(clockPaused)await page.clock.runFor(200);await page.evaluate(()=>document.fonts.ready);if(!clockPaused)await page.waitForFunction(()=>!window.PSView?.snapFrame);await page.screenshot({path:path.join(screenshots,`${name}-${width}.png`),fullPage:true});};
   await page.goto(entry);await ready();
   const home=page.locator('[id="room-"]');
   const brand=page.locator('#header a.copa-brand');
   assert.equal((await brand.textContent()).trim(),'');
   assert.equal(await page.locator('#header a[href="/replay.html"]').count(),0);
   await page.evaluate(()=>{window.logoNavigationSentinel=true;PS.join('teambuilder');});
   await brand.click();
   await home.waitFor({state:'visible'});
   assert(await page.evaluate(()=>window.logoNavigationSentinel));
   if(width===1440){
    const previous=await page.evaluate(()=>{const layout=PS.prefs.onepanel;PS.prefs.set('onepanel','vertical');PS.update();return layout;});
    const sidebar=page.locator('#header.header-vertical');
    await sidebar.waitFor({state:'visible'});
    assert.equal((await sidebar.locator('a.copa-brand').textContent()).trim(),'');
    assert.equal(await sidebar.locator('a[href="/replay.html"]').count(),0);
    await page.evaluate(layout=>{PS.prefs.set('onepanel',layout);PS.update();},previous);
    await page.locator('#header.header').waitFor({state:'visible'});
   }
   assert.equal(await page.evaluate(()=>PSBackground.id),'copa-default');
   assert.equal(await page.evaluate(()=>localStorage.getItem('showdown_bg')),'solidblue');
   assert.equal(await home.evaluate(el=>getComputedStyle(el).backgroundImage),'none');
   for(const href of ['ladder','view-tournaments-all','resources'])assert.equal(await home.locator(`a[href="${href}"]`).count(),0);
   for(const href of ['teambuilder','battles','users','view-friends-all','rooms'])assert.equal(await home.locator(`a[href="${href}"]`).count(),1);
   assert.equal(await page.locator('#fixture-ad').count(),0);assert.equal(await page.evaluate(()=>!!window.fixtureAdMounted),false);
   assert.deepEqual(await home.locator('.mainmenu-footer a').evaluateAll(links=>links.map(a=>({label:a.textContent,path:new URL(a.href).pathname}))),[{label:'Replays',path:'/replay.html'}]);
   const menu=await home.locator('.mainmenu-left').boundingBox(), room=await home.boundingBox();
   assert(menu.y-room.y<40,`Home starts near its header at ${width}px`);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await capture('home-default');
   await page.evaluate(()=>{PS.leave('news');PS.join('');});
   assert.equal(await home.locator('.mainmenu-mini-windows').count(),0,'empty mini-window container is not rendered');
   await page.evaluate(()=>PS.join('changebackground'));
   await page.locator('.bglist button[value="horizon"]').waitFor({state:'visible'});
   await assertSpriteElementsLoaded(page,'.bglist .bg');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await capture('home-background-picker');
   await page.locator('.bglist button[value="horizon"]').click();
   await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--copa-home-wallpaper').includes('client-bg-horizon.jpg'));
   assert.equal(await page.evaluate(()=>localStorage.getItem('copa-rinha:background')),'horizon');
   await page.evaluate(()=>{PS.closePopupsAbove(null);PS.join('');});
   await capture('home-wallpaper');
   await page.reload();await ready();
   assert((await home.evaluate(el=>getComputedStyle(el).backgroundImage)).includes('client-bg-horizon.jpg'));
   await page.evaluate(()=>PS.join('teambuilder'));
   assert.equal(await page.locator('#room-teambuilder').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
   assert.equal(await page.locator('#room-teambuilder').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(8, 15, 27)');
   await page.evaluate(()=>{
    PS.receive('>battle-copa-home\n|init|battle\n|title|Copa QA\n|gametype|singles\n|gen|9\n|tier|[Gen 9] Copa Rinha II\n|player|p1|Alice|1\n|player|p2|Bob|2\n|turn|1');
    PS.join('battle-copa-home');
   });
   assert.equal(await page.locator('#room-battle-copa-home').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
   const standalone=await context.newPage();
   await standalone.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
   for(const file of ['replay.html','team.html']){
    await standalone.goto(origin+'/'+file);
    assert.equal(await standalone.evaluate(()=>getComputedStyle(document.body).backgroundImage),'none');
    assert.equal(await standalone.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(8, 15, 27)');
   }
   await standalone.close();
   await page.evaluate(()=>{PS.join('');PS.join('changebackground');});
   await page.locator('input[name=bgfile]').setInputFiles({name:'custom-wallpaper.jpg',mimeType:'image/jpeg',buffer:wallpaper});
   await page.waitForFunction(()=>PSBackground.id==='custom'&&localStorage.getItem('copa-rinha:background')?.startsWith('data:image/jpeg;base64,'));
   await page.evaluate(()=>PS.closePopupsAbove(null));
   await page.reload();await ready();assert.equal(await page.evaluate(()=>PSBackground.id),'custom');
   assert((await home.evaluate(el=>getComputedStyle(el).backgroundImage)).includes('data:image/jpeg;base64,'));
   // A real transport close/reconnect must not insert ads or move Home below a blank container.
   const before=await home.locator('.mainmenu-left').boundingBox();
   await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+50));clockPaused=true;
   socket.close({code:1012,reason:'Synthetic reconnect'});
   await page.waitForFunction(()=>!PS.connection.connected);
   const during=await home.locator('.mainmenu-left').boundingBox();
   assert(Math.abs(before.y-during.y)<2,'reconnect keeps the main content anchored');
   await capture('home-reconnecting');
   await page.clock.fastForward(1100);await ready();assert(connections>=3);
   assert.equal(await page.locator('#fixture-ad').count(),0);
   const footer=home.locator('.mainmenu-footer');await footer.scrollIntoViewIfNeeded();assert(await footer.isVisible());
   await capture('home-footer');
   await page.evaluate(()=>PS.join('changebackground'));
   await page.getByRole('button',{name:'Restaurar fundo padrão',exact:true}).click();
   await page.evaluate(()=>PS.closePopupsAbove(null));
   assert.equal(await home.evaluate(el=>getComputedStyle(el).backgroundImage),'none');
   assert.equal(await page.evaluate(()=>localStorage.getItem('copa-rinha:background')),'copa-default');
   assert.equal(await page.evaluate(()=>localStorage.getItem('showdown_bg')),'solidblue');
   assert.deepEqual(errors,[]);
   console.log(`Scoped Home navigation/footer, native wallpaper/upload/persistence/reset, dark rooms, empty/ad removal and reconnect geometry passed at ${width}px`);
   await context.close();
  }
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.addInitScript(()=>{window.Worker=undefined;localStorage.setItem('showdown_bg','solidblue');localStorage.setItem('copa-rinha:background','horizon');});
  await page.routeWebSocket(/^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/,ws=>ws.send('|updateuser| Native QA|1|1'));
  await page.route('**/*',route=>{const url=route.request().url();if(url.includes('/config/config.js'))return route.fulfill({contentType:'text/javascript',body:"var Config={routes:{client:'play.pokemonshowdown.com',root:'pokemonshowdown.com',replays:'replay.pokemonshowdown.com',dex:'dex.pokemonshowdown.com'},customcolors:{},whitelist:[],defaultserver:{host:'localhost',port:8000}};"});return url.startsWith(origin)?route.continue():route.abort();});
  await page.goto(origin+'/testclient-new.html?~~copa-rinha-showdown.onrender.com:443');
  await page.waitForFunction(()=>window.PS?.connection?.connected);
  assert.equal(await page.evaluate(()=>!!Config.copaRinhaLocalNames),false);
  assert.equal(await page.evaluate(()=>PSBackground.id),'solidblue');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(52, 75, 108)');
  for(const href of ['ladder','view-tournaments-all','resources'])assert.equal(await page.locator(`[id="room-"] a[href="${href}"]`).count(),1);
  assert((await page.locator('.mainmenu-footer').textContent()).includes('Pokédex'));
  assert.equal(await page.locator('html.copa-rinha').count(),0);
  console.log('Non-Copa native menu/footer/background and independent local preferences are unchanged');
  await page.setViewportSize({width:390,height:900});
  await page.evaluate(()=>{Config.includes={mainmenuHTML:'<div id="native-ad-control" style="height:700px">Advertisement fixture</div>'};PS.rooms[''].update(null);PS.join('');});
  await page.locator('#native-ad-control').waitFor({state:'visible'});
  const nativeGap=await page.evaluate(()=>document.querySelector('.mainmenu-left').getBoundingClientRect().top-document.querySelector('[id="room-"]').getBoundingClientRect().top);
  assert(nativeGap>=700,'native control reproduces the advertisement space before the menu');
  console.log(`Native mobile control reproduces a ${nativeGap}px gap; Copa rejects that same include and starts within 40px`);
  await page.close();
  const credits=await browser.newPage();await credits.goto(origin+'/copa-creditos.html');
  assert((await credits.textContent('main')).includes('Aronousqui20'));assert((await credits.textContent('main')).includes('AGPL'));
  assert.equal((await credits.request.get(origin+'/assets/copa-rinha/licenses/AGPL-3.0.txt')).status(),200);await credits.close();
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
