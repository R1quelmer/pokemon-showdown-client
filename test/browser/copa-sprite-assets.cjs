// Browser-only fixture for genuine upstream image bytes. Production resource
// paths stay unchanged. The fixture prevents offline/API-mocked screenshots
// from silently showing broken native sprites and type icons.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {promisify} = require('node:util');
const manifest = require('./copa-sprite-fixtures.json');
const run = promisify(execFile);
const cacheRoot = path.join(os.tmpdir(), `copa-native-sprite-fixtures-${manifest.revision}`);
const pending = new Map();

function validate(bytes, relativePath) {
	const expected = manifest.assets[relativePath];
	const oid = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
	assert.equal(oid, expected.gitBlob, `Original Git blob hash: ${relativePath}`);
	return bytes;
}

async function loadSprite(relativePath) {
	assert(manifest.assets[relativePath], `Native fixture asset must be pinned: ${relativePath}`);
	if (!pending.has(relativePath)) {
		pending.set(relativePath, (async () => {
			const cacheFile = path.join(cacheRoot, relativePath);
			try {
				return validate(await fs.readFile(cacheFile), relativePath);
			} catch (error) {
				if (error.code !== 'ENOENT') throw error;
			}
			const source = manifest.assets[relativePath].source || `https://raw.githubusercontent.com/MasterTernimus/PokemonShowdown-Client/${manifest.revision}/play.pokemonshowdown.com/sprites/${relativePath}`;
			const {stdout} = await run('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '20', source], {
				encoding: 'buffer', maxBuffer: 5 * 1024 * 1024,
			});
			const bytes = validate(stdout, relativePath);
			await fs.mkdir(path.dirname(cacheFile), {recursive: true});
			await fs.writeFile(cacheFile, bytes);
			return bytes;
		})());
	}
	return pending.get(relativePath);
}

// Call before a catch-all route abort. Returns false for every URL outside the
// exact allowlist, including Z-A sprites (which must be served by our own app).
async function serveNativeSprite(route) {
	const url = new URL(route.request().url());
	if (url.hostname !== 'play.pokemonshowdown.com') return false;
	// Build native sprite metadata from real, hash-verified fixture GIF dimensions.
	// The production page loads the upstream metadata, just like the native client.
	if (/^\/data\/pokedex-mini(?:-bw)?\.js$/.test(url.pathname)) {
		const bw = url.pathname.endsWith('-bw.js');
		const data = {};
		for (const relative of Object.keys(manifest.assets)) {
			if (!relative.startsWith(bw ? 'gen5ani/' : 'ani/') || !relative.endsWith('.gif')) continue;
			const bytes = await loadSprite(relative);
			if (bytes.toString('ascii', 0, 3) !== 'GIF') continue;
			const id = path.basename(relative, '.gif').replace(/[^a-z0-9]/g, '');
			data[id] = {front: {w: bytes.readUInt16LE(6), h: bytes.readUInt16LE(8)}};
		}
		await route.fulfill({contentType: 'text/javascript', body:
			`window.${bw ? 'BattlePokemonSpritesBW' : 'BattlePokemonSprites'}=${JSON.stringify(data)};`});
		return true;
	}
	const relativePath = decodeURIComponent(url.pathname).replace(/^\/sprites\//, '');
	if (!url.pathname.startsWith('/sprites/') || !manifest.assets[relativePath]) return false;
	const body = await loadSprite(relativePath);
	await route.fulfill({
		body, contentType: relativePath.endsWith('.gif') ? 'image/gif' : 'image/png',
		headers: {'access-control-allow-origin': '*'},
	});
	return true;
}

// Check actual image/background decoding, rather than just checking that a
// resource URL was assigned. Select only the visible Teambuilder sprite/icon
// elements relevant to the screenshot.
async function assertSpriteElementsLoaded(page, selector) {
	const results = await page.locator(selector).evaluateAll(async elements => {
		const urls = new Set();
		for (const element of elements) {
			const rect = element.getBoundingClientRect();
			if (!rect.width || !rect.height) continue;
			if (element.tagName === 'IMG') urls.add(element.src);
			const background = getComputedStyle(element).backgroundImage;
			for (const match of background.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(match[1]);
		}
		return Promise.all([...urls].map(url => new Promise(resolve => {
			const image = new Image();
			image.onload = () => resolve({url, loaded: image.naturalWidth > 0});
			image.onerror = () => resolve({url, loaded: false});
			image.src = url;
		})));
	});
	assert(results.length, `No image resources found for ${selector}`);
	assert.deepEqual(results.filter(result => !result.loaded), [], 'Every visible sprite/type icon must decode');
	return results;
}

module.exports = {serveNativeSprite, assertSpriteElementsLoaded, loadSprite, manifest};
