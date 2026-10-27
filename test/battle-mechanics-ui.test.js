const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {describe, it} = require('node:test');
const preact = require('preact');

global.window = global;
require('../play.pokemonshowdown.com/js/battle-dex-data.js');
require('../play.pokemonshowdown.com/js/battle-dex.js');

const context = vm.createContext({
	preact,
	Dex: global.Dex,
	PS: {addRoomType() {}},
	PSRoom: function () {},
	ChatRoom: function () {},
	PSRoomPanel: function (props) { this.props = props; },
	PSIcon: () => preact.h('span'),
	TL: Object.assign((strings, ...values) => {
		if (typeof strings === 'string') return strings;
		return strings.reduce((text, part, index) => text + part + (values[index] ?? ''), '');
	}, {tag: {gigantamax: 'Gigantamax'}}),
});
function load(filename, expression) {
	const fullPath = path.resolve(__dirname, '../play.pokemonshowdown.com/js', filename);
	return vm.runInContext(`${fs.readFileSync(fullPath, 'utf8')}\n${expression};`, context, {filename: fullPath});
}
const BattleChoiceBuilder = load('battle-choices.js', 'BattleChoiceBuilder');
const BattlePanel = load('panel-battle.js', 'BattlePanel');

function controls(options) {
	const room = {
		battle: {format: {}},
		update() {},
		choices: new BattleChoiceBuilder({
			requestType: 'move', rqid: 1,
			side: {id: 'p1', name: 'Player', pokemon: [{ident: 'p1: Test', speciesForme: 'Test'}]},
			active: [{
				moves: [{id: 'tackle', name: 'Tackle', pp: 16, maxpp: 16, target: 'normal'}],
				...options,
			}],
		}),
	};
	const panel = new BattlePanel({room});
	// This suite exercises actual mechanic controls; move-list behavior is tested
	// by BattleChoiceBuilder and the browser checks, without a simulated battle scene.
	panel.renderMoveControls = () => null;
	function inputs() {
		const found = [];
		function walk(node) {
			if (!node || typeof node !== 'object') return;
			if (Array.isArray(node)) return node.forEach(walk);
			if (node.type === 'input') found.push(node.props);
			walk(node.props?.children);
		}
		walk(panel.renderMoveMenu(room.choices));
		return found;
	}
	return {room, panel, inputs};
}
const max = {maxMoves: [{id: 'maxstrike', name: 'Max Strike', target: 'normal'}]};
const z = [{id: 'breakneckblitz', name: 'Breakneck Blitz', target: 'normal'}];

describe('Modern battle mechanic controls', () => {
	it('renders Mega, Dynamax and Tera together for a Venusaur-style request', () => {
		const {inputs} = controls({canMegaEvo: true, canDynamax: true, maxMoves: max, canTerastallize: 'Water'});
		assert.deepEqual(inputs().map(input => input.name).sort(), ['max', 'mega', 'tera']);
	});

	it('renders Z, G-Max and Tera together for a Pikachu-style request', () => {
		const {inputs} = controls({zMoves: z, canDynamax: true, maxMoves: max, gigantamax: 'G-Max Volt Crash', canTerastallize: 'Water'});
		assert.deepEqual(inputs().map(input => input.name).sort(), ['max', 'tera', 'z']);
	});

	for (const name of ['mega', 'z', 'max', 'tera']) {
		it(`selecting ${name} clears other checkboxes while all available controls remain visible`, () => {
			const {panel, room, inputs} = controls({
				canMegaEvo: true, zMoves: z, canDynamax: true, maxMoves: max, canTerastallize: 'Water',
			});
			for (const previous of ['mega', 'z', 'max', 'tera']) {
				panel.toggleBoostedMove({currentTarget: {name: previous, checked: true}});
				panel.toggleBoostedMove({currentTarget: {name, checked: true}});
				assert.deepEqual(inputs().map(input => input.name).sort(), ['max', 'mega', 'tera', 'z']);
				assert.deepEqual(inputs().filter(input => input.checked).map(input => input.name), [name]);
				assert.equal(room.choices.alreadyMega || room.choices.alreadyZ || room.choices.alreadyMax || room.choices.alreadyTera, false);
			}
			panel.toggleBoostedMove({currentTarget: {name, checked: false}});
			assert.equal(inputs().filter(input => input.checked).length, 0);
		});
	}

	for (const [name, options] of [
		['mega', {canMegaEvo: true}], ['z', {zMoves: z}],
		['max', {canDynamax: true, maxMoves: max}], ['tera', {canTerastallize: 'Water'}],
	]) {
		it(`shows only ${name} when it is the only mechanic offered by an official-format request`, () => {
			const {inputs} = controls(options);
			assert.deepEqual(inputs().map(input => input.name), [name]);
		});
	}

	it('shows no mechanic controls when the latest request offers none', () => {
		assert.equal(controls({}).inputs().length, 0);
	});
});
