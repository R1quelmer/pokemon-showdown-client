// Trainer Card browser coverage with isolated account, presence and replay services.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const {serveNativeSprite, assertSpriteElementsLoaded} = require('./copa-sprite-assets.cjs');

const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const endpoint = 'https://copa-rinha-showdown.onrender.com';
const screenshots = process.env.COPA_TRAINER_SCREENSHOTS;
const member = {name:'Alice', avatar:'marnie', partner:{species:'sylveon', shiny:false}, online:true, rooms:['Lobby']};
const pokemon = (species, shiny = false) => ({species, shiny});
const team = [pokemon('sylveon'), pokemon('greninjamega'), pokemon('charizardmegax'), pokemon('rotomwash', true),
	pokemon('kingambit'), pokemon('landorustherian')];

(async () => {
	const server = http.createServer(async (req, res) => {
		const pathname = new URL(req.url, 'http://localhost').pathname;
		const file = path.resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
		if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
		try {
			const body = await fs.readFile(file);
			const type = {'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png',
				'.jpg':'image/jpeg','.json':'application/json','.woff2':'font/woff2'}[path.extname(file)];
			res.writeHead(200, {'Content-Type':type || 'application/octet-stream'}).end(body);
		} catch { res.writeHead(404).end(); }
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${server.address().port}`;
	const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
	try {
		for (const width of [1440,390]) {
			const context = await browser.newContext({viewport:{width,height:width < 500 ? 640 : 900}, hasTouch:width < 500});
			const page = await context.newPage();
			const errors = [];
			const messages = [];
			page.on('pageerror', error => errors.push(error.message));
			const initial = {region:'Unova', dreamTeam:team, banner:'', bio:'Treinadora de Unova. Minha dupla é Marnie e Sylveon.'};
			let card = structuredClone(initial), socket;
			await page.addInitScript(() => {
				window.Worker = undefined;
				localStorage.setItem('copa-rinha:account-session:v1', JSON.stringify({
					name:'Alice', token:'a'.repeat(43), expires:Date.now()+86400000,
				}));
			});
			await page.routeWebSocket(/^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/, ws => {
				socket = ws;
				ws.send('|formats|,1|Copa Rinha|[Gen 9] Copa Rinha II,e\n|updateuser| Guest 1|0|167\n|challstr|4|fixture');
				ws.onMessage(raw => {
					const msg = String(raw);
					messages.push(msg);
					if (msg.endsWith('/cmd userdetails bob')) ws.send('|queryresponse|userdetails|' +
						JSON.stringify({userid:'bob', name:'Bob', avatar:'ethan', rooms:{lobby:{}}}));
					if (msg.includes('/trn Alice')) ws.send('|updateuser| Alice|1|marnie');
					if (msg.includes('/join lobby')) ws.send('>lobby\n|init|chat\n|title|Lobby');
					if (msg.includes('/cmd copapresence')) ws.send('|queryresponse|copapresence|' +
						JSON.stringify({members:[member], users:[{...member,status:"",statusType:"online"}], guests:0,total:1}));
				});
			});
			await page.route('**/*', async route => {
				const url = new URL(route.request().url());
				if (url.href.startsWith(endpoint + '/copa-rinha/accounts/')) {
					const action = url.pathname.split('/').pop();
					if (action === 'edit-trainer') {
						assert.equal(route.request().headers().authorization, 'Bearer ' + 'a'.repeat(43));
						const changes = route.request().postDataJSON().card;
							assert.deepEqual(Object.keys(changes).sort(), ['banner','bio']);
							card = {...card, ...changes};
						return route.fulfill({json:{card}});
					}
					if (action === 'trainer' && route.request().postDataJSON().name !== 'alice') {
						return route.fulfill({json:{trainer:null}});
					}
					if (action === 'trainer') return route.fulfill({json:{trainer:{
						...member, registeredAt:'2026-11-19T20:00:00Z', badges:['Johto','Unova','Galar'], card,
						stats:{total:12,wins:8,losses:3},
					}}});
					if (action === 'profile') return route.fulfill({json:{member}});
					return route.fulfill({json:{name:'Alice',token:'a'.repeat(43),expires:Date.now()+86400000}});
				}
				if (url.href.startsWith(endpoint + '/copa-rinha/replays/')) {
					assert.equal(url.searchParams.get('player'), 'alice');
					const next = !!url.searchParams.get('cursor');
					return route.fulfill({json:{cursor:next ? null : 'next', replays:[{
						id:(next ? 'b' : 'a').repeat(32), createdAt:'2026-11-23T20:00:00Z',
						players:[{name:'Alice',userid:'alice'},{name:next ? 'Davi' : 'Bob',userid:next ? 'davi' : 'bob'}],
						winner:next ? 'Davi' : 'Alice',
					}]}});
				}
				if (url.pathname.endsWith('/config/config.js')) return route.fulfill({contentType:'text/javascript',body:
					"var Config={customcolors:{},whitelist:[],routes:{client:'play.pokemonshowdown.com'},defaultserver:{id:'showdown',host:'sim3.psim.us',port:443}};"});
				if (await serveNativeSprite(route, false)) return;
				return url.origin === origin ? route.continue() : route.abort();
			});
			await page.goto(origin);
			await page.waitForFunction(() => window.PS?.user?.named);
			const home = page.locator('#room-');
			const trainer = page.locator('#room-copatrainer-alice .copa-trainer');
			const popup = page.locator('#room-copatrainer-alice.ps-popup');
			const editor = page.locator('#room-copatraineredit-alice.ps-room .copa-trainer');
			const heading = trainer.getByRole('heading', {name:'Alice',exact:true});
			const capture = async (name, area = trainer) => {
				if (!screenshots) return;
				await fs.mkdir(screenshots,{recursive:true});
				await area.screenshot({path:path.join(screenshots,`${name}-${width}.png`)});
			};
			for (const shortcut of ['button','link']) {
				await page.locator('button[data-href="options"]:visible').last().click();
				const settings = page.locator('#room-options');
				await settings.getByRole(shortcut,{name:shortcut === 'button' ? 'Meu perfil' : 'Alice',exact:true}).click();
				await settings.waitFor({state:'hidden'});
				await popup.waitFor();
				await trainer.getByRole('button',{name:'Editar perfil'}).waitFor();
				await popup.getByRole('button',{name:'Fechar perfil'}).click();
				await popup.waitFor({state:'hidden'});
			}
			await home.locator('a[href="copamembers"]').click();
			await page.locator('#room-copamembers').getByRole('link',{name:'Alice',exact:true}).click();
			await heading.waitFor();
			assert.deepEqual(await trainer.locator('nav button').allTextContents(), ['Insígnias','Visão geral','Replays']);
			const dream = trainer.getByRole('region',{name:'Hall da Fama de Unova'});
			const grid = dream.locator('.copa-trainer-team');
			const tabs = trainer.getByRole('navigation',{name:'Seções do perfil'});
			const badgesTab = tabs.getByRole('button',{name:'Insígnias'});
			assert.equal(await badgesTab.getAttribute('aria-pressed'), 'true');
			assert((await dream.boundingBox()).y < (await tabs.boundingBox()).y);
			assert.equal(await grid.locator('li').count(),6);
			assert.equal(await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), width > 700 ? 6 : 3);
			await assertSpriteElementsLoaded(page, '#room-copatrainer-alice img');
			await trainer.locator('[data-profile-tight]').nth(1).waitFor();
			await popup.waitFor();
			assert.equal(await editor.count(),0);
			if (width < 500) {
				const scrolling = await popup.evaluate(el => {
					const overflows = el.scrollHeight > el.clientHeight;
					el.scrollTop = el.scrollHeight;
					const scrolled = el.scrollTop > 0;
					el.scrollTop = 0;
					return overflows && scrolled;
				});
				assert(scrolling, 'mobile profile scrolls inside the popup');
			}
			await capture('popup', page.locator('body'));
			const badges = trainer.getByRole('region',{name:'Insígnias regionais'});
			assert.equal(await badges.getByRole('button').count(), 10);
			assert.equal(await badges.locator('.earned').count(), 3);
			assert.equal(await badges.locator('.locked').count(), 7);
			assert.deepEqual(await badges.locator('img').evaluateAll(images => images.map(image => {
				const region = image.parentElement.querySelector('span').textContent.toLowerCase();
				const style = getComputedStyle(image);
				return [image.src.endsWith(`/${region}.png`), style.imageRendering, style.filter];
			})), ['locked','earned','locked','locked','earned','locked','locked','earned','locked','locked']
				.map(state => [true, 'pixelated', state === 'earned' ? 'none' : 'grayscale(1) brightness(0.5)']));
			await badges.getByRole('button',{name:'Johto · Conquistada'}).click();
			await badges.getByRole('status').getByText('Johto · Conquistada').waitFor();
			await capture('insignias', badges);
			const lockedBadge = badges.getByRole('button',{name:'Kanto · Bloqueada'});
			if (width < 500) await lockedBadge.tap();
			else {
				await lockedBadge.hover();
				assert.equal(await lockedBadge.getAttribute('title'), 'Kanto');
				await lockedBadge.click();
			}
			await badges.getByRole('status').getByText('Kanto · Bloqueada').waitFor();
			await trainer.getByRole('button',{name:'Visão geral'}).click();
			await trainer.getByText('67%',{exact:true}).waitFor();
			await dream.waitFor({state:'visible'});
			await badges.waitFor({state:'hidden'});
			await capture('visao-geral');
			await trainer.getByRole('button',{name:'Replays',exact:true}).click();
			await trainer.getByText('Bob',{exact:true}).waitFor();
			await dream.waitFor({state:'visible'});
			await badges.waitFor({state:'hidden'});
			await trainer.getByRole('button',{name:'Carregar mais'}).click();
			await trainer.getByText('Davi',{exact:true}).waitFor();
			assert.deepEqual(await trainer.getByRole('link',{name:'Assistir'}).evaluateAll(links => links.map(link => link.search)),
				[`?id=${'a'.repeat(32)}`,`?id=${'b'.repeat(32)}`]);
			await capture('replays');
			await badgesTab.click();
			await badges.waitFor({state:'visible'});
			await dream.waitFor({state:'visible'});
			await trainer.getByRole('button',{name:'Editar perfil'}).click();
			await editor.getByLabel('Biografia').fill('Biografia atualizada.');
			assert.equal(await editor.getByLabel('Pokémon 1').count(),0);
			assert.equal(await editor.getByLabel('Região de origem').count(),0);
			await editor.getByLabel('Fundo do cabeçalho').setInputFiles(path.join(root,'assets/copa-rinha/poliwhirl-wallpaper.jpg'));
			await page.waitForFunction(() => document.querySelector('.copa-trainer-header').style.backgroundImage.includes('data:image/jpeg'));
			await popup.waitFor({state:'hidden'});
			await capture('editar', editor);
			await editor.getByRole('button',{name:'Salvar perfil'}).click();
			await editor.getByRole('heading',{name:'Editar perfil'}).waitFor({state:'hidden'});
			assert.equal(card.bio,'Biografia atualizada.');
			assert.equal(card.dreamTeam[0].species,team[0].species);
			assert.match(card.banner,/^data:image\/jpeg;base64,/);
			await popup.waitFor();
			await capture('fundo-personalizado');
			await popup.getByRole('button',{name:'Fechar perfil'}).click();
			await popup.waitFor({state:'hidden'});
			await page.evaluate(() => PS.join(''));
			await home.locator('a[href="users"]').click();
			const lookup = page.locator('#room-users input[name=username]');
			await lookup.fill('Alice'); await lookup.press('Enter');
			await page.locator('#room-users').getByRole('link',{name:'Alice',exact:true}).click();
			await heading.waitFor();
			await page.keyboard.press('Escape');
			await popup.waitFor({state:'hidden'});
			await page.evaluate(() => PS.join(''));
			await home.locator('a[href="lobby"]').click();
			await page.locator('#room-lobby .chat-log').waitFor();
			await page.evaluate(() => {
				window.copaPopupTest = {lobby:PS.rooms.lobby, connection:PS.connection};
			});
			socket.send('>lobby\n|c| Alice|Olá\n|c| Bob|Olá também');
			const lobby = page.locator('#room-lobby');
			await lobby.locator('.chat-log .username').filter({hasText:'Alice'}).click();
			await heading.waitFor();
			assert.equal(await page.locator('#room-user-alice').count(),0);
			await capture('popup-no-lobby', page.locator('body'));
			await page.mouse.click(3,3);
			await popup.waitFor({state:'hidden'});
			assert(await page.evaluate(() => PS.room === window.copaPopupTest.lobby && PS.connection === window.copaPopupTest.connection));
			assert(!messages.includes('|/leave lobby'));
			await lobby.locator('.chat-log .username').filter({hasText:'Bob'}).click();
			const other = page.locator('#room-copatrainer-bob.ps-popup');
			await other.getByRole('heading',{name:'Bob',exact:true}).waitFor();
			assert.equal(await other.getByRole('button',{name:'Editar perfil'}).count(),0);
			await other.getByRole('button',{name:'Desafiar'}).click();
			await page.waitForFunction(() => PS.rooms['dm-bob']?.challengeMenuOpen);
			await page.evaluate(() => PS.join('lobby'));
			await lobby.locator('.chat-log .username').filter({hasText:'Bob'}).click();
			await other.getByRole('button',{name:'Mensagem'}).click();
			await other.waitFor({state:'hidden'});
			await page.waitForFunction(() => !!PS.rooms['dm-bob']);
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
			assert.deepEqual(errors,[]);
			console.log(`Trainer card, members/search/Lobby, static sprites, badges, replays and editing passed at ${width}px`);
			await context.close();
		}
	} finally {
		await browser.close();
		await new Promise(resolve => server.close(resolve));
	}
})().catch(error => { console.error(error); process.exitCode = 1; });
