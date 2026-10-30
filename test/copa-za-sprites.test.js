const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');

global.window = global;
global.BattlePokedex = require('../play.pokemonshowdown.com/data/pokedex').BattlePokedex;
require('../play.pokemonshowdown.com/js/battle-dex-data');
require('../play.pokemonshowdown.com/js/battle-dex');
require('../play.pokemonshowdown.com/js/battle-scene-stub');
require('../play.pokemonshowdown.com/js/battle-text-parser');
require('../play.pokemonshowdown.com/js/battle');

const spritesRoot = path.resolve(__dirname, '../play.pokemonshowdown.com/sprites');
const manifest = JSON.parse(fs.readFileSync(path.join(spritesRoot, 'za/manifest.json')));
const ids = [...new Set(manifest.assets.map(asset => asset.id))];
const resolve = (species, front = true, options = {}) => Dex.getSpriteData(species, front, {gen: 9, ...options});

test('all 37 exact existing Z-A forms resolve to local front/back GIFs with original dimensions', () => {
	assert.equal(ids.length, 37);
	assert.equal(manifest.assets.length, 74);
	for (const asset of manifest.assets) {
		const species = Dex.species.get(asset.id);
		assert(species.exists, asset.id);
		assert(species.isMega, asset.id);
		assert.equal(species.gen, 9, asset.id);
		const sprite = resolve(species.name, asset.side === 'front');
		assert.equal(sprite.url, '/sprites/' + asset.installedPath);
		assert.equal(sprite.w, asset.width);
		assert.equal(sprite.h, asset.height);
		assert.equal(sprite.isFrontSprite, asset.side === 'front');
		assert.equal(sprite.pixelated, true);
	}
});

test('installed GIFs match the reference hashes and dimensions byte for byte', () => {
	for (const asset of manifest.assets) {
		const bytes = fs.readFileSync(path.join(spritesRoot, asset.installedPath));
		assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.installedPath);
		assert.match(bytes.toString('ascii', 0, 6), /^GIF8[79]a$/);
		assert.equal(bytes.readUInt16LE(6), asset.width);
		assert.equal(bytes.readUInt16LE(8), asset.height);
	}
});

test('normal Pokemon and old Megas keep native static and animated sprite resolution', () => {
	const previous = global.BattlePokemonSprites;
	try {
		global.BattlePokemonSprites = {
			pikachu: {front: {w: 41, h: 39}, back: {w: 42, h: 40}},
			charizardmegax: {front: {w: 96, h: 100}, back: {w: 97, h: 101}},
		};
		for (const [name, file] of [['Pikachu', 'pikachu'], ['Charizard-Mega-X', 'charizard-megax']]) {
			for (const front of [true, false]) {
				const sprite = resolve(name, front);
				assert.equal(sprite.url, `${Dex.resourcePrefix}sprites/ani${front ? '' : '-back'}/${file}.gif`);
				assert.equal(sprite.pixelated, false);
			}
		}
		global.BattlePokemonSprites = {};
		assert.equal(resolve('Pikachu').url, `${Dex.resourcePrefix}sprites/gen5/pikachu.png`);
		assert.equal(resolve('Charizard-Mega-X').url, `${Dex.resourcePrefix}sprites/gen5/charizard-megax.png`);
	} finally { global.BattlePokemonSprites = previous; }
});

test('missing Z-A forms fall back without borrowing another gender, color or posture sprite', () => {
	for (const name of ['Clefable-Mega', 'Meowstic-M-Mega', 'Magearna-Original-Mega', 'Tatsugiri-Droopy-Mega', 'Tatsugiri-Stretchy-Mega']) {
		for (const front of [true, false]) {
			const sprite = resolve(name, front);
			assert(!sprite.url.includes('/sprites/za/'), name);
			assert(sprite.url.startsWith(Dex.resourcePrefix + 'sprites/'), name);
			assert(sprite.w > 0 && sprite.h > 0);
		}
	}
});

test('shiny without a corresponding asset uses the native shiny path for all 37 forms', () => {
	for (const id of ids) {
		for (const front of [true, false]) {
			const sprite = resolve(id, front, {shiny: true});
			assert.equal(sprite.shiny, true);
			assert(!sprite.url.includes('/sprites/za/'));
			assert(sprite.url.includes('-shiny/'));
		}
	}
});

test('noanim, nogif and April Fools preferences retain native resolution', () => {
	const prefs = Dex.prefs;
	try {
		for (const setting of ['noanim', 'nogif']) {
			Dex.prefs = key => key === setting;
			assert.equal(resolve('Absol-Mega-Z').url, `${Dex.resourcePrefix}sprites/gen5/absol-megaz.png`);
		}
		Dex.prefs = () => false;
		assert.equal(resolve('Absol-Mega-Z', true, {afd: true}).url, `${Dex.resourcePrefix}sprites/afd/absol-megaz.png`);
	} finally { Dex.prefs = prefs; }
});

test('custom resolution preserves native Dynamax scaling and noScale behavior', () => {
	const normal = resolve('Absol-Mega-Z');
	const max = resolve('Absol-Mega-Z', true, {dynamax: true});
	assert.equal(max.url, normal.url);
	assert.equal(max.w, normal.w * 2);
	assert.equal(max.h, normal.h * 2);
	assert.equal(max.y, normal.y - 22);
	assert.equal(resolve('Absol-Mega-Z', true, {dynamax: true, noScale: true}).w, normal.w);
});

test('native Pokemon forme changes, shiny state and perspective use the same resolver', () => {
	const battle = new Battle({paused: true, debug: true});
	battle.addBatch([
		'|gen|9', '|player|p1|Alice', '|player|p2|Bob', '|start',
		'|switch|p1a: Absol|Absol, L100|100/100', '|switch|p2a: Baxcalibur|Baxcalibur, L100|100/100',
		'|detailschange|p1a: Absol|Absol-Mega-Z, L100',
		'|detailschange|p2a: Baxcalibur|Baxcalibur-Mega, L100', '|turn|1',
	]);
	battle.seekTurn(Infinity);
	const p1 = battle.p1.active[0];
	const p2 = battle.p2.active[0];
	assert.equal(resolve(p1, false).url, '/sprites/za/back/absolmegaz.gif');
	assert.equal(resolve(p2, true).url, '/sprites/za/front/baxcaliburmega.gif');
	battle.switchViewpoint();
	assert.equal(resolve(p1, true).url, '/sprites/za/front/absolmegaz.gif');
	assert.equal(resolve(p2, false).url, '/sprites/za/back/baxcaliburmega.gif');
	p1.shiny = true;
	assert(resolve(p1).url.includes('-shiny/'));
	battle.destroy();
});
