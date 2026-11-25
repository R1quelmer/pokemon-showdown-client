// Native Copa presence UI with synthetic WebSocket replies. No production user,
// private data or account service is contacted by this regression.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const endpoint = /^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/;
const alice = {name: 'Alice', avatar: 'lucas', status: '', statusType: 'online'};
const bob = {name: 'Bob', avatar: 'ethan', status: 'Preparando equipe', statusType: 'busy'};
const carla = {name: 'Carla', avatar: 'dawn', status: 'Disponível', statusType: 'online'};
const presence = (users, guests) => ({total: users.length + guests, guests, users});

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
			let accountName = '';
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
					if (/\/cmd copapresence(?:\s|$)/.test(message)) {
						if (fixture.mode !== 'hold') ws.send('|queryresponse|copapresence|' + JSON.stringify(fixture.mode === 'null' ? null : fixture.snapshot));
					} else if (/\/cmd rooms(?:\s|$)/.test(message)) {
						ws.send('|queryresponse|rooms|' + JSON.stringify({userCount: 99, battleCount: 0, chat: [], sectionTitles: []}));
					} else if (/\/cmd userdetails bob(?:\s|$)/.test(message)) {
						ws.send('|queryresponse|userdetails|' + JSON.stringify({...bob, userid: 'bob', rooms: {}, group: ' '}));
					} else if (/\/cmd ping(?:\s|$)/.test(message)) {
						ws.send('|queryresponse|ping|');
					}
				});
			});
			await page.route('**/*', route => {
				const url = route.request().url();
				if (url.startsWith('https://copa-rinha-showdown.onrender.com/copa-rinha/accounts/')) {
					const data = route.request().postDataJSON();
					if (data.name) accountName = data.name;
					return route.fulfill({json: {name: accountName, token: 'a'.repeat(43), expires: Date.now() + 30 * 86400000}});
				}
				if (/\/(?:action\.php|crossdomain\.php|testclient-key\.php)(?:[?#]|$)/.test(new URL(url).pathname)) {
					fixture.authRequests.push(url); return route.abort();
				}
				if (url.includes('/config/config.js')) return route.fulfill({contentType: 'text/javascript', body:
					"var Config={customcolors:{},whitelist:[],routes:{client:'play.pokemonshowdown.com'},defaultserver:{id:'showdown',host:'sim3.psim.us',port:443}};"});
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
			const counter = page.locator('[data-href="copaonline"]');
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
			assert((await list.textContent()).toLowerCase().includes('visitante'));
			const avatars = await list.locator('img').evaluateAll(images => images.map(image => image.src));
			assert(avatars.some(url => url.endsWith('/trainers/ethan.png')), 'native avatar resolver is used');
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
