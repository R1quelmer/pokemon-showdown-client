/* Run after a full build: node test/browser/copa-replay.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const id = 'a'.repeat(32);
// Synthetic protocol fixture exercises native reconstruction of all four mechanics.
const log = [
	'|init|battle', '|gametype|singles', '|gen|9', '|tier|[Copa Rinha] National Dex ZA',
	'|player|p1|Alice|1', '|player|p2|Bob|2', '|teamsize|p1|2', '|teamsize|p2|1',
	'|start', '|switch|p1a: Venusaur|Venusaur, L100|100/100', '|switch|p2a: Pikachu|Pikachu, L100|100/100',
	'|turn|1', '|-mega|p1a: Venusaur|Venusaur|Venusaurite', '|detailschange|p1a: Venusaur|Venusaur-Mega, L100',
	'|turn|2', '|-zpower|p2a: Pikachu', '|move|p2a: Pikachu|Catastropika|p1a: Venusaur',
	'|-damage|p1a: Venusaur|60/100', '|-weather|RainDance',
	'|turn|3', '|switch|p1a: Garchomp|Garchomp, L100|100/100', '|-terastallize|p1a: Garchomp|Ground',
	'|turn|4', '|detailschange|p2a: Pikachu|Pikachu-Gmax, L100', '|-start|p2a: Pikachu|Dynamax',
	'|turn|5', '|-end|p2a: Pikachu|Dynamax', '|-message|Bob forfeited.', '|win|Alice',
].join('\n');
const replay = {
	id, format: 'gen9coparinhanationaldexza', players: [{name: 'Alice'}, {name: 'Bob'}],
	winner: 'Alice', turns: 5, endType: 'forfeit', createdAt: '2026-10-29T12:00:00Z', log,
};

(async () => {
	const server = http.createServer(async (req, res) => {
		const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
		if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
		try {
			const body = await fs.readFile(file);
			const type = {'.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png'}[path.extname(file)];
			res.writeHead(200, {'Content-Type': type || 'application/octet-stream'}).end(body);
		} catch { res.writeHead(404).end(); }
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	let browser;
	try {
		browser = await chromium.launch({
			executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'],
		});
		for (const width of [1440, 1000, 390, 320]) {
			const page = await browser.newPage({viewport: {width, height: 844}});
			const errors = [];
			let currentReplay = replay;
			page.on('pageerror', error => errors.push(error.message));
			await page.route('**/*', async route => {
				const url = route.request().url();
				if (url === `https://copa-rinha-showdown.onrender.com/copa-rinha/replays/${id}`) {
					await route.fulfill({json: currentReplay});
				} else if (url.endsWith('/js/copa-replay.js')) {
					// Expose the real native engine only in this test; do not replace its implementation.
					const response = await route.fetch();
					const source = await response.text();
					const instrumented = source.replace(/(\b(?:var|let|const) battle\s*=\s*)new Battle/, '$1window.testBattle = new Battle');
					assert.notEqual(source, instrumented);
					await route.fulfill({response, body: instrumented});
				} else if (url.startsWith('http://127.0.0.1:')) {
					await route.continue();
				} else {
					// CDN sprites/audio aren't necessary to assert native scene/DOM reconstruction.
					await route.abort();
				}
			});
			await page.goto(`http://127.0.0.1:${server.address().port}/replay.html?id=${id}`);
			await page.waitForFunction(() => document.getElementById('status').textContent === 'Replay carregado.');
			const assertCounter = async () => {
				assert.equal(await page.locator('#turn').inputValue(), String(await page.evaluate(() => Math.max(0, testBattle.turn))));
			};
			await assertCounter();
			const brand = page.locator('.brand-logo');
			await brand.evaluate(image => image.decode());
			const logo = await brand.evaluate(image => ({
				width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height,
				naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
			}));
			assert.equal(logo.naturalWidth, 3344); assert.equal(logo.naturalHeight, 1882);
			assert(Math.abs(logo.width / logo.height - 3344 / 1882) < 0.01);
			assert.equal(logo.width, width <= 600 ? 92 : 140);
			assert.equal(await page.locator('.wordmark span').textContent(), 'REPLAY');
			assert.equal(await page.locator('.wordmark').getAttribute('href'), '/copa-rinha.html');
			assert.equal(await page.locator('.wordmark').getAttribute('target'), null);
			assert((await page.locator('.wordmark').getAttribute('aria-label')).includes('página inicial'));
			const layout = await page.evaluate(() => {
				const rect = selector => {
					const {x, right, width, height, bottom} = document.querySelector(selector).getBoundingClientRect();
					return {x, right, width, height, bottom};
				};
				return {brand: rect('.brand-logo'), label: rect('.wordmark span'), player: rect('.player-shell'),
					viewport: rect('#viewport'), controls: rect('#controls')};
			});
			assert.equal(layout.brand.x, layout.player.x);
			assert(layout.label.x >= layout.brand.right);
			assert(layout.viewport.width <= 880);
			assert(Math.abs(layout.viewport.width / layout.viewport.height - 640 / 360) < 0.01);
			if (width >= 1000) {
				assert.equal(layout.player.width, 880);
				assert(layout.controls.bottom <= 844);
			} else {
				assert(layout.player.width >= width - 20);
			}
			const metadata = await page.locator('#metadata').textContent();
			assert(metadata.includes('Alice × Bob')); assert(!metadata.includes('gen9coparinhanationaldexza')); assert(metadata.includes('Forfeit'));
			await page.locator('#turn').fill('3'); await page.locator('#turn-form button').click();
			await page.waitForFunction(() => testBattle.turn === 3 && testBattle.seeking === null);
			await assertCounter();
			const state = () => page.evaluate(() => ({
				near: testBattle.nearSide.name, far: testBattle.farSide.name,
				nearSpecies: testBattle.nearSide.active[0].speciesForme,
				farSpecies: testBattle.farSide.active[0].speciesForme,
				p1hp: testBattle.p1.active[0].hp, weather: testBattle.weather,
				nearFront: testBattle.nearSide.active[0].sprite.isFrontSprite,
				farFront: testBattle.farSide.active[0].sprite.isFrontSprite,
				left: document.querySelector('.leftbar strong').textContent,
				right: document.querySelector('.rightbar strong').textContent,
				statbars: document.querySelectorAll('.statbar').length,
			}));
			const initial = await state();
			assert.equal(initial.near, 'Alice'); assert.equal(initial.far, 'Bob');
			assert.equal(initial.nearSpecies, 'Venusaur-Mega');
			assert.equal(initial.p1hp, 60); assert.equal(initial.weather, 'raindance');
			await page.locator('#viewpoint').click();
			await page.waitForFunction(() => testBattle.viewpointSwitched && testBattle.seeking === null);
			const swapped = await state();
			assert.equal(swapped.near, 'Bob'); assert.equal(swapped.far, 'Alice');
			assert.equal(swapped.left, 'Bob'); assert.equal(swapped.right, 'Alice');
			assert.equal(swapped.nearSpecies, initial.farSpecies);
			assert.equal(swapped.farSpecies, initial.nearSpecies);
			assert.equal(swapped.p1hp, initial.p1hp); assert.equal(swapped.weather, initial.weather);
			assert.equal(swapped.nearFront, initial.nearFront); assert.equal(swapped.farFront, initial.farFront);
			assert.equal(swapped.statbars, initial.statbars);
			await page.locator('#viewpoint').click();
			await page.waitForFunction(() => !testBattle.viewpointSwitched && testBattle.seeking === null);
			assert.deepEqual(await state(), initial);
			await page.locator('#play').click();
			await page.locator('#viewpoint').click();
			assert(await page.evaluate(() => !testBattle.paused && testBattle.viewpointSwitched));
			await page.locator('#pause').click();
			await page.locator('#viewpoint').click();
			await page.locator('#turn').fill('3'); await page.locator('#turn-form button').click();
			await page.waitForFunction(() => testBattle.turn === 3 && testBattle.seeking === null);
			await assertCounter();
			assert(await page.evaluate(() => testBattle.paused));
			await assertCounter();
			await page.locator('#next').click();
			await page.waitForFunction(() => testBattle.turn === 4 && testBattle.seeking === null);
			await assertCounter();
			await page.locator('#previous').click();
			await page.waitForFunction(() => testBattle.turn === 3 && testBattle.seeking === null);
			await assertCounter();
			await page.locator('#speed').selectOption('hyperfast');
			assert.deepEqual(await page.evaluate(() => [testBattle.messageFadeTime, testBattle.messageShownTime]), [40, 1]);
			await page.locator('#end').click();
			await page.waitForFunction(() => testBattle.atQueueEnd);
			assert(await page.locator('.battle-log').textContent().then(text => text.includes('Alice won')));
			await page.locator('#viewpoint').click();
			await page.waitForFunction(() => testBattle.viewpointSwitched && testBattle.atQueueEnd);
			assert.equal(await page.locator('#metadata').textContent(), metadata);
			assert.equal(await page.evaluate(() => testBattle.p2.active[0].speciesForme), 'Pikachu-Gmax');
			assert(await page.evaluate(() => testBattle.stepQueue.join('\n').includes('|-terastallize|')));
			await page.locator('#restart').click();
			assert(await page.evaluate(() => testBattle.paused && !testBattle.atQueueEnd && testBattle.turn <= 0));
			await assertCounter();
			await page.locator('#turn').fill('4'); await page.locator('#turn-form button').click();
			await page.waitForFunction(() => testBattle.turn === 4 && testBattle.seeking === null);
			await assertCounter();
			assert.equal(await page.evaluate(() => testBattle.p1.active[0].teraType), 'Ground');
			await page.locator('#end').click(); await page.waitForFunction(() => testBattle.atQueueEnd);
			await page.locator('#copy').click();
			await page.waitForFunction(() => /Link copiado|Copie o endereço/.test(document.getElementById('copy-feedback').textContent));
			const toast = await page.locator('#copy-feedback').boundingBox();
			assert(toast && toast.x >= 0 && toast.x + toast.width <= width);
			await page.waitForFunction(() => document.getElementById('copy-feedback').hidden);
			assert(await page.evaluate(() => document.fonts.check('700 30px "Barlow Condensed"')));
			assert(await page.evaluate(() => document.fonts.check('400 14px Inter')));
			await assertCounter();
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
			assert.deepEqual(errors, []);
			console.log(`Native replay controls, double viewpoint switch, forfeit and layout passed at ${width}px`);
			if (process.env.REPLAY_SCREENSHOTS) await page.screenshot({path: path.join(process.env.REPLAY_SCREENSHOTS, `replay-${width}.png`), fullPage: true});
			// Regression: a real one-turn forfeit must show 1 / 1, never a stale draft/placeholder.
			currentReplay = {...replay, turns: 1, log: log.slice(0, log.indexOf('|turn|2')) + '|-message|Bob forfeited.\n|win|Alice',
				players: [{name: 'LongPlayerNameAlpha'}, {name: 'LongPlayerNameBravo'}]};
			await page.reload();
			await page.waitForFunction(() => document.getElementById('status').textContent === 'Replay carregado.');
			await assertCounter();
			await page.locator('#speed').selectOption('hyperfast');
			await page.locator('#play').click();
			await page.waitForFunction(() => testBattle.atQueueEnd);
			await assertCounter();
			assert.equal(await page.locator('#turn').inputValue(), '1');
			assert.equal(await page.locator('#turn-total').textContent(), '/ 1');
			assert((await page.locator('.battle .turn').textContent()).includes('1'));
			await page.locator('#viewpoint').click(); await page.locator('#viewpoint').click();
			await assertCounter();
			await page.locator('#restart').click(); await assertCounter();
			assert.equal(await page.locator('#turn').inputValue(), '0');
			await page.locator('#turn').fill('1'); await page.locator('#turn-form button').click();
			await page.waitForFunction(() => testBattle.turn === 1 && testBattle.seeking === null);
			await assertCounter();
			await page.locator('#previous').click(); await assertCounter();
			await page.locator('#next').click();
			await page.locator('#end').click(); await page.waitForFunction(() => testBattle.atQueueEnd);
			await assertCounter();
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
			assert.deepEqual(errors, []);
			console.log(`One-turn forfeit counter and long player names passed at ${width}px`);
			const [home] = await Promise.all([
				page.waitForResponse(response => new URL(response.url()).pathname === '/copa-rinha.html'),
				page.locator('.wordmark').click(),
			]);
			assert.equal(home.status(), 200);
			await page.waitForURL(url => url.pathname === '/testclient-new.html', {waitUntil: 'commit'});
			console.log(`Logo navigation to /copa-rinha.html returned 200 at ${width}px`);
			await page.close();
		}
	} finally {
		await browser?.close();
		await new Promise(resolve => server.close(resolve));
	}
})().catch(error => { console.error(error); process.exitCode = 1; });
