const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const root = path.resolve(__dirname, '../play.pokemonshowdown.com');
const id = 'a'.repeat(32);
function session({status = 200, response, failure = false, search = `?~~copa-rinha-showdown.onrender.com:443&copa-rinha=1&import-team=${id}`} = {}) {
	const requests = [], alerts = [], rooms = [];
	const existing = {name: 'Existing', packedTeam: '', format: 'gen9coparinhanationaldexza', key: 'existing'};
	let saved = 0, replacement;
	const context = vm.createContext({
		URL, URLSearchParams, AbortSignal, console,
		Config: {routes: {client: 'play.pokemonshowdown.com'}, copaRinhaSingleFormat: true},
		location: {href: 'https://copa-rinha-client.onrender.com/testclient-new.html' + search + '#teambuilder', origin: 'https://copa-rinha-client.onrender.com', pathname: '/testclient-new.html', hash: '#teambuilder', search},
		history: {state: null, replaceState(_state, _title, url) { replacement = url; }},
		PS: {teams: {list: [existing], unshift(team) { team.key = 'imported'; this.list.unshift(team); }, save() { saved++; }},
			join(room) { rooms.push(room); }, alert(message) { alerts.push(message); }},
		async fetch(url, options) {
			requests.push({url, options});
			if (failure) throw new Error('network failed with internal detail');
			return {ok: status === 200, status, text: async () => JSON.stringify(response || fixture)};
		},
	});
	context.window = context;
	context.exports = context;
	for (const file of ['data/pokedex.js', 'data/moves.js', 'data/items.js', 'data/abilities.js', 'js/battle-dex-data.js', 'js/battle-dex.js', 'js/battle-teams.js', 'js/copa-team-import.js']) {
		vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
	}
	const helper = vm.runInContext('CopaSharedTeams', context);
	const native = vm.runInContext('Teams', context);
	const packed = native.pack([{name: '<Example>', species: 'Pikachu', item: 'Pikanium Z', ability: 'Static',
		moves: ['Volt Tackle'], nature: 'Jolly', shiny: true, teraType: 'Water', evs: {atk: 252, spe: 252}, ivs: {spa: 0}}]);
	const fixture = {id, name: 'Shared | team/name', format: 'gen9coparinhanationaldexza', createdAt: '2026-11-24T12:00:00Z', packedTeam: packed, importText: '<untrusted export>'};
	return {helper, native, fixture, context, requests, alerts, rooms, existing, get saved() { return saved; }, get replacement() { return replacement; }};
}

test('shared team ID parser accepts only exact IDs or own team URLs', () => {
	const s = session();
	assert.equal(s.helper.idFromInput(id), id);
	assert.equal(s.helper.idFromInput('https://copa-rinha-client.onrender.com/team.html?id=' + id), id);
	for (const input of ['https://evil.example/team.html?id=' + id, 'javascript:alert(1)', '../replay.html?id=' + id, 'bad',
		'https://copa-rinha-client.onrender.com/team.html?id=' + id + '&id=' + id]) assert.equal(s.helper.idFromInput(input), null);
});
test('native serialization preserves item, moves, shiny, Tera, EVs and IVs; export text is regenerated', () => {
	const s = session(); const shared = s.helper.parse(s.fixture, id);
	assert.equal(shared.sets[0].species, 'Pikachu');
	assert.equal(shared.sets[0].item, 'Pikanium Z');
	assert.equal(shared.sets[0].teraType, 'Water');
	assert.equal(shared.sets[0].shiny, true);
	assert.equal(shared.sets[0].ivs.spa, 0);
	assert(shared.importText.includes('Volt Tackle')); assert(shared.importText.includes('Tera Type: Water'));
	assert(!shared.importText.includes('untrusted export'));
	assert.equal(s.native.export(s.native.import(shared.importText)), shared.importText);
});
test('malformed, oversized, wrong-format and mismatched-ID responses are rejected', () => {
	const s = session();
	for (const value of [null, {}, {...s.fixture, id: 'b'.repeat(32)}, {...s.fixture, format: 'gen9ou'},
		{...s.fixture, packedTeam: 'x'.repeat(65537)}, {...s.fixture, packedTeam: ''},
		{...s.fixture, packedTeam: 'NotARealPokemonAtAll||||tackle|||||||'}]) assert.throws(() => s.helper.parse(value, id));
});
test('API origin is fixed, read only and never receives credentials', async () => {
	const s = session(); const shared = await s.helper.fetchTeam(id);
	assert.equal(shared.id, id);
	assert.equal(s.requests[0].url, 'https://copa-rinha-showdown.onrender.com/copa-rinha/teams/' + id);
	assert.equal(s.requests[0].options.credentials, 'omit');
	assert.equal(s.requests[0].options.method, undefined);
	await assert.rejects(s.helper.fetchTeam('../evil'));
	assert.equal(s.requests.length, 1);
});
test('native team import preserves existing teams, saves once and avoids repeat duplicates', async () => {
	const s = session(); await s.helper.importFromURL();
	assert.equal(s.context.PS.teams.list.length, 2);
	assert.equal(s.context.PS.teams.list[1], s.existing);
	assert.equal(s.saved, 1); assert.deepEqual(s.rooms, ['team-imported']);
	const imported = s.context.PS.teams.list[0];
	assert(!/[|\r\n/]/.test(imported.name));
	assert.equal(imported.format, 'gen9coparinhanationaldexza');
	assert.equal(imported.teamid, undefined);
	await s.helper.importFromURL();
	assert.equal(s.context.PS.teams.list.length, 2); assert.equal(s.saved, 1);
});
test('removing import query keeps upstream server syntax and other routing intact', async () => {
	const s = session(); await s.helper.importFromURL();
	assert.equal(s.replacement, '/testclient-new.html?~~copa-rinha-showdown.onrender.com:443&copa-rinha=1#teambuilder');
	assert.equal(s.helper.withoutImport('?~~localhost:8000&import-team=' + id + '&x=1'), '?~~localhost:8000&x=1');
});
test('404/503/network errors leave all existing teams untouched and report safe messages', async () => {
	for (const opts of [{status: 404}, {status: 503}, {failure: true}]) {
		const s = session(opts); await s.helper.importFromURL();
		assert.equal(s.context.PS.teams.list.length, 1); assert.equal(s.saved, 0); assert.equal(s.replacement, undefined);
		assert.equal(s.alerts.length, 1); assert(!s.alerts[0].includes('internal detail'));
	}
});
test('helper does not start an import outside Copa or without an import parameter', async () => {
	const s = session(); s.context.Config.copaRinhaSingleFormat = false;
	await s.helper.importFromURL(); assert.equal(s.requests.length, 0);
	const without = session({search: '?~~copa-rinha-showdown.onrender.com:443'});
	await without.helper.importFromURL(); assert.equal(without.requests.length, 0);
});
