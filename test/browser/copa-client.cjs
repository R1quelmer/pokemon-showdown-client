// Native Copa client UI with synthetic WebSocket transport. No production login,
// server, account, credential or R2 bucket is used by this browser regression.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const canonical = 'gen9coparinhanationaldexza';
const id = 'a'.repeat(32);
const shareURL = `https://copa-rinha-client.onrender.com/team.html?id=${id}`;
const exportText = [
	'Frog (Greninja) @ Life Orb', 'Ability: Protean', 'Tera Type: Water',
	'EVs: 252 SpA / 4 SpD / 252 Spe', 'Timid Nature', '- Surf', '- Dark Pulse', '- Ice Beam', '- U-turn', '',
].join('\n');

(async () => {
	const server = http.createServer(async (req, res) => {
		const pathname = new URL(req.url, 'http://localhost').pathname;
		const file = path.resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
		if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
		try {
			const body = await fs.readFile(file);
			const type = {'.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png',
				'.gif': 'image/gif', '.json': 'application/json', '.woff2': 'font/woff2'}[path.extname(file)];
			res.writeHead(200, {'Content-Type': (type || 'application/octet-stream') + '; charset=utf-8'}).end(body);
		} catch { res.writeHead(404).end(); }
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const screenshots = process.env.COPA_CLIENT_SCREENSHOTS || '/tmp/copa-final-qa';
	await fs.mkdir(screenshots, {recursive: true});
	let browser;
	try {
		browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']});
		for (const width of [1440, 1000, 390, 320]) {
			const page = await browser.newPage({viewport: {width, height: 900}});
			const origin = `http://127.0.0.1:${server.address().port}`;
			const errors = [], authRequests = [], shares = [], renames = [];
			let connections = 0, currentSocket;
			page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
			// Exercise native direct WebSocket fallback, without changing production code.
			await page.addInitScript(() => { window.Worker = undefined; });
			await page.routeWebSocket(/^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/, ws => {
				currentSocket = ws;
				connections++;
				// Use the server's actual Gen 9 wire name, not an invented local format list.
				ws.send('|formats|,1|Copa Rinha|[Gen 9] Copa Rinha II,e\n|updateuser| Guest 1|0|167\n|challstr|4|synthetic-copa-challenge');
				ws.onMessage(raw => {
					const message = String(raw);
					const rename = /^\|?\/trn ([^,\r\n]+)$/.exec(message);
					if (rename) {
						renames.push(rename[1]);
						ws.send(`|updateuser| ${rename[1]}|1|167`);
					}
					const share = /^\|?\/teams save ([^,]*), ([^,]*), 0, (.+)$/.exec(message);
					if (share) {
						shares.push({name: share[1], format: share[2], packed: share[3]});
						ws.send('|queryresponse|copateamupload|' + JSON.stringify({teamid: id, privacy: null, url: shareURL, requestTeam: share[3]}));
					}
				});
			});
			await page.route('**/*', async route => {
				const url = route.request().url();
				if (/\/(?:action\.php|crossdomain\.php|testclient-key\.php)(?:[?#]|$)/.test(new URL(url).pathname)) {
					authRequests.push(url);
					return route.abort();
				}
				if (url.includes('/config/config.js')) {
					return route.fulfill({contentType: 'text/javascript', body: "var Config={customcolors:{},whitelist:[],routes:{client:'play.pokemonshowdown.com'},defaultserver:{id:'showdown',host:'sim3.psim.us',port:443}};"});
				}
				if (url.startsWith(origin)) return route.continue();
				return route.abort(); // External native sprites/audio are outside this UI fixture.
			});
			const overflow = async label => {
				const geometry = await page.evaluate(() => ({viewport: innerWidth, scroll: document.documentElement.scrollWidth}));
				assert(geometry.scroll <= geometry.viewport, `${label}: horizontal overflow at ${width}px (${geometry.scroll})`);
				const lightPanels = await page.evaluate(() => [...document.querySelectorAll('.ps-room')].filter(element => {
					const rect = element.getBoundingClientRect();
					if (rect.width < 150 || rect.height < 100 || rect.right <= 0 || rect.left >= innerWidth) return false;
					const rgba = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number);
					return rgba && (rgba[3] ?? 1) > 0.1 && (rgba[0] + rgba[1] + rgba[2]) / 3 > 150;
				}).map(element => ({classes: element.className, background: getComputedStyle(element).backgroundColor})));
				assert.deepEqual(lightPanels, [], `${label}: Copa room surfaces keep the dark theme at ${width}px`);
			};
			const capture = name => page.screenshot({path: path.join(screenshots, `${name}-${width}.png`), fullPage: true});
			await page.goto(origin + '/');
			await page.waitForFunction(() => window.PS?.connection?.connected && !PS.user.initializing);
			assert(page.url().includes('/testclient-new.html?~~copa-rinha-showdown.onrender.com:443'));
			assert.equal(await page.evaluate(() => Config.copaRinhaLocalNames), true);
			assert.equal(await page.locator('input[type=password]').count(), 0);
			const name = `QA Local ${width}`;
			await page.locator('input[name=username]').fill(name);
			const popup = await page.locator('.ps-popup').last().boundingBox();
			assert(popup && popup.x >= 0 && popup.x + popup.width <= width, `nickname dialog fits ${width}px`);
			await overflow('nickname');
			await capture('nickname');
			await page.locator('form:has(input[name=username]) button[type=submit]').click();
			await page.waitForFunction(name => PS.user.named && PS.user.name === name && PS.user.loggingIn === null, name);
			assert.equal(await page.evaluate(() => PS.user.registered), null);
			assert.equal(renames[0], name);
			await page.locator('.copa-brand img').first().evaluate(image => image.decode());
			assert.equal(await page.evaluate(() => document.documentElement.classList.contains('copa-rinha')), true);
			await overflow('home'); await capture('home');

			await page.evaluate(() => PS.join('teambuilder'));
			await page.getByRole('button', {name: /New team/i}).first().click();
			assert.equal(await page.evaluate(() => PS.teams.list[0].format), canonical);
			await page.locator('.teamname input').fill(`Time QA ${width}`);
			await page.getByRole('button', {name: 'Import/Export', exact: true}).click();
			await page.locator('textarea.teamtextbox:not(.heighttester)').fill(exportText);
			await page.waitForFunction(() => PS.teams.list[0].packedTeam && Teams.unpack(PS.teams.list[0].packedTeam)[0]?.species === 'Greninja');
			await page.getByRole('button', {name: 'Form', exact: true}).click();
			await overflow('teambuilder'); await capture('teambuilder');
			const packed = await page.evaluate(() => PS.teams.list[0].packedTeam);
			await page.getByRole('button', {name: 'Compartilhar time', exact: true}).click();
			await page.locator('input[name=url]').waitFor({state: 'visible'});
			assert.equal(await page.locator('input[name=url]').inputValue(), shareURL);
			assert.equal(shares.length, 1);
			assert.equal(shares[0].name, `Time QA ${width}`);
			assert.equal(shares[0].format, canonical);
			assert.equal(shares[0].packed, packed);
			assert.equal(await page.evaluate(() => PS.teams.list[0].teamid), undefined);
			assert.equal(await page.evaluate(() => PS.teams.list[0].copaShare.id), id);
			await overflow('share'); await capture('share');
			await page.evaluate(async () => {
				await CopaRinhaAvatars.load();
				if (CopaRinhaAvatars.resolve('Not configured') !== null) throw new Error('Missing avatar must fall back');
				if (!Dex.resolveAvatar('167').includes('/sprites/trainers/')) throw new Error('Native trainer fallback missing');
			});
			// A remote close exercises reconnect + server-confirmed nickname restoration.
			currentSocket.close({code: 1012, reason: 'Synthetic server restart'});
			await page.waitForFunction(() => PS.connection.connected && PS.user.named && PS.user.loggingIn === null);
			await page.waitForFunction(name => PS.user.name === name && PS.user.registered === null, name);
			assert(connections >= 2, 'native transport reconnected');
			assert(renames.length >= 2, 'local nickname restored through a new server confirmation');
			await page.reload();
			await page.waitForFunction(name => window.PS?.user?.named && PS.user.name === name, name);
			assert.equal(await page.evaluate(() => PS.user.registered), null);
			assert.equal(await page.evaluate(() => PS.teams.list.length), 1);
			assert.equal(await page.evaluate(() => PS.teams.list[0].packedTeam), packed);
			assert.equal(await page.evaluate(() => PS.teams.list[0].format), canonical);
			assert.equal(await page.locator('input[type=password]').count(), 0);
			await page.evaluate(() => {
				PS.prefs.set('mute', true);
				PS.receive('>copaqa\n|init|chat\n|title|Sala de teste Copa\n|users|1, QA\n|c| QA|Mensagem de teste Copa');
				PS.join('copaqa');
			});
			await page.getByText('Mensagem de teste Copa', {exact: true}).waitFor();
			await overflow('chat'); await capture('chat');
			const battleID = 'battle-gen9coparinhaii-qa';
			await page.evaluate(battleID => {
				PS.receive('>' + battleID + '\n' + [
					'|init|battle', '|title|Copa QA', '|gametype|singles', '|gen|9', '|tier|[Gen 9] Copa Rinha II',
					'|player|p1|Alice|1', '|player|p2|Bob|2', '|teamsize|p1|1', '|teamsize|p2|1', '|start',
					'|switch|p1a: Greninja|Greninja-Mega, L100|100/100',
					'|switch|p2a: Baxcalibur|Baxcalibur-Mega, L100|100/100', '|turn|1',
				].join('\n'));
				PS.join(battleID);
			}, battleID);
			await page.waitForFunction(battleID => PS.rooms[battleID]?.battle, battleID);
			await page.evaluate(battleID => PS.rooms[battleID].battle.seekTurn(Infinity), battleID);
			await page.locator('.battle img[src="/sprites/za/back/greninjamega.gif"]').waitFor({state:'visible'});
			await overflow('battle'); await capture('battle');
			await page.goto(origin + '/replay.html');
			await page.locator('#open-replay').waitFor({state:'visible'});
			await page.locator('#replay-link').fill('not-a-replay');
			await page.locator('#open-replay button').click();
			assert.equal(await page.locator('#status').textContent(), 'Link de replay inválido.');
			assert.deepEqual(authRequests, []);
			assert.deepEqual(errors, []);
			console.log(`Copa local nickname, reconnect, native Teambuilder/share, avatar fallback and theme passed at ${width}px`);
			await page.close();
		}
	} finally {
		if (browser) await browser.close();
		await new Promise(resolve => server.close(resolve));
	}
})().catch(error => { console.error(error); process.exitCode = 1; });
