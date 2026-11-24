const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const root = path.resolve(__dirname, '../play.pokemonshowdown.com');
const manifest = {
	version: 1, avatars: {fixture: {file: 'fixture.png'}}, participants: {testplayer: 'fixture'},
};
function session({local = true, host = 'copa-rinha-showdown.onrender.com', missing = false, data = manifest} = {}) {
	const requests = [], images = [];
	let updates = 0;
	const context = vm.createContext({
		Config: {copaRinhaLocalNames: local, defaultserver: {host, port: 443}},
		PS: {update() { updates++; }}, toID: value => value.toLowerCase().replace(/[^a-z0-9]/g, ''),
		fetch: (url, options) => { requests.push({url, options}); return Promise.resolve({ok: true, json: async () => data}); },
		Image: class {
			naturalWidth = 80; naturalHeight = 80;
			set src(url) { images.push(url); queueMicrotask(() => missing ? this.onerror() : this.onload()); }
		},
	});
	context.window = context;
	const registry = vm.runInContext(fs.readFileSync(path.join(root, 'js/copa-avatars.js'), 'utf8') + '\nCopaRinhaAvatars;', context);
	return {registry, context, requests, images, updates: () => updates};
}

test('empty administrative avatar manifest ships no invented identity or artwork', () => {
	const actual = JSON.parse(fs.readFileSync(path.join(root, 'assets/copa-rinha/avatars.json'), 'utf8'));
	assert.deepEqual(actual, {version: 1, avatars: {}, participants: {}});
});
test('validated local participant artwork loads once from this client and resolves by exact userid', async () => {
	const s = session();
	await Promise.all([s.registry.load(), s.registry.load()]);
	assert.equal(s.requests.length, 1);
	assert.equal(s.requests[0].url, '/assets/copa-rinha/avatars.json');
	assert.equal(s.requests[0].options.credentials, 'omit');
	assert.deepEqual(s.images, ['/assets/copa-rinha/avatars/fixture.png']);
	assert.equal(s.registry.resolve('Test Player'), '/assets/copa-rinha/avatars/fixture.png');
	assert.equal(s.registry.resolve('Another Player'), null);
	assert.equal(s.updates(), 1);
});
test('missing custom artwork or unavailable manifest leaves the native avatar in charge', async () => {
	const s = session({missing: true});
	await s.registry.load();
	assert.equal(s.registry.resolve('Test Player'), null);
	const unavailable = session();
	unavailable.context.fetch = () => Promise.reject(new Error('fixture failure'));
	await unavailable.registry.load();
	assert.equal(unavailable.registry.resolve('Test Player'), null);
});
test('avatar associations stay inactive outside the local Copa client and after server changes', async () => {
	for (const options of [{local: false}, {host: 'another.example'}]) {
		const s = session(options); await s.registry.load();
		assert.equal(s.requests.length, 0); assert.equal(s.registry.resolve('Test Player'), null);
	}
	const s = session(); await s.registry.load();
	s.context.Config.server = {host: 'another.example'};
	assert.equal(s.registry.resolve('Test Player'), null);
	delete s.context.Config.server; s.context.PS.server = {host: 'another.example'};
	assert.equal(s.registry.resolve('Test Player'), null);
});
test('manifest rejects remote URLs, traversal, SVG, nonexistent avatar IDs and oversized collections', () => {
	const s = session();
	for (const file of ['https://example.com/a.png', '../a.png', 'nested/a.png', 'a..png', 'x.svg', 'x.png?token=x', 'x.png#x', '%2f.png']) {
		assert.equal(s.registry.validate({version: 1, avatars: {fixture: {file}}, participants: {testplayer: 'fixture'}}), null, file);
	}
	assert.equal(s.registry.validate({version: 1, avatars: {}, participants: {testplayer: 'missing'}}), null);
	assert.equal(s.registry.validate({version: 1, avatars: {}, participants: {testplayer: 'constructor'}}), null);
	assert.equal(s.registry.validate({version: 1, avatars: [], participants: {}}), null);
	assert.equal(s.registry.validate({version: 1, avatars: {}, participants: {'Test Player': 'fixture'}}), null);
	assert.equal(s.registry.validate({version: 1, avatars: Object.fromEntries(Array.from({length: 65}, (_, i) => ['a' + i, {file: 'a.png'}])), participants: {}}), null);
});
test('optional avatar adapter preserves native defaults and compatible custom trainer paths', () => {
	global.window = global;
	global.Config = {routes: {client: 'play.pokemonshowdown.com'}, server: {host: 'copa-rinha-showdown.onrender.com', port: 443}};
	require('../play.pokemonshowdown.com/js/battle-dex-data');
	require('../play.pokemonshowdown.com/js/battle-dex');
	const dex = global.Dex;
	const original = dex.resolveAvatar('lucas');
	assert.equal(original, dex.resourcePrefix + 'sprites/trainers/lucas.png');
	assert.equal(dex.resolveAvatar('#fixture'), dex.resourcePrefix + 'sprites/trainers-custom/fixture.png');
	assert.equal(dex.resolveAvatar('fixture.png'), 'https://copa-rinha-showdown.onrender.com:443/avatars/fixture.png');
	global.CopaRinhaAvatars = {resolve: name => name === 'Test Player' ? '/assets/copa-rinha/avatars/fixture.png' : null};
	assert.equal(dex.resolveAvatar('lucas', 'Test Player'), '/assets/copa-rinha/avatars/fixture.png');
	assert.equal(dex.resolveAvatar('lucas', 'Someone Else'), original);
	assert.equal(dex.resolveAvatar('lucas'), original);
	delete global.CopaRinhaAvatars;
});
