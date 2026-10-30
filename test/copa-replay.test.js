const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('play.pokemonshowdown.com/js/copa-replay.js', 'utf8');
const id = 'a'.repeat(32);
async function load({search = `?id=${id}`, status = 200, fail = false, endType = 'normal', clipboardFails = false} = {}) {
	const elements = new Map();
	const element = key => {
		if (!elements.has(key)) elements.set(key, {textContent: '', style: {}, clientWidth: 320, hidden: true, value: '', blur() {}, setAttribute(key, value) { this[key] = value; }});
		if (key === 'metadata' && !elements.get(key).composite) {
			Object.defineProperty(elements.get(key), 'textContent', {get() {
				return ['match-players', 'match-details', 'match-winner'].map(id => element(id).textContent).join(' ');
			}});
			elements.get(key).composite = true;
		}
		return elements.get(key);
	};
	let options; let requested; let battle; const calls = [];
	const timers = new Map(); let timerID = 0;
	const context = {
		document: {getElementById: element}, location: {search, href: 'https://copa-rinha-client.onrender.com/replay.html' + search},
		URLSearchParams, AbortSignal, console,
		setTimeout(fn, delay) { timers.set(++timerID, {fn, delay}); return timerID; },
		clearTimeout(id) { timers.delete(id); }, $: selector => selector,
		navigator: {clipboard: {async writeText(text) { if (clipboardFails) throw Error('denied'); calls.push(text); }}},
		window: {addEventListener() {}},
		async fetch(url, init) {
			requested = {url, init};
			if (fail) throw Error('network failure');
			return {ok: status === 200, status, async json() {
				return {id, format: 'gen9coparinhanationaldexza', players: [{name: '<Alice>'}, {name: 'Bob'}], winner: '<Alice>', turns: 7, endType, createdAt: '2026-10-29T12:00:00Z', log: '|turn|7\n|win|Alice'};
			}};
		},
		Battle: class {
			constructor(opts) {
				options = opts; battle = this;
				this.scene = {setMute() {}, updateAcceleration() { calls.push('acceleration'); }};
				this.turn = 0; this.paused = true; this.atQueueEnd = false; this.viewpointSwitched = false;
			}
			subscribe(listener) { this.listener = listener; }
			play() { this.paused = false; calls.push('play'); this.listener(); }
			pause() { this.paused = true; calls.push('pause'); this.listener(); }
			reset() { this.turn = 0; this.atQueueEnd = false; this.paused = true; calls.push('reset'); this.listener(); }
			seekBy(delta) { calls.push(['seekBy', delta]); this.turn = Math.max(0, this.turn + delta); this.listener(); }
			seekTurn(turn) {
				calls.push(['seekTurn', turn]); this.atQueueEnd = turn === Infinity;
				this.turn = turn === Infinity ? 7 : turn; this.listener();
			}
			switchViewpoint() { this.viewpointSwitched = !this.viewpointSwitched; calls.push('switchViewpoint'); this.listener(); }
		},
	};
	vm.runInNewContext(source.replace('void loadCopaReplay();', ''), context);
	await context.loadCopaReplay();
	return {element, options, requested, calls, battle, timers, context};
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
	assert.deepEqual(calls.slice(0, 4), ['play', 'pause', ['seekBy', 1], 'reset']);
	assert(calls[4].startsWith('https://copa-rinha-client.onrender.com/replay.html'));
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

test('switches native viewpoint twice, preserves metadata/log and keeps playback working', async () => {
	const {element, battle, calls, options} = await load();
	const metadata = element('metadata').textContent;
	const log = options.log.join('\n');
	assert.equal(`Perspectiva: ${element('perspective-name').textContent}`, 'Perspectiva: <Alice>');
	element('viewpoint').onclick();
	assert.equal(battle.viewpointSwitched, true);
	assert.equal(element('viewpoint')['aria-pressed'], 'true');
	assert.equal(`Perspectiva: ${element('perspective-name').textContent}`, 'Perspectiva: Bob');
	element('play').onclick(); assert.equal(battle.paused, false);
	element('pause').onclick(); assert.equal(battle.paused, true);
	element('next').onclick(); assert.equal(battle.turn, 1);
	element('previous').onclick(); assert.equal(battle.turn, 0);
	element('viewpoint').onclick(); assert.equal(battle.viewpointSwitched, false);
	assert.equal(`Perspectiva: ${element('perspective-name').textContent}`, 'Perspectiva: <Alice>');
	assert.equal(calls.filter(call => call === 'switchViewpoint').length, 2);
	assert.equal(element('metadata').textContent, metadata);
	assert.equal(options.log.join('\n'), log);
});
test('navigates turns, resets and replays from end with controls synchronized to native state', async () => {
	const {element, battle, calls} = await load();
	assert.equal(element('previous').disabled, true);
	element('play').onclick(); assert.equal(element('play').hidden, true);
	element('pause').onclick(); assert.equal(element('pause').hidden, true);
	element('turn').value = '4';
	element('turn-form').onsubmit({preventDefault() {}});
	assert.equal(battle.turn, 4); assert.equal(element('previous').disabled, false);
	element('previous').onclick(); assert.equal(battle.turn, 3);
	element('end').onclick(); assert.equal(battle.atQueueEnd, true);
	assert.equal(element('next').disabled, true);
	assert.equal(element('play').textContent, 'Reproduzir novamente');
	element('play').onclick(); assert.equal(battle.atQueueEnd, false); assert.equal(battle.paused, false);
	element('restart').onclick(); assert.equal(battle.turn, 0); assert.equal(battle.paused, true);
	for (const value of ['', '-1', '1.5', 'NaN', 'Infinity']) {
		element('turn').value = value;
		const count = calls.length;
		element('turn-form').onsubmit({preventDefault() {}});
		assert.equal(calls.length, count);
	}
});
test('uses every official speed timing and updates native scene acceleration', async () => {
	const {element, battle, calls} = await load();
	for (const [value, fade, shown] of [
		['hyperfast', 40, 1], ['fast', 50, 1], ['normal', 300, 1], ['slow', 500, 1000], ['reallyslow', 1000, 3000],
	]) {
		element('speed').onchange({target: {value}});
		assert.equal(battle.messageFadeTime, fade); assert.equal(battle.messageShownTime, shown);
	}
	assert.equal(calls.filter(call => call === 'acceleration').length, 5);
});
test('forfeit replay preserves all metadata, log, perspective and controls', async () => {
	const {element, options, battle} = await load({endType: 'forfeit'});
	for (const text of ['<Alice> × Bob', 'Copa Rinha II', '29/10/2026', 'Vencedor: <Alice>', '7 turnos', 'Forfeit']) {
		assert(element('metadata').textContent.includes(text));
	}
	element('viewpoint').onclick(); element('end').onclick();
	assert(battle.atQueueEnd); assert.equal(options.log[1], '|win|Alice');
});
test('copy link reports clipboard failures with a usable URL', async () => {
	const {element} = await load({clipboardFails: true});
	await element('copy').onclick();
	assert(element('copy-feedback').textContent.startsWith('Copie o endereço: https://copa-rinha-client.onrender.com/replay.html?id='));
});

test('counter follows actual Battle.turn across seek, navigation, pause, end, reset and viewpoint', async () => {
	const {element, battle} = await load();
	for (const turn of [-1, 0, 1, 7]) {
		battle.turn = turn; battle.listener();
		assert.equal(element('turn').value, String(Math.max(0, turn)));
	}
	element('previous').onclick(); assert.equal(element('turn').value, '6');
	element('play').onclick(); element('pause').onclick(); assert.equal(element('turn').value, '6');
	element('end').onclick(); assert.equal(element('turn').value, '7');
	element('viewpoint').onclick(); assert.equal(element('turn').value, '7');
	element('restart').onclick(); assert.equal(element('turn').value, '0');
});
test('counter does not overwrite a seek destination being edited', async () => {
	const {element, battle, context} = await load();
	context.document.activeElement = element('turn');
	element('turn').value = '5'; battle.turn = 2; battle.listener();
	assert.equal(element('turn').value, '5');
	context.document.activeElement = null; battle.listener();
	assert.equal(element('turn').value, '2');
});
test('copy toast expires after two seconds and repeated copies reset its timer', async () => {
	const {element, timers} = await load();
	await element('copy').onclick();
	assert.equal(element('copy-feedback').textContent, 'Link copiado');
	assert.equal(element('copy-feedback').hidden, false);
	await element('copy').onclick(); assert.equal(timers.size, 1);
	const timer = [...timers.values()][0]; assert.equal(timer.delay, 2000);
	timer.fn(); assert.equal(element('copy-feedback').hidden, true);
	assert.equal(element('status').textContent, 'Replay carregado.');
});
