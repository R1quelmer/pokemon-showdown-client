const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const {describe, it} = require('node:test');
const vm = require('vm');

const moves = {
	thunderbolt: {name: 'Thunderbolt', type: 'Electric'},
	gigavolthavoc: {name: 'Gigavolt Havoc', type: 'Electric', isZ: true},
	gmaxvoltcrash: {name: 'G-Max Volt Crash', type: 'Electric', isMax: true},
	maxlightning: {name: 'Max Lightning', type: 'Electric', isMax: true},
	sleeptalk: {name: 'Sleep Talk', type: 'Normal'},
	maxguard: {name: 'Max Guard', type: 'Normal', isMax: true},
};
function getMove(name) {
	const id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
	return {id, exists: !!moves[id], name, type: 'Normal', ...moves[id]};
}
const popups = [];
const context = vm.createContext({
	ConsoleRoom: {extend: data => data},
	Popup: {extend: data => data},
	jQuery: {isArray: Array.isArray},
	_: {map: (values, callback) => values.map(callback)},
	app: {addPopupMessage: message => popups.push(message)},
	Dex: {
		moves: {get: getMove},
		types: {get: name => ({name})},
		getTypeIcon: name => name,
	},
	BattleLog: {escapeHTML: value => String(value)},
	ModifiableValue: function () {},
});
const sourcePath = path.resolve(__dirname, '../play.pokemonshowdown.com/src/oldclient/client-battle.js');
vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, {filename: sourcePath});
const methods = context.BattleRoom;
const mechanicNames = ['megaevo', 'megaevox', 'megaevoy', 'ultraburst', 'zmove', 'dynamax', 'terastallize'];

function request(overrides = {}) {
	return {
		moves: [
			{move: 'thunderbolt', pp: 5, maxpp: 24, target: 'normal'},
			{move: 'sleeptalk', pp: 10, maxpp: 16, target: 'self'},
		],
		...overrides,
	};
}
function allOptions() {
	return request({
		canMegaEvo: true,
		canMegaEvoX: true,
		canMegaEvoY: true,
		canUltraBurst: true,
		canZMove: [{move: 'gigavolthavoc', target: 'normal'}, null],
		canDynamax: true,
		maxMoves: {gigantamax: 'G-Max Volt Crash', maxMoves: [
			{move: 'gmaxvoltcrash', target: 'normal'},
			{move: 'maxguard', target: 'self', disabled: true},
		]},
		canTerastallize: 'Water',
	});
}
function createRoom(active = allOptions(), count = 1) {
	popups.length = 0;
	const boxes = mechanicNames.map(name => ({name, checked: false}));
	const visibility = {};
	const pokemon = Array.from({length: count}, () => ({
		name: 'Pikachu', ident: 'p1: Pikachu', speciesForme: 'Pikachu', hp: 100, maxhp: 100,
	}));
	const room = Object.assign(Object.create(methods), {
		request: {rqid: 5, requestType: 'move', active: Array.from({length: count}, () => active), side: {pokemon}},
		choice: {choices: [], switchFlags: {}},
		battle: {
			mySide: {n: 0}, myPokemon: pokemon, pokemonControlled: count,
			nearSide: {active: pokemon}, farSide: {active: [{name: 'Blissey'}]}, gameType: 'singles',
			dex: {moves: {get: getMove}},
		},
		tooltips: {
			hideTooltip() {},
			getMoveTypeText: move => [move.type, ''],
			getMoveType: move => [move.type],
			getMaxMoveFromType: (type, gigantamax) => gigantamax || getMove('maxlightning'),
		},
		getTimerHTML: () => '',
		displayParty: () => '',
		updateControlsForPlayer() {},
		closeNotification() {},
		sent: [],
		send(message) { this.sent.push(message); },
		$controls: {html(value) { room.controlsHTML = value; }},
		$(selector) {
			const names = selector.match(/^input\[name=(\w+)\]$/);
			const selectedBoxes = selector === '.megaevo-box input' ? boxes : names ? boxes.filter(box => box.name === names[1]) : [];
			return Object.assign(selectedBoxes, {
				each(callback) { selectedBoxes.forEach(box => callback.call(box)); },
				hide() { selector.split(', ').forEach(value => { visibility[value] = false; }); },
				show() { visibility[selector] = true; },
			});
		},
	});
	return {room, boxes, visibility};
}
const moveButton = {getAttribute: () => 'normal'};

describe('legacy battle mechanic choices', () => {
	it('renders Mega, Dynamax and Tera together when all are offered', () => {
		const {room} = createRoom(request({canMegaEvo: true, canDynamax: true,
			maxMoves: {maxMoves: [{move: 'maxlightning', target: 'normal'}, null]}, canTerastallize: 'Water'}));
		room.updateMoveControls('move');
		for (const name of ['megaevo', 'dynamax', 'terastallize']) assert(room.controlsHTML.includes(`name="${name}"`));
		assert(!room.controlsHTML.includes('name="zmove"'));
	});

	it('renders both Z and G-Max menus with their own PP, disabled state, targets and tooltips', () => {
		const {room} = createRoom(allOptions());
		room.updateMoveControls('move');
		assert(room.controlsHTML.includes('movebuttons-base'));
		const zMenu = room.controlsHTML.split('class="movebuttons-z"')[1].split('</div>')[0];
		const maxMenu = room.controlsHTML.split('class="movebuttons-max"')[1].split('</div>')[0];
		assert(zMenu.includes('Gigavolt Havoc'));
		assert(zMenu.includes('1/1'));
		assert(zMenu.includes('data-tooltip="zmove|thunderbolt|0"'));
		assert(maxMenu.includes('G-Max Volt Crash'));
		assert(maxMenu.includes('5/24'));
		assert(maxMenu.includes('disabled="disabled"'));
		assert(maxMenu.includes('data-target="self"'));
		assert(maxMenu.includes('data-tooltip="maxmove|thunderbolt|0|gmaxvoltcrash"'));
		assert(room.controlsHTML.includes('name="dynamax" />&nbsp;Gigantamax'));
	});

	for (const selectedName of mechanicNames) {
		it(`selecting ${selectedName} clears every other mechanic without hiding its option`, () => {
			const {room, boxes, visibility} = createRoom();
			boxes.forEach(box => { box.checked = true; });
			const selected = boxes.find(box => box.name === selectedName);
			room.updateMechanic({currentTarget: selected});
			assert.deepEqual(boxes.filter(box => box.checked).map(box => box.name), [selectedName]);
			assert.equal(visibility['.movebuttons-z'], selectedName === 'zmove');
			assert.equal(visibility['.movebuttons-max'], selectedName === 'dynamax');
			assert.equal(visibility['.movebuttons-base'], !['zmove', 'dynamax'].includes(selectedName));
			assert.equal(boxes.length, mechanicNames.length);
		});
	}

	it('deselecting a mechanic restores ordinary moves', () => {
		const {room, boxes, visibility} = createRoom();
		const selected = boxes.find(box => box.name === 'zmove');
		selected.checked = true;
		room.updateMechanic({currentTarget: selected});
		selected.checked = false;
		room.updateMechanic({currentTarget: selected});
		assert.equal(visibility['.movebuttons-base'], true);
		assert.equal(visibility['.movebuttons-z'], false);
		assert.equal(visibility['.movebuttons-max'], false);
	});

	for (const [name, flag] of [['megaevo', 'mega'], ['zmove', 'zmove'], ['dynamax', 'dynamax'], ['terastallize', 'terastallize']]) {
		it(`serializes only the selected ${flag} mechanic`, () => {
			const {room, boxes} = createRoom();
			boxes.find(box => box.name === name).checked = true;
			room.chooseMove('1', moveButton);
			assert.deepEqual(room.sent, [`/choose move 1 ${flag}|5`]);
		});
	}

	it('blocks conflicting checkboxes and programmatic choices before anything is sent', () => {
		const {room, boxes} = createRoom();
		boxes.find(box => box.name === 'megaevo').checked = true;
		boxes.find(box => box.name === 'terastallize').checked = true;
		assert.equal(room.chooseMove('1', moveButton), false);
		assert.equal(room.choice.choices.length, 0);
		assert.equal(room.sendDecision(['move 1 zmove dynamax']), false);
		assert.equal(room.sendDecision('move 1 max tera'), false);
		assert.deepEqual(room.sent, []);
	});

	it('uses current request options instead of stale battle Pokemon flags', () => {
		const {room, boxes} = createRoom(request({canTerastallize: 'Water'}));
		room.battle.myPokemon = [{...room.battle.myPokemon[0], canMegaEvo: true, canDynamax: true}];
		room.updateMoveControls('move');
		assert(!room.controlsHTML.includes('name="megaevo"'));
		assert(!room.controlsHTML.includes('name="dynamax"'));
		boxes.find(box => box.name === 'megaevo').checked = true;
		assert.equal(room.chooseMove('1', moveButton), false);
		assert.deepEqual(room.sent, []);
	});

	it('honors explicit false in the active request over legacy side metadata', () => {
		const {room} = createRoom(request({canMegaEvo: false}));
		room.request.side.pokemon[0].canMegaEvo = true;
		room.updateMoveControls('move');
		assert(!room.controlsHTML.includes('name="megaevo"'));
	});

	it('continues showing Max Moves after activation without offering another Dynamax', () => {
		const options = allOptions();
		delete options.canDynamax;
		delete options.canZMove;
		delete options.canTerastallize;
		const {room} = createRoom(options);
		room.updateMoveControls('move');
		assert(room.controlsHTML.includes('class="movebuttons-base" style="display:none"'));
		assert(room.controlsHTML.includes('class="movebuttons-max">'));
		assert(!room.controlsHTML.includes('name="dynamax"'));
		room.chooseMove('1', moveButton);
		assert.deepEqual(room.sent, ['/choose move 1|5']);
	});

	it('reserves separate mechanic limits for different active Pokemon', () => {
		const {room} = createRoom(allOptions(), 2);
		room.choice.choices.push('move 1 mega');
		const options = room.getMoveRequestOptions(1);
		assert.equal(options.canMegaEvo, false);
		assert.equal(options.canMegaEvoX, false);
		assert(options.canZMove);
		assert(options.canDynamax);
		assert(options.canTerastallize);
		assert.equal(room.sendDecision(['move 1 mega', 'move 1 terastallize']), undefined);
		assert.deepEqual(room.sent, ['/choose move 1 mega,move 1 terastallize|5']);
		assert.equal(room.sendDecision(['move 1 mega', 'move 1 mega']), false);
	});

	it('preserves multiple Mega Evolutions in formats that explicitly allow them', () => {
		const {room} = createRoom(allOptions(), 2);
		room.battle.gameType = 'doubles';
		room.battle.format = {allowMultipleMegas: true};
		room.choice.choices.push('move 1 mega');
		const options = room.getMoveRequestOptions(1);
		assert.equal(options.canMegaEvo, true);
		assert.equal(options.canMegaEvoX, true);
		assert.equal(options.canMegaEvoY, true);
		assert.equal(room.sendDecision(['move 1 mega', 'move 1 mega']), undefined);
		assert.deepEqual(room.sent, ['/choose move 1 mega,move 1 mega|5']);
		assert.equal(room.sendDecision(['move 1 mega terastallize', 'move 1 mega']), false);
	});

	it('preserves the selected mechanic while choosing a doubles target', () => {
		const {room, boxes} = createRoom(allOptions(), 2);
		room.battle.gameType = 'doubles';
		boxes.find(box => box.name === 'zmove').checked = true;
		room.chooseMove('1', moveButton);
		assert.equal(room.choice.type, 'movetarget');
		room.chooseMoveTarget('1');
		assert.equal(room.choice.choices[0], 'move 1 zmove 1');
		assert.deepEqual(room.sent, []);
	});

	for (const [name, flag, field] of [
		['megaevo', 'mega', 'canMegaEvo'],
		['zmove', 'zmove', 'canZMove'],
		['dynamax', 'dynamax', 'canDynamax'],
		['terastallize', 'terastallize', 'canTerastallize'],
	]) {
		it(`keeps an official ${flag}-only request limited to that option`, () => {
			const offered = allOptions();
			const active = request({[field]: offered[field]});
			if (field === 'canDynamax') active.maxMoves = offered.maxMoves;
			const {room, boxes} = createRoom(active);
			room.updateMoveControls('move');
			const controls = room.controlsHTML.match(/type="checkbox" name="\w+"/g);
			assert.deepEqual(controls, [`type="checkbox" name="${name}"`]);
			boxes.find(box => box.name === name).checked = true;
			room.chooseMove('1', moveButton);
			assert.deepEqual(room.sent, [`/choose move 1 ${flag}|5`]);
		});
	}
});
