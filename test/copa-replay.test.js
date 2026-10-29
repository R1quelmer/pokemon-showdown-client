const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('play.pokemonshowdown.com/js/copa-replay.js', 'utf8');
const id = 'a'.repeat(32);
async function load({search = `?id=${id}`, status = 200, fail = false} = {}) {
	const elements = new Map();
	const element = key => {
		if (!elements.has(key)) elements.set(key, {textContent: '', style: {}, clientWidth: 320, hidden: true});
		return elements.get(key);
	};
	let options; let requested; const calls = [];
	const context = {
		document: {getElementById: element}, location: {search, href: 'https://copa-rinha-client.onrender.com/replay.html' + search},
		URLSearchParams, AbortSignal, console, $: selector => selector,
		navigator: {clipboard: {async writeText(text) { calls.push(text); }}},
		window: {addEventListener() {}},
		async fetch(url, init) {
			requested = {url, init};
			if (fail) throw Error('network failure');
			return {ok: status === 200, status, async json() {
				return {id, format: 'gen9coparinhanationaldexza', players: [{name: '<Alice>'}, {name: 'Bob'}], winner: '<Alice>', turns: 7, endType: 'normal', createdAt: '2026-10-29T12:00:00Z', log: '|turn|7\n|win|Alice'};
			}};
		},
		Battle: class {
			constructor(opts) { options = opts; this.scene = {setMute() {}}; this.turn = 0; }
			play() { calls.push('play'); } pause() { calls.push('pause'); } seekTurn(turn) { calls.push(turn); }
		},
	};
	vm.runInNewContext(source.replace('void loadCopaReplay();', ''), context);
	await context.loadCopaReplay();
	return {element, options, requested, calls};
}
test('loads from our API into native Battle with controls, text-only metadata and mobile scaling', async () => {
	const {element, options, requested, calls} = await load();
	assert.equal(requested.url, `https://copa-rinha-showdown.onrender.com/copa-rinha/replays/${id}`);
	assert.equal(requested.init.credentials, 'omit');
	assert.equal(options.isReplay, true);
	assert.deepEqual(Array.from(options.log), ['|turn|7', '|win|Alice']);
	assert(element('metadata').textContent.includes('<Alice>'));
	assert.equal(element('arena').style.transform, 'scale(0.5)');
	assert.equal(element('controls').hidden, false);
	element('play').onclick(); element('pause').onclick(); element('next').onclick(); element('restart').onclick();
	await element('copy').onclick();
	assert.deepEqual(calls.slice(0, 5), ['play', 'pause', 1, 0, 'pause']);
	assert(calls[5].startsWith('https://copa-rinha-client.onrender.com/replay.html'));
});
test('rejects bad IDs before fetching', async () => {
	const result = await load({search: '?id=../bad'});
	assert.equal(result.requested, undefined);
	assert.equal(result.element('status').textContent, 'ID de replay inválido.');
});
test('shows missing and network/storage errors without constructing the player', async () => {
	for (const config of [{status: 404}, {status: 503}, {fail: true}]) {
		const result = await load(config);
		assert.equal(result.options, undefined);
		assert(result.element('status').textContent.includes(config.status === 404 ? 'não encontrado' : 'Não foi possível'));
	}
});
