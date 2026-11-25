// Chromium regression for public discovery; transport fixtures never contact production.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const api = 'https://copa-rinha-showdown.onrender.com/copa-rinha/replays/';
const summary = (id, name = 'Alice') => ({id: id.repeat(32), format: 'gen9coparinhanationaldexza',
 createdAt: '2026-11-24T12:00:00Z', players: [{name}, {name:'Bob'}], winner:'Bob', turns:22, endType:'forfeit'});
(async () => {
 const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try { res.writeHead(200, {'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)] || 'application/octet-stream'}).end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
 });
 await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  for (const width of [1440,1000,390,320]) {
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[], queries=[];let mode='normal';
   await page.addInitScript(()=>{window.fixtureClipboard='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.fixtureClipboard=text;}}});});
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{
    const url=route.request().url();
    if (url.startsWith(api)) {
     const query=new URL(url).searchParams;queries.push(query.toString());
     if(mode==='error')return route.fulfill({status:503,json:{error:'PRIVATE_INTERNAL_ERROR'}});
     if(mode==='invalid')return route.fulfill({json:{replays:[{...summary('a'),id:'javascript:alert(1)'}],cursor:null}});
     if(mode==='xss')return route.fulfill({json:{replays:[summary('d','<img src=x onerror=alert(1)>')],cursor:null}});
     if(mode==='empty')return route.fulfill({json:{replays:[],cursor:null}});
     if(query.get('player'))return route.fulfill({json:{replays:[summary('c','Carla')],cursor:null}});
     if(query.get('cursor'))return route.fulfill({json:{replays:[summary('b'),summary('a')],cursor:null}});
     return route.fulfill({json:{replays:[summary('a')],cursor:'nextToken'}});
    }
    return url.startsWith(origin)?route.continue():route.abort();
   });
   await page.goto(origin+'/replay.html');
   await page.waitForFunction(()=>document.querySelectorAll('#replay-list li').length===1);
   assert.equal(await page.locator('#replay-list img').count(),0);
   assert((await page.locator('#replay-list').textContent()).includes('Forfeit'));
   assert.equal(await page.locator('#replay-list a').first().getAttribute('href'),'/replay.html?id='+'a'.repeat(32));
   assert.equal(await page.locator('.wordmark').getAttribute('href'),'/copa-rinha.html');
   assert.equal(await page.getByRole('link',{name:'Assistir',exact:true}).getAttribute('href'),origin+'/replay.html?id='+'a'.repeat(32));
   await page.getByRole('button',{name:'Copiar link',exact:true}).click();
   assert.equal(await page.evaluate(()=>fixtureClipboard),origin+'/replay.html?id='+'a'.repeat(32));
   assert.equal(await page.locator('#library-status').textContent(),'Link copiado.');
   assert.equal(await page.locator('.player-shell').isVisible(),false);
   const buttonColor=await page.locator('#open-replay button').evaluate(el=>getComputedStyle(el).backgroundColor);
   assert.equal(buttonColor,'rgb(89, 217, 245)');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.COPA_SCREENSHOTS){await fs.mkdir(process.env.COPA_SCREENSHOTS,{recursive:true});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(process.env.COPA_SCREENSHOTS,`replay-library-${width}.png`),fullPage:true});}
   await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('Clipboard unavailable');};});
   await page.getByRole('button',{name:'Copiar link',exact:true}).click();
   assert((await page.locator('#library-status').textContent()).includes('Copie o link: '+origin+'/replay.html?id='+'a'.repeat(32)));
   await page.locator('#more-replays').click();
   await page.waitForFunction(()=>document.querySelectorAll('#replay-list li').length===2);
   assert(queries.includes('cursor=nextToken'));
   assert(await page.locator('#more-replays').isHidden());
   await page.locator('#replay-player').fill('Carla');await page.locator('#replay-filter button').click();
   await page.waitForFunction(()=>document.querySelector('#replay-list').textContent.includes('Carla'));
   assert.equal(await page.locator('#replay-list li').count(),1);assert(queries.includes('player=carla'));
   mode='xss';await page.locator('#replay-player').fill('');await page.locator('#replay-filter button').click();
   await page.waitForFunction(()=>document.querySelector('#replay-list').textContent.includes('<img'));
   assert.equal(await page.locator('#replay-list img').count(),0);
   for(const value of ['empty','error','invalid']){
    mode=value;await page.locator('#replay-player').fill('');await page.locator('#replay-filter button').click();
    await page.waitForFunction(()=>!document.querySelector('#replay-filter button').disabled);
    assert.equal(await page.locator('#replay-list li').count(),0);
    assert(!(await page.locator('#library-status').textContent()).includes('PRIVATE_INTERNAL_ERROR'));
    if(value==='empty')assert((await page.locator('#library-status').textContent()).includes('Nenhum replay público'));
    else assert((await page.locator('#library-status').textContent()).includes('Não foi possível'));
   }
   await page.locator('#replay-link').fill('bad');await page.locator('#open-replay button').click();
   assert.equal(await page.locator('#status').textContent(),'Link de replay inválido.');
   assert.deepEqual(errors,[]);await page.close();
   console.log(`Public library, pagination/dedup, player search, errors, XSS, old-link form and responsive layout passed at ${width}px`);
  }
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
