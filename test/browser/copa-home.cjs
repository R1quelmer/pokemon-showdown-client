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
  try {const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.woff2':'font/woff2','.txt':'text/plain'}[path.extname(file)]||'application/octet-stream'}).end(body);}
  catch {res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 await fs.mkdir(screenshots,{recursive:true});
 try {
  for(const width of [1440,1000,390,320]){
   const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<628});
   const page=await context.newPage(), errors=[];let socket, connections=0, clockPaused=false;
   const joins=[], avatarCommands=[];
   await page.clock.install({time:new Date('2026-12-04T21:58:55Z')});
   await page.clock.setFixedTime(new Date('2026-12-04T21:58:55Z'));
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{window.Worker=undefined;if(!localStorage.getItem('showdown_bg'))localStorage.setItem('showdown_bg','solidblue');});
   await page.routeWebSocket(/^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/,ws=>{
    socket=ws;connections++;
    ws.send('|formats|,1|Copa Rinha|[Gen 9] Copa Rinha II,e\n|updateuser| Home QA|1|1');
    ws.onMessage(message=>{
     if(message.trim()==='|/cmd copaavatars')ws.send('|queryresponse|copaavatars|["ethan","marnie","sabrina-masters"]');
     if(message.includes('|/avatar'))avatarCommands.push(message);
     if(!message.startsWith('|/join '))return;
     joins.push(message);
     if(message==='|/join lobby')ws.send('>lobby\n|init|chat\n|title|Lobby');
    });
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
   const checkDefaultWallpaper=async()=>{
    const [image,size,position]=await home.evaluate(el=>{
     const css=getComputedStyle(el);
     return [css.backgroundImage,css.backgroundSize,css.backgroundPosition];
    });
    assert(image.includes('poliwhirl-wallpaper.jpg')&&image.includes('linear-gradient'));
    assert.equal(size,'auto, cover');
    assert.equal(position,'0% 0%, 50% 28%');
    await page.evaluate(async url=>{
     const sprite=new Image();
     sprite.src=url;
     await sprite.decode();
    },image.match(/url\("([^"]+)"\)/)[1]);
   };
   await checkDefaultWallpaper();
   await page.evaluate(()=>PSView.scrollToRoom());
   await capture('wallpaper-default');
   for(const href of ['ladder','view-tournaments-all','resources','rooms'])assert.equal(await home.locator(`a[href="${href}"]`).count(),0);
   for(const href of ['teambuilder','battles','users','copamembers','lobby'])assert.equal(await home.locator(`.menugroup a[href="${href}"]`).count(),1);
   assert.equal(await home.locator('a[href="view-friends-all"]').count(),0);
   assert.equal(await page.locator('#fixture-ad').count(),0);assert.equal(await page.evaluate(()=>!!window.fixtureAdMounted),false);
   assert.deepEqual(await home.locator('.mainmenu-footer a').evaluateAll(links=>links.map(a=>({label:a.textContent,path:new URL(a.href).pathname}))),[{label:'Replays',path:'/replay.html'}]);
   const menu=await home.locator('.mainmenu-left').boundingBox(), room=await home.boundingBox();
   assert(menu.y-room.y<40,`Home starts near its header at ${width}px`);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const news=home.locator('.mini-window[data-roomid="news"]');
   const minimize=news.locator('.minimizebutton');
   if(width<628)await minimize.click();
   assert.deepEqual(await news.getByRole('heading',{level:4}).allTextContents(),
    ['Copa Rinha II','Fase de testes','Personalize seu avatar','Pokémon parceiro','Treinamento contra bots','Últimas atualizações']);
   assert.equal(await news.locator('time').first().getAttribute('datetime'),'2026-12-05T20:00:00-03:00');
   assert.equal(await news.getByRole('link',{name:'Lista de avatares disponíveis'}).getAttribute('href'),
    'https://play.pokemonshowdown.com/sprites/trainers/');
   assert((await news.textContent()).includes('independentes das contas oficiais'));
   assert.equal(await news.getByRole('timer').textContent(),'1 dia · 1 hora · 1 minuto · 5 segundos');
   const colorOf=locator=>locator.evaluate(el=>getComputedStyle(el).color);
   assert.equal(await colorOf(news.getByRole('timer')),'rgb(74, 222, 128)');
   assert.equal(await colorOf(news.getByRole('link',{name:'Lista de avatares disponíveis'})),'rgb(89, 217, 245)');
   const updates=news.locator('.copa-updates');
   assert.equal(await updates.locator('li:visible').count(),3);
   assert.match(await updates.locator('li').first().textContent(),/O Metagross shiny do Wan aparece maior/);
   await updates.locator('summary').click();
   assert(await updates.locator('li:visible').count() > 3);
   await updates.locator('summary').click();
   const right=page.locator('#room-rooms');
   if(width>=700){
    const [leftBox,rightBox]=await Promise.all([home.boundingBox(),right.boundingBox()]);
    assert(Math.abs(leftBox.width-rightBox.width)<=1);
    assert.equal(await right.getByRole('heading',{name:'Chat de Lobby'}).count(),1);
    assert.equal(await right.locator('input[name=roomsearch], select[name=sections]').count(),0);
    const newsBox=await news.boundingBox();
    assert(newsBox.x+newsBox.width<=leftBox.x+leftBox.width);
   }else{
    assert.equal(await page.evaluate(()=>PS.leftPanelWidth),null);
   }
   assert(await home.evaluate(el=>el.scrollWidth<=el.clientWidth));
   await page.evaluate(()=>PSView.scrollToRoom());
   const counters=width<700?home.locator('.copa-counters'):right.locator('.copa-counters');
   await counters.scrollIntoViewIfNeeded();
   assert(await counters.locator('.copa-mascot img').evaluateAll(sprites=>sprites.every(sprite=>sprite.complete&&sprite.naturalWidth)));
   for(const mascot of await counters.locator('.copa-mascot').all()){
    const sprite=mascot.locator('img');
    const moving=()=>sprite.evaluate(el=>getComputedStyle(el).transform!=='none');
    const move=()=>width<628?mascot.tap():mascot.hover();
    assert.equal(await moving(),false);
    await move();
    await sprite.evaluate(el=>el.getAnimations()[0].ready);
    const timing=await sprite.evaluate(el=>el.getAnimations()[0].effect.getTiming().iterations);
    assert.equal(timing,width<628?3:Infinity);
    await sprite.evaluate(el=>new Promise((resolve,reject)=>{
     let frames=0;
     function check(){
      if(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42<-4)return resolve();
      if(++frames>60)return reject(new Error('Mascot did not visibly move'));
      requestAnimationFrame(check);
     }
     check();
    }));
    if(width>=628){
     await page.waitForTimeout(900);
     assert(await moving(),'hover continues after three hops');
     await mascot.click();
     const clickHops=await sprite.evaluate(el=>el.getAnimations().find(a=>!(a instanceof CSSAnimation))?.effect.getTiming().iterations);
     assert.equal(clickHops,3);
     await page.mouse.move(1,1);
     assert(await moving(),'click animation continues after leaving hover');
     await sprite.evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
    }else{
     await page.waitForTimeout(900);
    }
    assert.equal(await moving(),false);
    await page.evaluate(()=>PS.prefs.set('noanim',true));
    await move();
    assert.equal(await moving(),false);
    if(width>=628){
     await mascot.click();
     assert.equal(await moving(),false);
     await page.mouse.move(1,1);
    }
    await page.evaluate(()=>PS.prefs.set('noanim',false));
   }
   await page.evaluate(()=>PSView.scrollToRoom());
   await news.scrollIntoViewIfNeeded();
   assert.equal(await news.locator('.mini-window-header').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(21, 36, 56)');
   await capture('home-default');
   await page.clock.setFixedTime(new Date('2026-12-05T22:59:59Z'));
   await news.getByText('0 dias · 0 horas · 0 minutos · 1 segundo').waitFor();
   await page.clock.setFixedTime(new Date('2026-12-05T23:00:00Z'));
   await news.getByRole('status').getByText('O campeonato começou!').waitFor();
   assert.equal(await colorOf(news.getByRole('status')),'rgb(89, 217, 245)');
   await minimize.click();
   await news.getByRole('status').waitFor({state:'hidden'});
   await minimize.click();
   await news.getByRole('status').waitFor({state:'visible'});
   await news.locator('.closebutton').click();
   assert.equal(await home.locator('.mainmenu-mini-windows').count(),0,'empty mini-window container is not rendered');
   await home.getByRole('link',{name:'Chat de Lobby',exact:true}).click();
   await page.locator('#room-lobby').waitFor({state:'visible'});
   assert.deepEqual(joins,['|/join lobby']);
   assert(await page.evaluate(()=>window.logoNavigationSentinel),'opening Lobby does not reload the page');
   await page.locator('#room-lobby .chat-log').waitFor({state:'visible'});
   const avatar=await page.evaluate(()=>PS.user.avatar);
   for(const alreadyOpen of [true,false]){
    await page.evaluate(alreadyOpen=>{
     if(!alreadyOpen)PS.leave('lobby');
     PS.join('');
     PSView.scrollToRoom();
    },alreadyOpen);
    await page.waitForFunction(()=>!PSView.snapFrame&&PS.room.id==='');
    await page.locator('button[data-href="options"]:visible').last().click();
    const avatarButton=page.getByRole('button',{name:/^Avatar\s*(?:\.\.\.|…)$/});
    if(width<628)await avatarButton.tap({timeout:3000});
    else await avatarButton.click({timeout:3000});
    await page.locator('#room-lobby .chat-log').waitFor({state:'visible'});
    const hint=page.locator('#room-lobby').getByRole('link',{name:'Lista de avatares',exact:true});
    await hint.waitFor({timeout:3000});
    assert.equal(await hint.getAttribute('href'),'https://play.pokemonshowdown.com/sprites/trainers/');
    assert(await page.evaluate(()=>!PS.rooms.options&&!PS.rooms.avatars&&PS.room.id==='lobby'));
    await page.waitForFunction(()=>{
     const entry=PS.rooms.lobby?.textEntry;
     return entry?.getValue()==="/avatar "&&document.activeElement===(entry.miniedit?.element||entry.textbox);
    },null,{timeout:5000});
    assert.deepEqual(await page.evaluate(()=>{
     const entry=PS.rooms.lobby.textEntry;
     return [entry.getSelection(),document.activeElement===(entry.miniedit?.element||entry.textbox)];
    }),[{value:'/avatar ',start:8,end:8},true]);
    assert.equal(await page.evaluate(()=>PS.user.avatar),avatar);
    const suggestion=page.getByRole('button',{name:'marnie',exact:true});
    await suggestion.waitFor();
    await assertSpriteElementsLoaded(page,'.copa-avatar-suggestions button img[src$="/marnie.png"]');
    await suggestion.click();
    assert.equal(await page.evaluate(()=>PS.rooms.lobby.textEntry.getValue()),'/avatar marnie');
    const input=page.locator('#room-lobby .chat-log-add .textbox');
    await input.press('Home');
    await input.press('End');
    await input.press('Backspace');
    await suggestion.waitFor();
    await input.press('ArrowDown');
    await input.press('Enter');
    assert.equal(await page.evaluate(()=>PS.rooms.lobby.textEntry.getValue()),'/avatar marnie');
    assert.deepEqual(avatarCommands,[]);
    if(!alreadyOpen)await capture('avatar-lobby');
   }
   assert.deepEqual(joins,['|/join lobby','|/join lobby']);
   await page.evaluate(()=>{PS.leave('lobby');PS.join('');});
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
   await page.clock.setSystemTime(Date.now());
   await page.clock.pauseAt(new Date(Date.now()+500));clockPaused=true;
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
   await checkDefaultWallpaper();
   assert.equal(await page.evaluate(()=>localStorage.getItem('copa-rinha:background')),'copa-default');
   await page.evaluate(()=>PS.join('changebackground'));
   await page.getByRole('button',{name:'Azul fosco',exact:true}).click();
   await page.reload();await ready();
   assert.equal(await page.evaluate(()=>PSBackground.id),'copa-matte-blue');
   assert.equal(await home.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(8, 15, 27)');
   assert.equal(await home.evaluate(el=>getComputedStyle(el).backgroundImage),'none');
   assert.equal(await page.evaluate(()=>localStorage.getItem('showdown_bg')),'solidblue');
   assert.deepEqual(errors,[]);
   console.log(`Copa news countdown and controls, direct Lobby and Home regressions passed at ${width}px`);
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
  assert.equal(await page.locator('[id="room-"] a[href="rooms"]').count(),1);
  assert.equal(await page.getByRole('link',{name:'Chat de Lobby'}).count(),0);
  assert.equal(await page.locator('.copa-news').count(),0);
  assert((await page.locator('.mainmenu-footer').textContent()).includes('Pokédex'));
  await page.evaluate(()=>PS.join('options'));
  await page.getByRole('button',{name:/^Avatar\s*(?:\.\.\.|…)$/}).click();
  assert(await page.evaluate(()=>!!PS.rooms.avatars&&!PS.rooms.lobby));
  await page.evaluate(()=>PS.closePopupsAbove(null));
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
