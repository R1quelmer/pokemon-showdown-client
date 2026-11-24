// Real native team viewer/importer with a synthetic read-only API; no live R2.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const id = 'a'.repeat(32);
const packedTeam = 'Frog|Greninja-Mega|LifeOrb|Protean|Surf,DarkPulse,IceBeam,U-turn|Timid|,,,252,4,252||,,,0,,|||,,,,,Water';
const team = {id, schemaVersion: 1, name: '<img src=x onerror=alert(1)> Shared', format: 'gen9coparinhanationaldexza',
	createdAt: '2026-11-24T12:00:00Z', packedTeam, importText: '<untrusted export>'};
(async () => {
	const server = http.createServer(async (req, res) => {
		const pathname = new URL(req.url, 'http://localhost').pathname;
		const file = path.resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
		if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
		try {
			const body = await fs.readFile(file);
			const type = {'.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif'}[path.extname(file)];
			res.writeHead(200, {'Content-Type': (type || 'application/octet-stream') + '; charset=utf-8'}).end(body);
		} catch { res.writeHead(404).end(); }
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	let browser;
	try {
		browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
		const origin = `http://127.0.0.1:${server.address().port}`;
		for (const width of [1440, 1000, 390, 320]) {
			const page = await browser.newPage({viewport: {width, height: 844}});
			const errors = [];
			page.on('pageerror', error => errors.push(error.message));
			await page.addInitScript(() => {
				window.Worker = undefined;
				window.fixtureClipboard = '';
				Object.defineProperty(navigator, 'clipboard', {value: {writeText: async value => { window.fixtureClipboard = value; }}});
			});
			await page.routeWebSocket(/^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/, ws => {
				ws.send('|updateuser| Guest 1|0|lucas\n|challstr|4|synthetic-challenge');
			});
			let status = 200;
			await page.route('**/*', async route => {
				const url = route.request().url();
				if (url.includes('/config/config.js')) return route.fulfill({contentType: 'text/javascript', body: "var Config={customcolors:{},whitelist:[],routes:{client:'play.pokemonshowdown.com'},defaultserver:{host:'localhost',port:8000}};"});
				if (url === 'https://copa-rinha-showdown.onrender.com/copa-rinha/teams/' + id) {
					return route.fulfill({status, json: status === 200 ? team : {error:'untrusted internal server detail'}});
				}
				if (url.startsWith(origin)) return route.continue();
				return route.abort();
			});
			await page.goto(`${origin}/team.html?id=${id}`);
			await page.waitForFunction(() => document.getElementById('team-status').textContent === 'Time carregado.');
			assert.equal(await page.locator('#team-name img').count(), 0);
			assert((await page.locator('#team-name').textContent()).includes('<img'));
			assert.equal(await page.locator('.pokemon-build').count(), 1);
			const content = await page.locator('.pokemon-build').textContent();
			for (const text of ['Greninja', 'Frog', 'Life Orb', 'Protean', 'Surf', 'Timid', 'Water', '252', '0 SpA']) assert(content.includes(text));
			await page.locator('#copy-team').click();
			assert((await page.evaluate(() => fixtureClipboard)).includes('Surf'));
			assert(!(await page.evaluate(() => fixtureClipboard)).includes('untrusted export'));
			await page.locator('#copy-team-link').click();
			assert.equal(await page.evaluate(() => fixtureClipboard), `${origin}/team.html?id=${id}`);
			assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			if (process.env.COPA_SCREENSHOTS) {
				await page.locator('#team-name').evaluate(element => { element.textContent = 'Time de teste — Copa Rinha II'; });
				await page.locator('.pokemon-sprite').evaluate(image => image.decode());
			}
			if (process.env.COPA_SCREENSHOTS) await page.screenshot({path:path.join(process.env.COPA_SCREENSHOTS, `team-${width}.png`), fullPage:true});
			await page.locator('#import-team').click();
			await page.waitForFunction(() => window.PS?.teams?.list.length === 1 && location.hash.startsWith('#team-'));
			assert.equal(await page.evaluate(() => PS.teams.list[0].format), 'gen9coparinhanationaldexza');
			assert(!(await page.evaluate(() => location.search)).includes('import-team='));
			await page.reload();
			await page.waitForFunction(() => window.PS?.teams?.list.length === 1);
			assert.equal(await page.evaluate(() => PS.teams.list[0].packedTeam.includes('Surf')), true);
			for (const code of [404,503]) {
				status = code;
				await page.goto(`${origin}/team.html?id=${id}`);
				await page.waitForFunction(() => document.getElementById('team-status').textContent !== 'Carregando time…');
				assert(!(await page.locator('#team-status').textContent()).includes('internal server detail'));
				assert(await page.locator('#team-content').evaluate(el => el.hidden));
			}
			await page.goto(`${origin}/team.html?id=bad`);
			assert((await page.locator('#team-status').textContent()).includes('inválido'));
			await page.goto(`${origin}/team.html`);
			assert(await page.locator('#team-link').isVisible());
			assert.deepEqual(errors, []);
			console.log(`Native team view/copy/import/persistence, safe text, errors and layout passed at ${width}px`);
			await page.close();
		}
	} finally {
		if (browser) await browser.close();
		await new Promise(resolve => server.close(resolve));
	}
})().catch(error => { console.error(error); process.exitCode = 1; });
