const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const {parseSync, traverse} = require('@babel/core');
global.window = global;
global.Config = {copaRinhaSingleFormat: true, routes: {client: 'localhost'}};
require('../play.pokemonshowdown.com/js/battle-dex-data');
require('../play.pokemonshowdown.com/js/battle-dex');
const canonical = 'gen9coparinhanationaldexza';
const oldName = '[Gen 9] [Copa Rinha] National Dex ZA';
function parser(file) {
	const source = fs.readFileSync(file, 'utf8');
	let fn;
	traverse(parseSync(source), {
		FunctionExpression(path) {
			if (path.node.id?.name === 'parseFormats' || path.parent.key?.name === 'parseFormats') fn = path.node;
		},
	});
	assert(fn);
	return vm.runInThisContext('(' + source.slice(fn.start, fn.end) + ')');
}
test('new and legacy format names retain Gen 9 National Dex identity and independent mechanics data', () => {
	for (const name of [canonical, oldName, 'Copa Rinha II', 'coparinhanationaldexza', 'gen6coparinhanationaldexza']) {
		const format = Dex.formats.get(name);
		assert.equal(format.id, canonical); assert.equal(format.name, 'Copa Rinha II');
		assert.equal(format.gen, 9); assert.equal(format.isNatDex, true);
	}
});
for (const [label, file] of [
	['modern', 'play.pokemonshowdown.com/js/panel-mainmenu.js'],
	['legacy', 'play.pokemonshowdown.com/src/oldclient/client.js'],
]) {
	test(`${label} native parser offers only Copa for search, challenge and teambuilder with old/new servers`, () => {
		global.PS = {teams: {update() {}}}; global.app = {supports: {}};
		const parse = parser(file);
		for (const name of [oldName, 'Copa Rinha II']) {
			parse.call({trigger() {}}, ['formats', ',1', 'S/V Singles', '[Gen 9] OU,e', '[Gen 9] Random Battle,f', ',2', 'Copa Rinha', name + ',e']);
			assert.deepEqual(Object.keys(BattleFormats), [canonical]);
			const format = BattleFormats[canonical];
			assert.equal(format.name, 'Copa Rinha II'); assert(format.searchShow); assert(format.challengeShow);
			assert(format.isTeambuilderFormat); assert.equal(format.gen, 9); assert(format.isNatDex);
		}
	});
}
test('format filtering is scoped to Copa client; official formats remain usable outside it', () => {
	Config.copaRinhaSingleFormat = false;
	try {
		const formats = Dex.formats.load({gen9ou: {name: '[Gen 9] OU'}, gen9randombattle: {name: '[Gen 9] Random Battle'}});
		assert.deepEqual(Object.keys(formats), ['gen9ou', 'gen9randombattle']);
		assert.equal(formats.gen9ou.gen, 9);
	} finally { Config.copaRinhaSingleFormat = true; }
});
