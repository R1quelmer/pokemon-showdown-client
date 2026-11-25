// Native Copa login UI with deterministic protocol replies. This fixture does not
// contact production or replace server collision/throttle/authentication rules.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const endpoint = /^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/;
const storageKey = 'copa-rinha:nickname:copa-rinha-showdown.onrender.com:443/showdown';
const toID = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const waitUntil = async (predicate, message) => {
	const deadline = Date.now() + 5000;
	while (!predicate()) {
		assert(Date.now() < deadline, message);
		await new Promise(resolve => setTimeout(resolve, 10));
	}
};

(async () => {
	const server = http.createServer(async (req, res) => {
		const pathname = new URL(req.url, 'http://localhost').pathname;
		const file = path.resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
		if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
		try {
			const body = await fs.readFile(file);
			const type = {'.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css',
				'.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2'}[path.extname(file)];
			res.writeHead(200, {'Content-Type': type || 'application/octet-stream'}).end(body);
		} catch { res.writeHead(404).end(); }
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${server.address().port}`;
	let browser;
	try {
		browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
		for (const width of [1440, 390]) {
			const occupied = new Map(), fixtures = [];
			async function session() {
				const context = await browser.newContext({viewport: {width, height: 900}});
				const page = await context.newPage();
				const fixture = {context, page, attempts: [], responses: new Map(), errors: [], authRequests: [],
					connections: 0, currentName: '', socket: null, challenge: '', holdHandshake: false};
				fixtures.push(fixture);
				page.on('pageerror', error => fixture.errors.push(error.message));
				await page.addInitScript(() => { window.Worker = undefined; });
				const release = () => {
					if (occupied.get(toID(fixture.currentName)) === fixture) occupied.delete(toID(fixture.currentName));
					fixture.currentName = '';
				};
				fixture.handshake = () => fixture.socket.send(
					`|formats|,1|Copa Rinha|[Gen 9] Copa Rinha II,e\n|updateuser| Guest 1|0|167\n|challstr|4|${fixture.challenge}`
				);
				fixture.confirm = name => {
					release(); fixture.currentName = name;
					fixture.responses.delete(name); occupied.set(toID(name), fixture);
					fixture.socket.send(`|updateuser| ${name}|1|167`);
				};
				fixture.disconnect = () => {
					release(); fixture.socket.close({code: 1012, reason: 'Synthetic restart'});
				};
				await page.routeWebSocket(endpoint, ws => {
					fixture.socket = ws; fixture.connections++;
					fixture.challenge = `nickname-${width}-${fixtures.indexOf(fixture)}-${fixture.connections}`;
					if (!fixture.holdHandshake) fixture.handshake();
					ws.onMessage(raw => {
						const match = /^\|?\/trn ([^,\r\n]+)$/.exec(String(raw));
						if (!match) return;
						const name = match[1]; fixture.attempts.push(name);
						const response = fixture.responses.get(name);
						if (response === 'hold') return;
						if (response === 'throttle') {
							ws.send(`|nametaken|${name}|You must wait 90 more seconds before using another unregistered name.`);
						} else if (response === 'collision' || (occupied.has(toID(name)) && occupied.get(toID(name)) !== fixture)) {
							ws.send(`|nametaken|${name}|Someone is already using the name "${name}".`);
						} else if (name !== fixture.currentName) {
							fixture.confirm(name);
						}
						// Upstream intentionally sends no acknowledgement for the exact
						// current name; the client must not wait for one.
					});
				});
				await page.route('**/*', route => {
					const url = route.request().url();
					if (/\/(?:action\.php|crossdomain\.php|testclient-key\.php)(?:[?#]|$)/.test(new URL(url).pathname)) {
						fixture.authRequests.push(url); return route.abort();
					}
					if (url.includes('/config/config.js')) return route.fulfill({contentType: 'text/javascript', body:
						"var Config={customcolors:{},whitelist:[],routes:{client:'play.pokemonshowdown.com'},defaultserver:{id:'showdown',host:'sim3.psim.us',port:443}};"});
					return url.startsWith(origin) ? route.continue() : route.abort();
				});
				await page.goto(origin + '/copa-rinha.html');
				await page.waitForFunction(() => window.PS?.connection?.connected && !PS.user.initializing);
				assert.equal(await page.evaluate(() => Config.copaRinhaLocalNames), true);
				await page.locator('input[name=username]').waitFor({state: 'visible'});
				await page.evaluate(() => {
					window.nicknameWire = [];
					window.nicknameErrors = [];
					const receive = PS.receive.bind(PS);
					PS.receive = message => { nicknameWire.push(message); return receive(message); };
					PS.user.subscribe(update => { if (update?.error) nicknameErrors.push(update.error); });
				});
				fixture.open = async args => {
					await page.evaluate(args => PS.join('login', {args}), args || null);
					await page.locator('input[name=username]').waitFor({state: 'visible'});
				};
				fixture.submit = async name => {
					await page.locator('input[name=username]').fill(name);
					await page.locator('form:has(input[name=username]) button[type=submit]').click();
				};
				fixture.named = async name => {
					await page.waitForFunction(name => PS.user.named && PS.user.name === name && PS.user.loggingIn === null, name);
					assert.equal(await page.evaluate(() => PS.user.registered), null);
				};
				fixture.rejected = async (name, error) => {
					await page.locator('.ps-popup .error').filter({hasText: error}).waitFor({state: 'visible'});
					await page.waitForFunction(() => !document.querySelector('input[name=username]')?.disabled);
					assert.equal(await page.locator('input[name=username]').inputValue(), name, 'rejected draft remains editable');
				};
				fixture.saved = () => page.evaluate(key => localStorage.getItem(key), storageKey);
				fixture.send = async line => {
					fixture.socket.send(line);
					await page.waitForFunction(line => nicknameWire.includes(line), line);
				};
				return fixture;
			}
			try {
				const a = await session(), page = a.page;
				await a.submit('Copa QA Owner'); await a.named('Copa QA Owner');
				assert.equal(await a.saved(), 'Copa QA Owner');

				// A room.args.name left by a previous login state must not freeze
				// the newly typed draft or cause a different /trn payload.
				a.responses.set('Copa QA Taken', 'collision');
				await a.open({name: 'Old suggested name'});
				await a.submit('Copa QA Taken'); await a.rejected('Copa QA Taken', 'Someone is already using');
				assert.equal(a.attempts.at(-1), 'Copa QA Taken');
				assert.equal(await a.saved(), 'Copa QA Owner'); await a.named('Copa QA Owner');

				a.responses.set('Copa QA Throttle', 'throttle');
				await a.submit('Copa QA Throttle'); await a.rejected('Copa QA Throttle', 'You must wait');
				assert.equal(a.attempts.at(-1), 'Copa QA Throttle');
				assert.equal(await a.saved(), 'Copa QA Owner'); await a.named('Copa QA Owner');
				await a.submit('Copa QA Fresh'); await a.named('Copa QA Fresh');
				assert.equal(a.attempts.at(-1), 'Copa QA Fresh');

				const beforeSame = a.attempts.length;
				await a.open(); await a.submit('Copa QA Fresh');
				await page.locator('input[name=username]').waitFor({state: 'detached'});
				assert.equal(a.attempts.length, beforeSame, 'same confirmed name needs no /trn');
				assert.equal(await page.evaluate(() => CopaRinhaLocalNames.timer), null);
				await a.send(`|challstr|4|${a.challenge}`);
				assert.equal(a.attempts.length, beforeSame, 'duplicate challenge causes no restore retry');
				await a.send('|nametaken|Copa QA Taken|Late error for an old attempt.');
				assert.equal(await page.locator('input[name=username]').count(), 0, 'late error cannot reopen login');

				a.responses.set('Copa QA Pending', 'hold');
				await a.open(); await a.submit('Copa QA Pending');
				await waitUntil(() => a.attempts.at(-1) === 'Copa QA Pending', 'pending rename reached the synthetic server');
				const beforeOverlap = a.attempts.length;
				assert(await page.locator('input[name=username]').isDisabled());
				await page.evaluate(() => CopaRinhaLocalNames.choose('Copa QA Ignored'));
				assert.equal(a.attempts.length, beforeOverlap, 'one rename can be in flight at a time');
				await a.send('|nametaken|Copa QA Taken|Stale collision must be ignored.');
				assert.equal(await page.evaluate(() => CopaRinhaLocalNames.pending), 'Copa QA Pending');
				assert.equal(await page.evaluate(() => PS.user.loggingIn), 'Copa QA Pending');
				a.confirm('Copa QA Pending'); await a.named('Copa QA Pending');

				await page.clock.install();
				a.responses.set('Copa QA Timeout', 'hold');
				await a.open(); await a.submit('Copa QA Timeout');
				await waitUntil(() => a.attempts.at(-1) === 'Copa QA Timeout', 'timeout request was sent');
				await page.clock.fastForward(16000);
				await a.rejected('Copa QA Timeout', 'não confirmou');
				assert.equal(await a.saved(), 'Copa QA Pending'); await a.named('Copa QA Pending');
				const beforeTimeout = a.attempts.length;
				await page.clock.fastForward(10000);
				assert.equal(a.attempts.length, beforeTimeout, 'timeout never retries automatically');

				a.responses.set('Copa QA Drop', 'hold');
				await a.submit('Copa QA Drop');
				await waitUntil(() => a.attempts.at(-1) === 'Copa QA Drop', 'disconnect request was sent');
				a.holdHandshake = true;
				await page.evaluate(() => { nicknameErrors.length = 0; });
				a.disconnect();
				await page.waitForFunction(() => !PS.connection.connected);
				await page.clock.fastForward(16000);
				await waitUntil(() => a.connections >= 2, 'native reconnect opened a fresh socket');
				assert.equal(await page.evaluate(() => CopaRinhaLocalNames.pending), null);
				assert.equal(await page.evaluate(() => CopaRinhaLocalNames.timer), null);
				assert.equal(await page.evaluate(() => PS.user.loggingIn), null);
				assert(!(await page.evaluate(() => nicknameErrors)).some(error => error.includes('não confirmou')), 'old timeout cannot report after disconnect');
				const beforeRestore = a.attempts.length;
				a.holdHandshake = false; a.handshake();
				await a.named('Copa QA Pending');
				await waitUntil(() => a.attempts.length > beforeRestore, 'one restoration was sent on the new challenge');
				assert.equal(a.attempts.length, beforeRestore + 1);
				assert.equal(a.attempts.at(-1), 'Copa QA Pending');
				await a.send(`|challstr|4|${a.challenge}`);
				assert.equal(a.attempts.length, beforeRestore + 1);

				await page.clock.resume();
				await a.open(); await a.submit('Copa QA Shared'); await a.named('Copa QA Shared');
				const b = await session();
				await b.submit('Copa QA Shared'); await b.rejected('Copa QA Shared', 'Someone is already using');
				assert.equal(await b.page.evaluate(() => PS.user.named), false);
				assert.equal(await b.saved(), null);
				await a.named('Copa QA Shared');
				await b.submit('Copa QA Second'); await b.named('Copa QA Second');
				assert.equal(await a.saved(), 'Copa QA Shared');
				assert.equal(await b.saved(), 'Copa QA Second');
				for (const fixture of fixtures) {
					assert.deepEqual(fixture.authRequests, [], 'Copa never contacts official account services');
					assert.equal(await fixture.page.locator('input[type=password]').count(), 0);
					assert.deepEqual(fixture.errors, []);
				}
				console.log(`Native nickname draft/payload, collision, throttle, same-name, stale replies, timeout, reconnect and isolated tabs passed at ${width}px`);
			} finally {
				for (const fixture of fixtures) await fixture.context.close();
			}
		}
	} finally {
		if (browser) await browser.close();
		await new Promise(resolve => server.close(resolve));
	}
})().catch(error => { console.error(error); process.exitCode = 1; });
