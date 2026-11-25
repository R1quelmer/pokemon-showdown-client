const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { serveNativeSprite } = require('./copa-sprite-assets.cjs');

const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const screenshots = process.env.COPA_TRANSFER_SCREENSHOTS || '/tmp/copa-team-transfer';
const copaFormat = 'gen9coparinhanationaldexza';

async function run() {
	const server = http.createServer(async (req, res) => {
		const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
		if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
		try {
			const type = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.gif': 'image/gif',
				'.png': 'image/png', '.woff2': 'font/woff2'}[path.extname(file)];
			res.writeHead(200, {'Content-Type': type || 'application/octet-stream'}).end(await fs.readFile(file));
		} catch {
			if (!res.headersSent) res.writeHead(404);
			res.end();
		}
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const origin = 'http://127.0.0.1:' + server.address().port;
	let browser;
	try {
		browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
		await fs.mkdir(screenshots, {recursive: true});
		const open = async (width, clipboard) => {
			const context = await browser.newContext({viewport: {width, height: 900}});
			const page = await context.newPage();
			const errors = [];
			page.on('pageerror', error => errors.push(error.message));
			await page.addInitScript(hasClipboard => {
				window.Worker = undefined;
				Object.defineProperty(navigator, 'clipboard', {value: hasClipboard ? {
					writeText: async value => { window.copiedBackup = value; },
				} : undefined});
			}, clipboard);
			await page.routeWebSocket(/^wss:\/\/copa-rinha-showdown\.onrender\.com(?::443)?\/showdown\/websocket$/, ws => {
				ws.send('|formats|,1|Copa Rinha|[Gen 9] Copa Rinha II,e\n|updateuser| Copa QA|1|1');
			});
			await page.route('**/*', async route => {
				const url = route.request().url();
				if (url.includes('/config/config.js')) {
					return route.fulfill({contentType: 'text/javascript', body:
						"var Config={customcolors:{},whitelist:[],routes:{client:'play.pokemonshowdown.com'},defaultserver:{host:'localhost',port:8000}};"});
				}
				if (await serveNativeSprite(route)) return;
				return url.startsWith(origin) ? route.continue() : route.abort();
			});
			await page.goto(origin + '/testclient-new.html?~~copa-rinha-showdown.onrender.com:443&copa-rinha=1');
			await page.waitForFunction(() => window.PS?.connection?.connected && PS.user.named);
			await page.evaluate(() => PS.join('teambuilder'));
			return {page, errors};
		};
		const desktop = await open(1440, true);
		const mobile = await open(390, false);
		const addTeams = (page, teams) => page.evaluate(teams => {
			for (const [name, folder, format, content] of teams) {
				PS.teams.push({name, folder, format, packedTeam: Teams.pack(Teams.import(content)), isBox: false, iconCache: null});
			}
			PS.teams.save();
			PS.rooms.teambuilder.update(null);
			return localStorage.getItem('showdown_teams');
		}, teams);
		const {page} = desktop;
		const original = await addTeams(page, [
			['Megas da Copa', 'Rodada 2', copaFormat, 'Greninja-Mega @ Greninjite\nAbility: Protean\n- Surf\n\nClefairy\n- Moonblast'],
			['Reserva', 'Treino', 'gen9ou', 'Landorus-Therian (M)\nShiny: Yes\nTera Type: Water\n- Earthquake'],
		]);
		await page.getByRole('button', {name: 'Copiar todos os times'}).click();
		await page.getByText('2 times copiados.').waitFor();
		const backup = await page.evaluate(() => window.copiedBackup);
		assert.equal(backup, original);
		await page.screenshot({path: path.join(screenshots, 'teambuilder-desktop.png')});

		const phone = mobile.page;
		const seed = await addTeams(phone, [['Time do celular', 'Favoritos', 'gen9ou', 'Kingambit\n- Kowtow Cleave']]);
		const openImport = async text => {
			await phone.getByRole('button', {name: 'Importar todos os times'}).click();
			await phone.getByLabel('Cole o backup dos times').fill(text);
		};
		const storage = () => phone.evaluate(() => localStorage.getItem('showdown_teams'));
		await openImport(backup + '\nconteúdo inválido');
		await phone.getByRole('button', {name: 'Adicionar aos existentes'}).click();
		await phone.getByText(/Backup inválido/).waitFor();
		assert.equal(await storage(), seed);
		await phone.getByLabel('Cole o backup dos times').fill(backup + '\n' + backup);
		await phone.screenshot({path: path.join(screenshots, 'importacao-mobile.png')});
		await phone.getByRole('button', {name: 'Adicionar aos existentes'}).click();
		await phone.getByText('2 times importados.').waitFor();
		assert.equal(await storage(), seed + '\n' + original);
		await openImport(backup);
		await phone.getByRole('button', {name: 'Adicionar aos existentes'}).click();
		await phone.getByText('0 times importados.').waitFor();
		await openImport(backup);
		await phone.getByRole('button', {name: 'Substituir todos…'}).click();
		await phone.getByRole('button', {name: 'Substituir todos os times', exact: true}).waitFor();
		await phone.screenshot({path: path.join(screenshots, 'confirmacao-mobile.png')});
		await phone.getByRole('button', {name: 'Cancelar', exact: true}).last().click();
		assert.equal(await storage(), seed + '\n' + original);
		await phone.getByRole('button', {name: 'Substituir todos…'}).click();
		await phone.getByRole('button', {name: 'Substituir todos os times', exact: true}).click();
		await phone.getByText('2 times importados.').waitFor();
		assert.equal(await storage(), original);
		await phone.reload();
		await phone.waitForFunction(() => window.PS?.connection?.connected && PS.user.named);
		await phone.evaluate(() => PS.join('teambuilder'));
		assert.equal(await storage(), original);
		await phone.getByRole('button', {name: 'Copiar todos os times'}).click();
		assert.equal(await phone.getByLabel('Backup dos times', {exact: true}).inputValue(), original);
		await phone.getByRole('button', {name: 'Cancelar', exact: true}).click();
		for (const [device, current] of [['desktop', page], ['mobile', phone]]) {
			await current.locator('a.team[href="team-megasdacopa"]').click();
			const za = current.locator('.copa-builder-sprite img[data-loaded][src$="/greninjamega.gif"]').first();
			const native = current.locator('.copa-builder-sprite img[data-loaded][src$="/clefairy.gif"]').first();
			await za.waitFor();
			await native.waitFor();
			await current.screenshot({path: path.join(screenshots, 'sprites-' + device + '.png')});
			assert(await current.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
			await za.evaluate(image => image.dispatchEvent(new Event('error')));
			await native.evaluate(image => image.dispatchEvent(new Event('error')));
			await current.locator('.copa-builder-sprite img[data-loaded][src$="/gen5/greninja-mega.png"]').first().waitFor();
			await current.locator('.copa-builder-sprite img[data-loaded][src$="/gen5/clefairy.png"]').first().waitFor();
			assert.match(await current.evaluate(() => {
				const pikachu = BattlePokemonSpritesBW.pikachu;
				BattlePokemonSpritesBW.pikachu = {front: {w: 80, h: 80}, frontf: {w: 80, h: 80}};
				try {
					return Dex.getCopaDisplaySprite({species: 'Pikachu', gender: 'F', shiny: true}).url;
				} finally {
					BattlePokemonSpritesBW.pikachu = pikachu;
				}
			}), /\/gen5ani-shiny\/pikachu-f\.gif$/);
			await current.evaluate(() => {
				PS.prefs.set('noanim', true);
				PS.room.update(null);
			});
			await current.locator('.copa-builder-sprite img[data-loaded][src$="/greninja-mega.png"]').first().waitFor();
			assert.equal(await current.locator('.copa-builder-sprite img[src$=".gif"]').count(), 0);
		}
		assert.deepEqual(desktop.errors.concat(mobile.errors), []);
		console.log('Transfer, persistence, duplicates, invalid input, confirmation, sprites and static fallback passed.');
	} finally {
		await browser?.close();
		await new Promise(resolve => server.close(resolve));
	}
}
run().catch(error => { console.error(error); process.exitCode = 1; });
