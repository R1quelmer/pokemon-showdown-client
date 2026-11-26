// Native Copa presence UI with synthetic WebSocket replies. No production user,
// private data or account service is contacted by this regression.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const {serveNativeSprite, assertSpriteElementsLoaded, loadSprite} = require('./copa-sprite-assets.cjs');

const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const endpoint = /^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/;
const alice = {name: 'Alice', avatar: 1, status: '', statusType: 'online'};
const bob = {name: 'Bob', avatar: 'ethan', status: 'Preparando equipe', statusType: 'busy', inBattle: true};
const carla = {name: 'Carla', avatar: 'dawn', status: 'Disponível', statusType: 'online'};
const presence = (users, guests) => ({total: users.length + guests, guests, users});
const publicBattle = 'battle-gen9coparinhanationaldexza-42';
const wan = {name:'Wan', avatar:'lusamine-masters', online:false, rooms:[], partner:{species:'metagross',shiny:true}};
const members = [
	{name: 'Davi', avatar: 'ethan', online: false, rooms: []},
	{name: 'Carla', avatar: 'dawn', online: false, rooms: []},
	{name: 'Bob', avatar: 'ethan', online: true, battle: publicBattle, rooms: ['Lobby']},
	{name: 'Alice', avatar: 'marnie', online: true, rooms: ['Lobby']},
];

async function measurePairPixels(pair) {
	const shots = [];
	const scopes = ['.copa-profile-sprites', '.copa-battle-pair', '.copa-directory-pair'];
	for (const selector of [
		'img', '.copa-partner-sprite img', '.copa-online-avatar img',
	]) {
		const style = `${scopes.map(scope => `${scope} ${selector}`).join(',')}{visibility:hidden!important}`;
		const shot = await pair.screenshot({style, scale:'css'});
		shots.push(shot.toString('base64'));
	}
	return JSON.parse(execFileSync('python3', ['-c', `
import base64, io, json, math, sys
from PIL import Image, ImageChops
background, trainer, partner = [
    Image.open(io.BytesIO(base64.b64decode(image))).convert("RGB") for image in json.load(sys.stdin)
]
a, b = (ImageChops.difference(background, image).convert("L") for image in (trainer, partner))
right = [(max(x for x in range(a.width) if a.getpixel((x,y))), y)
         for y in range(a.height) if a.crop((0,y,a.width,y+1)).getbbox()]
left = [(min(x for x in range(b.width) if b.getpixel((x,y))), y)
        for y in range(b.height) if b.crop((0,y,b.width,y+1)).getbbox()]
gap = min(math.hypot(max(0, bx-ax-1), max(0, abs(ay-by)-1)) for ax,ay in right for bx,by in left)
print(json.dumps({"gap": gap, "baseDelta": abs(a.getbbox()[3] - b.getbbox()[3]), "partnerWidth": b.getbbox()[2] - b.getbbox()[0]}))
`], {input:JSON.stringify(shots), encoding:'utf8'}));
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const pathname = new URL(req.url, 'http://localhost').pathname;
		const file = path.resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
		if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
		try {
			const type = {'.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png',
				'.json': 'application/json', '.woff2': 'font/woff2'}[path.extname(file)];
			const contents = await fs.readFile(file);
			res.writeHead(200, {'Content-Type': type || 'application/octet-stream'}).end(contents);
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
					if (message === '|/join lobby') return ws.send('>lobby\n|init|chat\n|title|Lobby');
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
					if (url.endsWith('/trainer')) {
						const trainer = data.name === 'wan' ? {...wan, badges:[]} : null;
						return route.fulfill({json:{trainer}});
					}
					if (url.endsWith('/profile')) {
						if (data.name.toLowerCase() === 'wan') return route.fulfill({json:{member:wan}});
						const row = members.find(member => member.name.toLowerCase() === data.name.toLowerCase());
						return route.fulfill({json: {member: row ? {...row, partner: row.name === 'Alice' ? partner : {species:'sylveon',shiny:false}} : null}});
					}
					if (data.name) accountName = data.name;
					return route.fulfill({json: {name: accountName, token: 'a'.repeat(43), expires: Date.now() + 30 * 86400000}});
				}
				if (/\/(?:action\.php|crossdomain\.php|testclient-key\.php)(?:[?#]|$)/.test(new URL(url).pathname)) {
					fixture.authRequests.push(url); return route.abort();
				}
				if (url.includes('/config/config.js')) return route.fulfill({contentType: 'text/javascript', body:
					"var Config={customcolors:{},whitelist:[],routes:{client:'play.pokemonshowdown.com'},defaultserver:{id:'showdown',host:'sim3.psim.us',port:443}};"});
				if (await serveNativeSprite(route, false)) return;
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
			await list.locator('[data-href="copatrainer-bob"]').waitFor({state: 'visible'});
			assert.equal(await list.locator('[data-href="copatrainer-alice"]').count(), 1);
			assert.equal(await list.locator('[data-href="copatrainer-bob"]').count(), 1);
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
			await list.locator('[data-href="copatrainer-bob"]').click();
			await page.locator('#room-copatrainer-bob.ps-popup').getByRole('heading',{name:'Bob',exact:true}).waitFor();
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join('copaonline'); });
			await list.locator('[data-href="challenge-bob"]').click();
			await page.waitForFunction(() => !!PS.rooms['dm-bob']?.challengeMenuOpen);
			assert.equal(fixture.requests.some(message => /\/challenge bob,/.test(message)), false, 'opens native challenge form without sending a battle');
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join('rooms'); PS.join('copaonline'); });

			fixture.snapshot = presence([alice, carla], 1);
			await page.clock.fastForward(15050);
			await list.locator('[data-href="copatrainer-carla"]').waitFor({state: 'visible'});
			assert.equal(await list.locator('[data-href="copatrainer-bob"]').count(), 0, 'departed player disappears automatically');
			assert((await counter.textContent()).includes('3'), 'counter refreshes independently of stale rooms snapshot');
			fixture.snapshot = {...presence([alice, bob], 2), ip: '198.51.100.28', connections: ['private-socket-id'],
				users: [alice, {...bob, status: '<img src=x onerror=alert(1)>'}, {...bob, name: 'BOB'}]};
			await page.clock.fastForward(15050);
			await list.locator('[data-href="copatrainer-bob"]').waitFor({state: 'visible'});
			assert.equal(await list.locator('[data-href="copatrainer-bob"]').count(), 1, 'duplicate identities render once');
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
			await list.locator('[data-href="copatrainer-carla"]').waitFor({state: 'visible'});

			fixture.mode = 'null'; await page.clock.fastForward(15050);
			await page.waitForFunction(() => !document.querySelector('.copa-online [data-href="copatrainer-carla"]'));
			assert((await list.textContent()).match(/indispon|compat|suport/i), 'unsupported query has an explicit unavailable state');
			fixture.mode = 'normal'; await page.clock.fastForward(15050);
			await list.locator('[data-href="copatrainer-carla"]').waitFor({state: 'visible'});
			fixture.mode = 'hold'; await page.clock.fastForward(15050); await page.clock.fastForward(10050);
			assert.equal(await list.locator('[data-href="copatrainer-carla"]').count(), 0, 'timed-out snapshot is not shown as currently online');
			fixture.mode = 'normal'; await page.clock.fastForward(15050);
			await list.locator('[data-href="copatrainer-carla"]').waitFor({state: 'visible'});

			fixture.holdHandshake = true;
			fixture.socket.close({code: 1012, reason: 'Synthetic restart'});
			await page.waitForFunction(() => !PS.connection.connected);
			assert.equal(await list.locator('[data-href="copatrainer-carla"]').count(), 0, 'disconnect invalidates stale online actions');
			fixture.holdHandshake = false; await page.clock.fastForward(1050);
			if (fixture.connections >= 2) fixture.handshake();
			await page.waitForFunction(() => PS.connection.connected && PS.user.name === 'Alice' && !PS.user.loggingIn);
			await page.clock.fastForward(15050);
			await list.locator('[data-href="copatrainer-carla"]').waitFor({state: 'visible'});
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
			const nicknames = () => directory.locator('li .copa-online-player a[href^=copatrainer-]').allTextContents();
			assert.deepEqual(await nicknames(), ['Alice', 'Bob', 'Carla', 'Davi']);
			assert.equal(await directory.locator('li').filter({hasText: 'Carla'}).getByText('Offline').count(), 1);
			const battleLink = directory.getByRole('link', {name: 'Em batalha pública'});
			assert.equal(await battleLink.getAttribute('href'), '/' + publicBattle);
			assert.equal(await directory.locator('.copa-online-player small a').count(), 1, 'online and offline statuses are plain text');
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
			await directory.getByRole('button', {name:'Interagir com Alice',exact:true}).click();
			const compact = page.locator('#room-user-alice');
			const addStatus = compact.getByRole('button', {name:'Add status',exact:true});
			await addStatus.waitFor();
			const compactPair = compact.locator('.copa-directory-pair');
			await compactPair.getByRole('img', {name:'Rotom-Wash · Shiny'}).waitFor();
			const [pairBox, statusBox, popupBox] = await Promise.all([
				compactPair.boundingBox(), addStatus.boundingBox(), compact.boundingBox(),
			]);
			assert(statusBox.x >= pairBox.x + pairBox.width);
			assert(statusBox.x + statusBox.width <= popupBox.x + popupBox.width);
			if (process.env.COPA_MEMBERS_SCREENSHOTS && [1440,390].includes(width)) {
				await page.screenshot({path: path.join(process.env.COPA_MEMBERS_SCREENSHOTS, `compacto-${width}.png`)});
			}
			await addStatus.click();
			await compact.locator('textarea[name="statustext"]').waitFor({state:'visible'});
			await compact.getByRole('button', {name:'Cancel',exact:true}).click();
			await addStatus.waitFor();
			await page.evaluate(() => PS.leave('user-alice'));

			const ownAvatar = directory.getByRole('button', {name:'Ver perfil de Alice'});
			const sprite = directory.getByRole('img', {name:'Rotom-Wash · Shiny'});
			await sprite.waitFor();
			assert((await sprite.getAttribute('src')).endsWith('/gen5-shiny/rotom-wash.png'));
			await ownAvatar.click();
			const enlarged = page.locator('.copa-profile');
			await enlarged.getByRole('img', {name:'Rotom-Wash · Shiny'}).waitFor({timeout:5000});
			assert.equal(await page.locator('#room-avatars').count(),0);
			await enlarged.locator('[data-profile-tight]').nth(1).waitFor();
			const pair = enlarged.locator('.copa-profile-sprites');
			const trainer = await pair.locator('.copa-online-avatar').boundingBox();
			const pokemon = await pair.locator('.copa-partner-sprite').boundingBox();
			const block = await pair.boundingBox();
			assert(trainer.height > 75 && pokemon.height > 50);
			assert(Math.abs(trainer.y + trainer.height - pokemon.y - pokemon.height) <= 1, 'visible bases align');
			const pixels = await measurePairPixels(pair);
			assert(pixels.gap >= 4 && pixels.gap <= 8, JSON.stringify(pixels));
			assert(pixels.baseDelta <= 1, JSON.stringify(pixels));
			console.log(`Visible profile pixels at ${width}px:`, pixels);
			assert(Math.abs((trainer.x + pokemon.x + pokemon.width) / 2 - (block.x + block.width / 2)) <= 1);
			assert.equal(await pair.locator('img').evaluateAll(images =>
				images.every(image => getComputedStyle(image).imageRendering === 'pixelated' && !image.getAnimations().length)), true);
			if (process.env.COPA_MEMBERS_SCREENSHOTS && [1440, 390].includes(width)) {
				await page.screenshot({path: path.join(process.env.COPA_MEMBERS_SCREENSHOTS, `perfil-${width}.png`)});
			}
			await enlarged.getByRole('button', {name:'Fechar'}).click();
			partner = {species:'sylveon',shiny:false};
			fixture.members = fixture.members.map(row => row.name === 'Alice' ? {...row, avatar:'marnie', partner} : row);
			for (const entry of ['members','profile','settings']) {
				await page.evaluate(entry => {
					PS.closePopupsAbove(null);
					PS.user.avatar = 'marnie';
					PS.join(entry === 'members' ? 'copamembers' : entry === 'settings' ? 'options' : 'user-alice', {
						args:{username:'Alice'},
					});
					window.CopaRinhaPresence.refresh();
				}, entry);
				await page.clock.fastForward(15050);
				const scope = entry === 'members' ? '#room-copamembers' : entry === 'settings' ? '#room-options' : '#room-user-alice';
				await page.locator(scope + ' .copa-avatar-link[aria-label="Ver perfil de Alice"] img[src$="/marnie.png"]').waitFor({timeout:5000});
				await page.locator(scope)
					.getByRole('button', {name:'Ver perfil de Alice'}).click();
				await enlarged.getByRole('img', {name:'Sylveon', exact:true}).waitFor();
				await enlarged.locator('[data-profile-tight]').nth(1).waitFor();
				assert.match(await pair.locator('.copa-online-avatar img').getAttribute('src'), /marnie\.png$/);
				const visible = await measurePairPixels(pair);
				if (process.env.COPA_MEMBERS_SCREENSHOTS && [1440,390].includes(width)) {
					await pair.screenshot({path:path.join(process.env.COPA_MEMBERS_SCREENSHOTS, `sylveon-${entry}-${width}.png`)});
				}
				assert(visible.gap >= 4 && visible.gap <= 8 && visible.baseDelta <= 1, JSON.stringify(visible));
				console.log(`Sylveon via ${entry} at ${width}px:`, visible);
				await page.evaluate(() => PS.closePopupsAbove(null));
			}
			await page.evaluate(() => PS.join('copamembers'));

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
			await directory.getByRole('button', {name: 'Interagir com Bob', exact: true}).click();
			await page.waitForFunction(() => !!PS.rooms['user-bob']?.args?.copaMember);
			const profile = page.locator('[id="room-user-bob"]');
			const verifyBobPair = async (popup, entry) => {
				const duo = popup.locator('.copa-directory-pair');
				await duo.getByRole('img', {name:'Sylveon', exact:true}).waitFor();
				await duo.locator('[data-profile-tight]').nth(1).waitFor();
				await assertSpriteElementsLoaded(page, `#${await popup.getAttribute('id')} .copa-directory-pair img`);
				assert.equal(await duo.locator('img').evaluateAll(images => images.length === 2 && images.every(image =>
					image.src.endsWith('.png') && getComputedStyle(image).imageRendering === 'pixelated' &&
					!image.getAnimations().length)), true);
				const pixels = await measurePairPixels(duo);
				assert(pixels.gap <= 5 && pixels.baseDelta <= 1, `${entry} at ${width}px: ${JSON.stringify(pixels)}`);
				console.log(`Compact profile via ${entry} at ${width}px:`, pixels);
				if (process.env.COPA_MEMBERS_SCREENSHOTS && [1440, 390].includes(width)) {
					await popup.screenshot({path:path.join(process.env.COPA_MEMBERS_SCREENSHOTS, `perfil-${entry}-${width}.png`)});
				}
			};
			await verifyBobPair(profile, 'membros');
			await page.evaluate(() => PS.closePopupsAbove(null));
			await page.locator('#room- a[href="users"]').click();
			const lookupPopup = page.locator('#room-users');
			const username = lookupPopup.locator('input[name=username]');
			await username.fill('bob');
			await username.press('Enter');
			await verifyBobPair(lookupPopup, 'busca');
			await username.fill('Visitante');
			await username.press('Enter');
			await lookupPopup.getByRole('button', {name:'Ver perfil de Visitante'}).waitFor();
			assert.equal(await lookupPopup.locator('.copa-directory-pair').count(), 0);
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join(''); });
			await page.locator('#room- a[href="lobby"]').click();
			await page.locator('#room-lobby .chat-log').waitFor();
			fixture.socket.send(`>lobby\n|c:|${Math.floor(Date.now() / 1000)}| Bob|Olá`);
			await page.locator('#room-lobby .chat-log .username').filter({hasText:'Bob'}).click();
			await page.locator('#room-copatrainer-bob.ps-popup').getByRole('heading',{name:'Bob',exact:true}).waitFor();
			assert.equal(await profile.count(),0);
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join('copamembers'); });
			await directory.getByRole('button', {name: 'Interagir com Bob', exact: true}).click();
			await profile.locator('[data-href="challenge-bob"]').waitFor();
			assert.equal(await profile.locator('a[href="/privatefixture"]').count(), 0);
			await profile.locator('[data-href="dm-bob"]').click();
			await page.waitForFunction(() => !!PS.rooms['dm-bob']);
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join('copamembers'); });
			await directory.getByRole('button', {name: 'Interagir com Bob', exact: true}).click();
			await profile.locator('[data-href="challenge-bob"]').click();
			await page.waitForFunction(() => !!PS.rooms['dm-bob']?.challengeMenuOpen);
			await page.evaluate(() => { PS.closePopupsAbove(null); PS.join('copamembers'); });
			await battleLink.click();
			await page.waitForFunction(id => !!PS.rooms[id], publicBattle);
			if ([1440,390].includes(width)) {
				await page.evaluate(id => {
					PS.prefs.set('mute', true);
					PS.prefs.set('noanim', true);
					const side = {id:'p2', name:'Alice', pokemon:[{
						ident:'p2: Sylveon', details:'Sylveon, L50', condition:'100/100', active:false,
						moves:['protect'], baseAbility:'pixilate', item:'', pokeball:'pokeball',
					}]};
					window.copaBattleSide = side;
					PS.receive('>' + id + '\n|init|battle\n|title|Bob vs. Alice\n|gametype|singles\n|gen|9\n' +
						'|player|p1|Bob|1\n|player|p2|Alice|marnie\n|poke|p1|Sylveon, L50|\n' +
						'|poke|p2|Sylveon, L50|\n|teampreview|1\n|request|' + JSON.stringify({side, teamPreview:true}));
				},publicBattle);
				await page.waitForFunction(id => PS.rooms[id]?.side?.id === 'p2' && PS.rooms[id]?.request?.teamPreview, publicBattle);
				const pairs = page.locator('.copa-battle-pair');
				await pairs.nth(1).waitFor({timeout:8000});
				assert.match(await pairs.filter({has:page.locator('img[src$="/lucas.png"]')}).first()
					.locator('.copa-online-avatar img').getAttribute('src'), /lucas\.png$/);
				for (const phase of ['selecao','turno']) {
					if (phase === 'turno') {
						await page.evaluate(id => {
							const side = window.copaBattleSide;
							side.pokemon[0].active = true;
							PS.receive('>' + id + '\n|start\n|switch|p1a: Sylveon|Sylveon, L50|100/100\n' +
								'|switch|p2a: Sylveon|Sylveon, L50|100/100\n|turn|1\n|request|' +
								JSON.stringify({side, active:[{moves:[{move:'Protect',id:'protect',pp:10,maxpp:10,target:'self'}]}]}));
						},publicBattle);
						await page.waitForFunction(id => PS.rooms[id]?.battle?.turn === 1 && !!PS.rooms[id]?.request?.active, publicBattle);
					}
					await pairs.nth(1).waitFor({timeout:8000});
					for (const pair of await pairs.all()) {
						await pair.locator('[data-profile-tight]').nth(1).waitFor({timeout:8000});
						const pixels = await measurePairPixels(pair);
						console.log(phase,width,pixels);
						assert(pixels.gap >= 0 && pixels.gap <= 6 && pixels.baseDelta <= 1, JSON.stringify(pixels));
						assert(await pair.evaluate(node => {
							const [avatar, partner] = node.children;
							const a = avatar.getBoundingClientRect(), b = partner.getBoundingClientRect();
							const rail = node.closest('.trainer').getBoundingClientRect();
							const icons = node.closest('.trainer').querySelector('.teamicons').getBoundingClientRect();
							return Math.abs(a.bottom - b.bottom) < 2 && a.left >= rail.left - 1 &&
								b.right <= rail.right + 1 && b.bottom <= icons.top;
						}));
					}
					if (process.env.COPA_MEMBERS_SCREENSHOTS) {
						await page.screenshot({path:path.join(process.env.COPA_MEMBERS_SCREENSHOTS, `batalha-${phase}-${width}.png`)});
					}
				}

				await page.evaluate(id => {
					window.previousCopaBattle = PS.rooms[id].battle;
					window.previousCopaConnection = PS.connection;
				}, publicBattle);
				await page.locator(`#room-${publicBattle} .copa-battle-nickname`).getByText('Bob',{exact:true}).click();
				const trainerPopup = page.locator('#room-copatrainer-bob.ps-popup');
				await trainerPopup.getByRole('heading',{name:'Bob',exact:true}).waitFor();
				if (process.env.COPA_TRAINER_SCREENSHOTS) {
					await fs.mkdir(process.env.COPA_TRAINER_SCREENSHOTS, {recursive:true});
					await page.screenshot({path:path.join(process.env.COPA_TRAINER_SCREENSHOTS, `popup-na-batalha-${width}.png`)});
				}
				await page.keyboard.press('Escape');
				await trainerPopup.waitFor({state:'hidden'});
				assert(await page.evaluate(id => PS.rooms[id].battle === window.previousCopaBattle &&
					PS.connection === window.previousCopaConnection && PS.room.id === id, publicBattle));

				await page.getByRole('button', {name:'Ver perfil de Bob'}).click({timeout:8000});
				await page.locator('.copa-profile').getByRole('heading', {name:'Bob'}).waitFor();
				// A valid CDN sprite without crop metadata used to hide the whole pair.
				await page.route('**/sprites/trainers/qa-no-crop.png', async route => route.fulfill({
					contentType:'image/png', body:await loadSprite('trainers/marnie.png'),
				}));
				await page.evaluate(id => {
					PS.closePopupsAbove(null);
					const battle = PS.rooms[id].battle;
					battle.farSide.setAvatar('qa-no-crop');
					battle.scene.updateSidebars();
				},publicBattle);
				const fallback = pairs.filter({has:page.locator('img[src$="/qa-no-crop.png"]')});
				await fallback.locator('img[data-profile-fit="unavailable"]').waitFor();
				await fallback.getByRole('img',{name:'Sylveon',exact:true}).waitFor();
				assert(await fallback.evaluate(node => {
					const portrait = node.closest('.trainersprite');
					const images = Array.from(node.querySelectorAll('img'));
					return portrait.classList.contains('copa-has-battle-partner') &&
						images.every(image => image.naturalWidth && getComputedStyle(image).visibility === 'visible');
				}));
			}
			fixture.members = [...fixture.members, wan];
			await page.evaluate(() => {
				PS.closePopupsAbove(null);
				PS.join('copamembers');
				window.CopaRinhaPresence.refresh();
			});
			await page.clock.fastForward(15050);
			const wanAvatar = directory.getByRole('button',{name:'Ver perfil de Wan'});
			await wanAvatar.waitFor();
			const compactWan = wanAvatar.locator('.copa-directory-pair');
			await compactWan.locator('[data-profile-tight]').nth(1).waitFor();
			await assertSpriteElementsLoaded(page, 'button[aria-label="Ver perfil de Wan"] img');
			const compactPixels = await measurePairPixels(compactWan);
			assert(compactPixels.partnerWidth >= 36 && compactPixels.gap <= 5 && compactPixels.baseDelta <= 1,
				JSON.stringify(compactPixels));
			const wanScreenshots = [1440, 390].includes(width) && process.env.COPA_WAN_SCREENSHOTS;
			if (wanScreenshots) {
				await fs.mkdir(wanScreenshots, {recursive:true});
				await wanAvatar.locator('xpath=ancestor::li[1]').screenshot({
					path:path.join(wanScreenshots, `compacto-${width}.png`),
				});
			}
			await wanAvatar.click();
			const expandedWan = page.locator('#room-copaprofile-wan .copa-profile-sprites');
			await expandedWan.locator('[data-profile-tight]').nth(1).waitFor();
			await assertSpriteElementsLoaded(page, '#room-copaprofile-wan img');
			const expandedPixels = await measurePairPixels(expandedWan);
			assert(expandedPixels.partnerWidth >= 100 && expandedPixels.gap <= 8 && expandedPixels.baseDelta <= 1,
				JSON.stringify(expandedPixels));
			const wanProfile = page.locator('#room-copaprofile-wan');
			if (wanScreenshots) await wanProfile.screenshot({path:path.join(wanScreenshots, `ampliado-${width}.png`)});
			await wanProfile.getByRole('button',{name:'Fechar',exact:true}).click();
			await directory.getByRole('link',{name:'Wan', exact:true}).click();
			const trainerWan = page.locator('#room-copatrainer-wan .copa-trainer-duo');
			await trainerWan.locator('[data-profile-tight]').nth(1).waitFor();
			assert.match(await trainerWan.getByRole('img',{name:'Metagross · Shiny'}).getAttribute('src'), /profile-partners/);
			console.log(`Wan's visible Metagross at ${width}px:`, {compactPixels, expandedPixels});

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
