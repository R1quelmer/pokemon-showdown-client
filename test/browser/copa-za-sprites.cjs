/* Run after a client build: CHROMIUM_PATH=/usr/bin/chromium node test/browser/copa-za-sprites.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const id = 'a'.repeat(32);
const replay = {
	id, format: 'gen9coparinhanationaldexza', players: [{name: 'Alice'}, {name: 'Bob'}],
	winner: 'Alice', turns: 3, endType: 'forfeit', createdAt: '2026-10-30T12:00:00Z',
	log: [
		'|init|battle', '|gametype|singles', '|gen|9', '|tier|Copa Rinha II',
		'|player|p1|Alice|1', '|player|p2|Bob|2', '|teamsize|p1|1', '|teamsize|p2|1', '|start',
		'|switch|p1a: Absol|Absol, L100|100/100', '|switch|p2a: Baxcalibur|Baxcalibur, L100|100/100',
		'|turn|1', '|-mega|p1a: Absol|Absol|Absolite Z', '|detailschange|p1a: Absol|Absol-Mega-Z, L100',
		'|-mega|p2a: Baxcalibur|Baxcalibur|Baxcalibrite', '|detailschange|p2a: Baxcalibur|Baxcalibur-Mega, L100',
		'|turn|2', '|turn|3', '|-message|Bob forfeited.', '|win|Alice',
	].join('\n'),
};

(async () => {
	const manifest = JSON.parse(await fs.readFile(path.join(root, 'sprites/za/manifest.json')));
	const server = http.createServer(async (req, res) => {
		const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
		if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
		try {
			const type = {'.gif': 'image/gif', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css'}[path.extname(file)];
			res.writeHead(200, {'Content-Type': type || 'application/octet-stream'}).end(await fs.readFile(file));
		} catch { res.writeHead(404).end(); }
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	let browser;
	try {
		browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox']});
		for (const width of [1440, 1000, 390, 320]) {
			const page = await browser.newPage({viewport: {width, height: 844}});
			const errors = [];
			page.on('pageerror', error => errors.push(error.message));
			await page.route('**/*', async route => {
				const url = route.request().url();
				if (url === `https://copa-rinha-showdown.onrender.com/copa-rinha/replays/${id}`) {
					await route.fulfill({json: replay});
				} else if (url.endsWith('/js/copa-replay.js')) {
					const response = await route.fetch();
					const source = await response.text();
					const instrumented = source.replace(/(\b(?:var|let|const) battle\s*=\s*)new Battle/, '$1window.testBattle = new Battle');
					assert.notEqual(instrumented, source);
					await route.fulfill({response, body: instrumented});
				} else if (url.startsWith('http://127.0.0.1:')) {
					await route.continue();
				} else {
					await route.abort(); // External native sprites/audio are outside this local asset check.
				}
			});
			await page.goto(`http://127.0.0.1:${server.address().port}/replay.html?id=${id}`);
			await page.waitForFunction(() => document.getElementById('status').textContent === 'Replay carregado.');
			if (width === 1440) {
				const decoded = await page.evaluate(async assets => {
					for (const asset of assets) {
						const data = Dex.getSpriteData(asset.id, asset.side === 'front', {gen: 9});
						if (data.url !== '/sprites/' + asset.installedPath) throw new Error('Unexpected sprite: ' + data.url);
						const image = new Image();
						image.src = data.url;
						await image.decode();
						if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) throw new Error('Wrong GIF dimensions');
					}
					return assets.length;
				}, manifest.assets);
				assert.equal(decoded, 74);
				console.log('Chromium decoded all 74 local front/back GIFs with original dimensions');
			}
			await page.locator('#end').click();
			await page.waitForFunction(() => testBattle.turn === 3 && testBattle.seeking === null);
			const checkScene = async swapped => {
				const expected = swapped ? ['back/baxcaliburmega.gif', 'front/absolmegaz.gif'] : ['back/absolmegaz.gif', 'front/baxcaliburmega.gif'];
				for (const file of expected) {
					const image = page.locator(`.battle img[src="/sprites/za/${file}"]`);
					await image.waitFor({state: 'visible'});
					await image.evaluate(element => element.decode());
					assert(await image.evaluate(element => element.complete && element.naturalWidth > 0));
				}
			};
			await checkScene(false);
			await page.locator('#viewpoint').click();
			await page.waitForFunction(() => testBattle.viewpointSwitched && testBattle.seeking === null);
			await checkScene(true);
			await page.locator('#viewpoint').click();
			await page.waitForFunction(() => !testBattle.viewpointSwitched && testBattle.seeking === null);
			await checkScene(false);
			await page.locator('#restart').click();
			await page.locator('#play').click();
			await page.waitForFunction(() => !testBattle.paused);
			await page.locator('#pause').click();
			await page.waitForFunction(() => testBattle.paused);
			await page.locator('#turn').fill('2');
			await page.locator('#turn-form button').click();
			await page.waitForFunction(() => testBattle.turn === 2 && testBattle.seeking === null);
			await checkScene(false);
			assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			assert.deepEqual(errors, []);
			console.log(`Native Z-A Mega scene, double viewpoint switch, playback and navigation passed at ${width}px`);
			await page.close();
		}
	} finally {
		if (browser) await browser.close();
		await new Promise(resolve => server.close(resolve));
	}
})().catch(error => { console.error(error); process.exitCode = 1; });
