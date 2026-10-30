const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const canonical = 'gen9coparinhanationaldexza';
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
	const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']});
	try {
		for (const legacy of [false, true]) {
			for (const name of ['[Gen 9] [Copa Rinha] National Dex ZA', 'Copa Rinha II']) {
				const page = await browser.newPage({viewport: {width: 1000, height: 800}});
				const errors = [];
				page.on('pageerror', error => (errors.push(error.message), console.error('Browser error:', error.stack)));
				const origin = `http://127.0.0.1:${server.address().port}`;
				await page.route('**/*', async route => {
					const url = route.request().url();
					if (url.includes('config/config.js')) {
						await route.fulfill({contentType: 'text/javascript', body: "var Config={customcolors:{},whitelist:[],routes:{client:'play.pokemonshowdown.com'},defaultserver:{host:'localhost',port:8000},copaRinhaSingleFormat:true};"});
					} else if (url.startsWith(origin)) {
						if (url.includes('testclient-new.html')) {
							const response = await route.fetch();
							await route.fulfill({response, body: (await response.text()).replace('Config.copaRinhaLocalNames =', 'Config.copaRinhaSingleFormat = true; Config.copaRinhaLocalNames =')});
						} else await route.continue();
					} else await route.abort();
				});
				await page.goto(`${origin}/testclient-${legacy ? 'old' : 'new'}.html?~~localhost:8000`);
				await page.waitForFunction(old => old ? !!window.app?.topbar : !!window.PS?.mainmenu, legacy);
				const entries = ['formats', ',1', 'Singles', '[Gen 9] OU,e', '[Gen 9] Random Battle,f', ',2', 'Copa Rinha', name + ',e'];
				await page.evaluate(({old, entries}) => {
					if (old) { app.isDisconnected = false; app.parseFormats(entries); app.rooms[''].updateFormats(); app.reconnectPending = false; while (app.popups.length) app.closePopup(); } else PS.mainmenu.parseFormats(entries);
				}, {old: legacy, entries});
				assert.deepEqual(await page.evaluate(() => Object.keys(BattleFormats)), [canonical]);
				assert.equal(await page.locator('button.formatselect').first().textContent(), 'Copa Rinha II');
				assert.equal(await page.locator('button.formatselect').first().getAttribute('value'), canonical);
				await page.locator('button.formatselect').first().click();
				assert.deepEqual((await page.locator('button.option').allTextContents()).map(text => text.trim()), ['Copa Rinha II']);
				await page.keyboard.press('Escape');
				await page.evaluate(old => { if (old) app.joinRoom('teambuilder'); else PS.join('teambuilder'); }, legacy);
				await page.getByRole('button', {name: /New team/i}).first().click();
				const teamFormat = await page.evaluate(old => old ? Storage.teams[0].format : PS.teams.list[0].format, legacy);
				assert.equal(teamFormat, canonical);
				assert((await page.locator('button.formatselect').allTextContents()).every(text => text.trim() === 'Copa Rinha II'));
				assert.deepEqual(errors, []);
				console.log(`${legacy ? 'Legacy' : 'Modern'} single format picker and new team passed against ${name}`);
				await page.close();
			}
		}
	} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
