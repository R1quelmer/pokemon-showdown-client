// Native Copa presence UI with synthetic WebSocket replies. No production user,
// private data or account service is contacted by this regression.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const {serveNativeSprite, assertSpriteElementsLoaded} = require('./copa-sprite-assets.cjs');

const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const endpoint = /^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/;
const alice = {name: 'Alice', avatar: 1, status: '', statusType: 'online'};
const bob = {name: 'Bob', avatar: 'ethan', status: 'Preparando equipe', statusType: 'busy', inBattle: true};
const carla = {name: 'Carla', avatar: 'dawn', status: 'Disponível', statusType: 'online'};
const presence = (users, guests) => ({total: users.length + guests, guests, users});
const publicBattle = 'battle-gen9coparinhanationaldexza-42';
const members = [
	{name: 'Davi', avatar: 'ethan', online: false, rooms: []},
	{name: 'Carla', avatar: 'dawn', online: false, rooms: []},
	{name: 'Bob', avatar: 'ethan', online: true, battle: publicBattle, rooms: ['Lobby']},
	{name: 'Alice', avatar: 1, online: true, rooms: ['Lobby']},
];

(async () => {
	const server = http.createServer(async (req, res) => {
		const pathname = new URL(req.url, 'http://localhost').pathname;
		const file = path.resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
		if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
		try {
			const type = {'.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png',
				'.json': 'application/json', '.woff2': 'font/woff2'}[path.extname(file)];
			res.writeHead(200, {'Content-Type': type || 'application/octet-stream'}).end(await fs.readFile(file));
		} catch { res.writeHead(404).end(); }
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${server.address().port}`;
	let browser;
	try {
		browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
		for (const width of [1440, 1000, 390, 320]) {
			const context = await browser.newContext({viewport: {width, height: 900}});
			const page = await context.newPage();
			const fixture = {snapshot: presence([alice, bob], 2), requests: [], errors: [], authRequests: [],
				mode: 'normal', socket: null, connections: 0, holdHandshake: false};
			let accountName = '', partner;
			page.on('pageerror', error => fixture.errors.push(error.message));
			await page.addInitScript(() => { window.Worker = undefined; });
			await page.clock.install();
			await page.routeWebSocket(endpoint, ws => {
				fixture.socket = ws; fixture.connections++;
				const handshake = () => ws.send(
					`|formats|,1|Copa Rinha|[Gen 9] Copa Rinha II,e\n|updateuser| Guest 1|0|167\n|challstr|4|presence-${width}-${fixture.connections}`
				);
				fixture.handshake = handshake;
				if (!fixture.holdHandshake) handshake();
				ws.onMessage(raw => {
					const message = String(raw); fixture.requests.push(message);
					const renamed = /^\|?\/trn ([^,\r\n]+)(?:,0,copa)?$/.exec(message);
					if (renamed) return ws.send(`|updateuser| ${renamed[1]}|1|167`);
					if (message.endsWith('/cmd copapresence members')) {
						ws.send('|queryresponse|copapresence|' + JSON.stringify({...fixture.snapshot, members: fixture.members}));
					} else if (/\/cmd copapresence(?:\s|$)/.test(message)) {
						if (fixture.mode !== 'hold') ws.send('|queryresponse|copapresence|' + JSON.stringify(fixture.mode === 'null' ? null : fixture.snapshot));
					} else if (/\/cmd rooms(?:\s|$)/.test(message)) {
						ws.send('|queryresponse|rooms|' + JSON.stringify({userCount: 99, battleCount: 0, chat: [], sectionTitles: []}));
					} else if (/\/cmd userdetails bob(?:\s|$)/.test(message)) {
						ws.send('|queryresponse|userdetails|' + JSON.stringify({
							...bob, userid: 'bob', rooms: {privatefixture: {isPrivate: true}}, group: ' ',
						}));
					} else if (/\/cmd ping(?:\s|$)/.test(message)) {
						ws.send('|queryresponse|ping|');
					}
				});
			});
			await page.route('**/*', async route => {
				const url = route.request().url();
				if (url.startsWith('https://copa-rinha-showdown.onrender.com/copa-rinha/accounts/')) {
					const data = route.request().postDataJSON();
					if (url.endsWith('/partner')) {
						assert.equal(route.request().headers().authorization, 'Bearer ' + 'a'.repeat(43));
						partner = data.partner;
						return route.fulfill({json: {partner}});
					}
					if (url.endsWith('/profile')) {
						const row = members.find(member => member.name === data.name);
						return route.fulfill({json: {member: row ? {...row, partner: data.name === 'Alice' ? partner : undefined} : null}});
					}
					if (data.name) accountName = data.name;
					return route.fulfill({json: {name: accountName, token: 'a'.repeat(43), expires: Date.now() + 30 * 86400000}});
				}
				if (/\/(?:action\.php|crossdomain\.php|testclient-key\.php)(?:[?#]|$)/.test(new URL(url).pathname)) {
					fixture.authRequests.push(url); return route.abort();
				}
				if (url.includes('/config/config.js')) return route.fulfill({contentType: 'text/javascript', body:
					"var Config={customcolors:{},whitelist:[],routes:{client:'play.pokemonshowdown.com'},defaultserver:{id:'showdown',host:'sim3.psim.us',port:443}};"});
				if (await serveNativeSprite(route)) return;
				return url.startsWith(origin) ? route.continue() : route.abort();
			});
			await page.goto(origin + '/copa-rinha.html');
			await page.waitForFunction(() => window.PS?.connection?.connected && !PS.user.initializing);
			await page.locator('input[name=username]').fill('Alice');
			await page.locator('input[name=copapassword]').fill('fixture-copa-exclusive-password');
			await page.locator('form:has(input[name=username]) button[type=submit]').click();
			await page.waitForFunction(() => PS.user.name === 'Alice' && PS.user.loggingIn === null);
			if (width >= 1000) {
				await page.evaluate(() => { window.copaNavigationMarker = 'same-document'; PS.join('teambuilder'); });
				const connections = fixture.connections;
				await page.locator('a.copa-brand').first().click();
				assert.equal(await page.evaluate(() => window.copaNavigationMarker), 'same-document');
				assert.equal(await page.evaluate(() => PS.user.name), 'Alice');
				assert.equal(fixture.connections, connections, 'logo preserves the connection');
			}
			await page.evaluate(() => PS.join('rooms'));
			const counter = page.locator('#room-rooms [data-href="copaonline"]');
			await counter.waitFor({state: 'visible'});
			await page.waitForFunction(() => document.querySelector('[data-href="copaonline"]')?.textContent.includes('4'));
			await counter.click();
			const list = page.locator('.copa-online');
			await list.waitFor({state: 'visible'});
			await list.locator('[data-href="user-bob"]').waitFor({state: 'visible'});
			assert.equal(await list.locator('[data-href="user-alice"]').count(), 1);
			assert.equal(await list.locator('[data-href="user-bob"]').count(), 1);
			assert.equal(await list.locator('[data-href="challenge-bob"]').isEnabled(), true);
			assert.equal(await list.locator('[data-href="challenge-alice"]').isDisabled(), true);
			assert((await list.textContent()).includes('Preparando equipe'));
			assert((await list.textContent()).includes('Em batalha'));
			assert((await list.textContent()).toLowerCase().includes('visitante'));
			const avatars = await list.locator('img').evaluateAll(images => images.map(image => image.src));
			assert(avatars.some(url => url.endsWith('/trainers/ethan.png')), 'native avatar resolver is used');
			assert(avatars.some(url => url.endsWith('/trainers/lucas.png')), 'numeric avatars use the native mapping');
			await assertSpriteElementsLoaded(page, '.copa-online img');
			assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'presence fits the viewport');
			const box = await list.boundingBox();
			assert(box.x >= 0 && box.x + box.width <= width, `presence modal fits ${width}px`);
			if (process.env.COPA_PRESENCE_SCREENSHOTS) {
				await fs.mkdir(process.env.COPA_PRESENCE_SCREENSHOTS, {recursive: true});
				await page.screenshot({path: path.join(process.env.COPA_PRESENCE_SCREENSHOTS, `presence-${width}.png`), fullPage: true});
			}

			// Use the actual native profile and challenge actions, rather than
			// constructing replacement UI or sending an unsolicited battle challenge.
			await list.locator('[data-href="user-bob"]').click();
			await page.waitForFunction(() => !!PS.rooms['user-bob']);
			assert((await page.locator('.userdetails').last().textContent()).includes('Bob'));
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join('copaonline'); });
			await list.locator('[data-href="challenge-bob"]').click();
			await page.waitForFunction(() => !!PS.rooms['dm-bob']?.challengeMenuOpen);
			assert.equal(fixture.requests.some(message => /\/challenge bob,/.test(message)), false, 'opens native challenge form without sending a battle');
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join('rooms'); PS.join('copaonline'); });

			fixture.snapshot = presence([alice, carla], 1);
			await page.clock.fastForward(15050);
			await list.locator('[data-href="user-carla"]').waitFor({state: 'visible'});
			assert.equal(await list.locator('[data-href="user-bob"]').count(), 0, 'departed player disappears automatically');
			assert((await counter.textContent()).includes('3'), 'counter refreshes independently of stale rooms snapshot');
			fixture.snapshot = {...presence([alice, bob], 2), ip: '198.51.100.28', connections: ['private-socket-id'],
				users: [alice, {...bob, status: '<img src=x onerror=alert(1)>'}, {...bob, name: 'BOB'}]};
			await page.clock.fastForward(15050);
			await list.locator('[data-href="user-bob"]').waitFor({state: 'visible'});
			assert.equal(await list.locator('[data-href="user-bob"]').count(), 1, 'duplicate identities render once');
			assert.equal(await list.locator('img[src="x"]').count(), 0, 'status remains text');
			assert(!(await list.innerHTML()).includes('198.51.100.28'));
			assert(!(await list.innerHTML()).includes('private-socket-id'));

			const queries = () => fixture.requests.filter(message => /\/cmd copapresence(?:\s|$)/.test(message)).length;
			await page.evaluate(() => {
				Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
				Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
				document.dispatchEvent(new Event('visibilitychange'));
			});
			const hiddenQueries = queries(); await page.clock.fastForward(30050);
			assert.equal(queries(), hiddenQueries, 'background tabs do not poll presence');
			fixture.snapshot = presence([alice, carla], 0);
			await page.evaluate(() => {
				Object.defineProperty(document, 'hidden', {configurable: true, get: () => false});
				Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'visible'});
				document.dispatchEvent(new Event('visibilitychange'));
			});
			await list.locator('[data-href="user-carla"]').waitFor({state: 'visible'});

			fixture.mode = 'null'; await page.clock.fastForward(15050);
			await page.waitForFunction(() => !document.querySelector('.copa-online [data-href="user-carla"]'));
			assert((await list.textContent()).match(/indispon|compat|suport/i), 'unsupported query has an explicit unavailable state');
			fixture.mode = 'normal'; await page.clock.fastForward(15050);
			await list.locator('[data-href="user-carla"]').waitFor({state: 'visible'});
			fixture.mode = 'hold'; await page.clock.fastForward(15050); await page.clock.fastForward(10050);
			assert.equal(await list.locator('[data-href="user-carla"]').count(), 0, 'timed-out snapshot is not shown as currently online');
			fixture.mode = 'normal'; await page.clock.fastForward(15050);
			await list.locator('[data-href="user-carla"]').waitFor({state: 'visible'});

			fixture.holdHandshake = true;
			fixture.socket.close({code: 1012, reason: 'Synthetic restart'});
			await page.waitForFunction(() => !PS.connection.connected);
			assert.equal(await list.locator('[data-href="user-carla"]').count(), 0, 'disconnect invalidates stale online actions');
			fixture.holdHandshake = false; await page.clock.fastForward(1050);
			if (fixture.connections >= 2) fixture.handshake();
			await page.waitForFunction(() => PS.connection.connected && PS.user.name === 'Alice' && !PS.user.loggingIn);
			await page.clock.fastForward(15050);
			await list.locator('[data-href="user-carla"]').waitFor({state: 'visible'});
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join('options'); });
			await page.getByRole('button', {name: 'Pokémon parceiro'}).click();
			const settings = page.locator('.copa-partner-picker');
			const species = settings.getByRole('combobox', {name: 'Espécie ou forma'});
			await species.fill('Greninja-Mega');
			await settings.getByRole('checkbox', {name:'Shiny'}).check();
			const mega = settings.getByRole('img', {name:'Greninja-Mega · Shiny'});
			assert((await mega.getAttribute('src')).endsWith('/partner-za/greninjamega-shiny.png'));
			await assertSpriteElementsLoaded(page, '.copa-partner-picker .copa-partner-sprite img');
			await species.fill('Rotom-Wash');
						await settings.getByRole('button', {name:'Salvar'}).click();
			await settings.waitFor({state:'hidden'});
			assert.deepEqual(partner, {species:'rotomwash', shiny:true});
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join('options'); });
			await page.getByRole('button', {name: 'Pokémon parceiro'}).click();
			await species.waitFor();
			await page.waitForFunction(() => document.querySelector('.copa-partner-picker input[type=text]')?.value === 'Rotom-Wash');
			assert(await settings.getByRole('checkbox', {name:'Shiny'}).isChecked());
			await settings.getByRole('button', {name:'Cancelar'}).click();
			fixture.members = members.map(member => member.name === 'Alice' ? {...member, partner} : member);
			await page.evaluate(() => {
				PS.closePopupsAbove(null);
				PS.leave('dm-bob');
				PS.leave('news');
				PS.join('');
			});
			await page.locator('a[href="copamembers"]').click();
			const directory = page.locator('.copa-members');
			await directory.getByText('4 cadastrados · 2 conectados').waitFor();
			const nicknames = () => directory.locator('li .copa-online-player button').allTextContents();
			assert.deepEqual(await nicknames(), ['Alice', 'Bob', 'Carla', 'Davi']);
			assert.equal(await directory.locator('li').filter({hasText: 'Carla'}).getByText('Offline').count(), 1);
			const battleLink = directory.getByRole('link', {name: 'Em batalha pública'});
			assert.equal(await battleLink.getAttribute('href'), '/' + publicBattle);
			assert.equal(await directory.getByRole('link').count(), 1, 'online and offline statuses are plain text');
			assert.equal(await directory.getByRole('button', {name: 'Assistir'}).count(), 0);
			if (width === 1440) {
				await battleLink.hover();
				assert.equal(await battleLink.evaluate(link => getComputedStyle(link).textDecorationLine), 'underline');
			}
			assert.equal(await directory.getByText('Lobby', {exact: true}).count(), 2);
			await assertSpriteElementsLoaded(page, '.copa-members img');
			const directoryBox = await directory.boundingBox();
			assert(directoryBox.x >= 0 && directoryBox.x + directoryBox.width <= width);
			if (process.env.COPA_MEMBERS_SCREENSHOTS && [1440, 390].includes(width)) {
				await fs.mkdir(process.env.COPA_MEMBERS_SCREENSHOTS, {recursive: true});
				await page.screenshot({path: path.join(process.env.COPA_MEMBERS_SCREENSHOTS, `membros-${width}.png`)});
			}
			const ownAvatar = directory.getByRole('button', {name:'Ver perfil de Alice'});
			const sprite = directory.getByRole('img', {name:'Rotom-Wash · Shiny'});
			await sprite.waitFor();
			assert((await sprite.getAttribute('src')).endsWith('/gen5-shiny/rotom-wash.png'));
			await ownAvatar.click();
			const enlarged = page.locator('.copa-profile');
			await enlarged.getByRole('img', {name:'Rotom-Wash · Shiny'}).waitFor({timeout:5000});
			assert.equal(await page.locator('#room-avatars').count(),0);
			assert((await enlarged.locator('.copa-online-avatar').boundingBox()).width > 80);
			if (process.env.COPA_MEMBERS_SCREENSHOTS && [1440, 390].includes(width)) {
				await page.screenshot({path: path.join(process.env.COPA_MEMBERS_SCREENSHOTS, `perfil-${width}.png`)});
			}
			await enlarged.getByRole('button', {name:'Fechar'}).click();
			const search = directory.getByRole('searchbox');
			await search.fill('CAR');
			assert.deepEqual(await nicknames(), ['Carla']);
			await search.fill('ninguem');
			await directory.getByText('Nenhum membro encontrado.').waitFor();
			await search.fill('');
			fixture.members = members.map(member => member.name === 'Carla' ? {...member, online: true} : member);
			await page.clock.fastForward(15050);
			await directory.getByText('4 cadastrados · 3 conectados').waitFor();
			assert.deepEqual(await nicknames(), ['Alice', 'Bob', 'Carla', 'Davi']);
			await directory.getByRole('button', {name: 'Bob', exact: true}).click();
			await page.waitForFunction(() => !!PS.rooms['user-bob']?.args?.copaMember);
			const profile = page.locator('[id="room-user-bob"]');
			await profile.locator('[data-href="challenge-bob"]').waitFor();
			assert.equal(await profile.locator('a[href="/privatefixture"]').count(), 0);
			await profile.locator('[data-href="dm-bob"]').click();
			await page.waitForFunction(() => !!PS.rooms['dm-bob']);
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join('copamembers'); });
			await directory.getByRole('button', {name: 'Bob', exact: true}).click();
			await profile.locator('[data-href="challenge-bob"]').click();
			await page.waitForFunction(() => !!PS.rooms['dm-bob']?.challengeMenuOpen);
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join('copamembers'); });
			await battleLink.click();
			await page.waitForFunction(id => !!PS.rooms[id], publicBattle);
			if (width === 1440) {
				await page.evaluate(id => {
					PS.prefs.set("mute",true);
					PS.receive('>' + id + '\n|init|battle\n|title|Bob vs. Alice\n|gametype|singles\n|gen|9\n' +
						'|player|p1|Alice|167\n|player|p2|Bob|ethan\n|start\n|turn|1');
				},publicBattle);
				await page.getByRole('button', {name:'Ver perfil de Bob'}).click({timeout:8000});
				await page.locator('.copa-profile').getByRole('heading', {name:'Bob'}).waitFor();
			}
			assert.deepEqual(fixture.errors, []); assert.deepEqual(fixture.authRequests, []);
			assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			console.log(`Native presence counter/list, dedup, anonymous/privacy, profile/challenge, automatic updates, visibility/reconnect/errors and layout passed at ${width}px`);
			await context.close();
		}
	} finally {
		if (browser) await browser.close();
		await new Promise(resolve => server.close(resolve));
	}
})().catch(error => { console.error(error); process.exitCode = 1; });
