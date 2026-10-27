const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const {describe, it} = require('node:test');
const vm = require('vm');

global.window = global;
require('../play.pokemonshowdown.com/js/battle-dex-data.js');
require('../play.pokemonshowdown.com/js/battle-dex.js');

const battleChoicesPath = path.resolve(__dirname, '../play.pokemonshowdown.com/js/battle-choices.js');
const BattleChoiceBuilder = vm.runInThisContext(
	`${fs.readFileSync(battleChoicesPath, 'utf8')}\nBattleChoiceBuilder;`,
	{filename: battleChoicesPath}
);

function pokemon(name, options = {}) {
	return {
		name,
		ident: `p1: ${name}`,
		speciesForme: name,
		fainted: false,
		...options,
	};
}

function switchRequest(pokemonList, forceSwitch) {
	return {
		requestType: 'switch',
		rqid: 1,
		side: {
			name: 'Player',
			id: 'p1',
			pokemon: pokemonList,
		},
		forceSwitch,
	};
}

function move(name, options = {}) {
	return {
		name,
		id: name.toLowerCase().replace(/[^a-z0-9]+/g, ''),
		pp: 16,
		maxpp: 16,
		target: 'normal',
		...options,
	};
}

function moveRequest(pokemonList, active) {
	return {
		requestType: 'move',
		rqid: 1,
		side: {
			name: 'Player',
			id: 'p1',
			pokemon: pokemonList,
		},
		active,
	};
}

function teamRequest(pokemonList, chosenTeamSize) {
	return {
		requestType: 'team',
		rqid: 1,
		side: {
			name: 'Player',
			id: 'p1',
			pokemon: pokemonList,
		},
		chosenTeamSize,
	};
}

describe('BattleChoiceBuilder', () => {
	it('should offer fainted Pokémon when an active Pokémon is reviving', () => {
		const request = switchRequest([
			pokemon('Pawmot', {reviving: true}),
			pokemon('Pikachu', {fainted: true}),
			pokemon('Raichu', {fainted: true}),
		], [true]);
		const choices = new BattleChoiceBuilder(request);

		assert.equal(choices.isDone(), false);
		assert.equal(choices.addChoice('switch 2'), null);
		assert.equal(choices.toString(), 'switch 2');
		assert.equal(choices.isDone(), true);
	});

	it('should allow reviving a fainted Pokémon in an active slot', () => {
		const request = switchRequest([
			pokemon('Pawmot', {reviving: true}),
			pokemon('Pikachu', {fainted: true}),
			pokemon('Raichu', {fainted: true}),
		], [true, true]);
		const choices = new BattleChoiceBuilder(request);

		assert.equal(choices.addChoice('switch 2'), null);
		assert.equal(choices.toString(), 'switch 2, pass');
		assert.equal(choices.isDone(), true);
	});

	it('should apply reviving rules only to the active slot making a choice', () => {
		const request = switchRequest([
			pokemon('Pawmot', {reviving: true}),
			pokemon('Pikachu', {fainted: true}),
			pokemon('Raichu'),
			pokemon('Plusle', {fainted: true}),
		], [true, true]);
		const choices = new BattleChoiceBuilder(request);

		assert.equal(choices.addChoice('switch 3'), 'Raichu still has energy to battle!');
		assert.equal(choices.addChoice('switch 4'), null);
		assert.equal(choices.addChoice('switch 3'), null);
		assert.equal(choices.toString(), 'switch 4, switch 3');
		assert.equal(choices.isDone(), true);
	});

	describe('addChoices', () => {
		it('should deserialize comma-separated choices', () => {
			const request = moveRequest([
				pokemon('Charizard'),
				pokemon('Blastoise'),
				pokemon('Venusaur'),
			], [
				{moves: [move('Flamethrower')], canMegaEvo: true},
				{moves: [move('Hydro Pump')]},
			]);
			const choices = new BattleChoiceBuilder(request);

			assert.equal(choices.addChoices('move Flamethrower mega +1, switch Venusaur'), null);
			assert.deepEqual(choices.choices, ['move 1 mega +1', 'switch 3']);
			assert.equal(choices.toString(), 'move 1 mega +1, switch 3');
			assert.equal(choices.isDone(), true);
			assert.equal(choices.alreadyMega, true);
			assert.deepEqual(choices.alreadySwitchingIn, [3]);
		});

		it('should deserialize and complete compact team choices', () => {
			const request = teamRequest([
				pokemon('Pikachu'),
				pokemon('Raichu'),
				pokemon('Plusle'),
				pokemon('Minun'),
				pokemon('Pachirisu'),
				pokemon('Emolga'),
			], 4);
			const choices = new BattleChoiceBuilder(request);

			assert.equal(choices.addChoices('team 31'), null);
			assert.deepEqual(choices.choices, ['team 3', 'team 1', 'team 2', 'team 4']);
			assert.equal(choices.toString(), 'team 3, 1, 2, 4');
			assert.equal(choices.isDone(), true);
		});

		it('should deserialize and complete bracketed team choices', () => {
			const request = teamRequest([
				pokemon('Pikachu'),
				pokemon('Raichu'),
				pokemon('Plusle'),
				pokemon('Minun'),
				pokemon('Pachirisu'),
				pokemon('Emolga'),
			], 4);
			const choices = new BattleChoiceBuilder(request);

			assert.equal(choices.addChoices('team [3, 1]'), null);
			assert.deepEqual(choices.choices, ['team 3', 'team 1', 'team 2', 'team 4']);
			assert.equal(choices.toString(), 'team 3, 1, 2, 4');
			assert.equal(choices.isDone(), true);
		});

		it('should deserialize a named team choice', () => {
			const request = teamRequest([
				pokemon('Pikachu'),
				pokemon('Raichu'),
				pokemon('Plusle'),
				pokemon('Minun'),
			], 3);
			const choices = new BattleChoiceBuilder(request);

			assert.equal(choices.addChoices('team Plusle, Raichu'), null);
			assert.deepEqual(choices.choices, ['team 3', 'team 2', 'team 1']);
			assert.equal(choices.toString(), 'team 3, 2, 1');
			assert.equal(choices.isDone(), true);
		});

		it('should truncate a full team order to the requested team size', () => {
			const request = teamRequest([
				pokemon('Pikachu'),
				pokemon('Raichu'),
				pokemon('Plusle'),
				pokemon('Minun'),
				pokemon('Pachirisu'),
				pokemon('Emolga'),
			], 3);
			const choices = new BattleChoiceBuilder(request);

			assert.equal(choices.addChoices('team 654321'), null);
			assert.deepEqual(choices.choices, ['team 6', 'team 5', 'team 4']);
			assert.equal(choices.isDone(), true);
		});

		it('should support a multi-digit lead in Team Preview', () => {
			const pokemonList = Array.from({length: 24}, (_, i) => pokemon(`Pokémon ${i + 1}`));
			const request = teamRequest(pokemonList, 1);
			const choices = new BattleChoiceBuilder(request);

			assert.equal(choices.addChoices('team 12'), null);
			assert.deepEqual(choices.choices, ['team 12']);
			assert.equal(choices.toString(), 'team 12');
			assert.equal(choices.isDone(), true);
		});

		it('should serialize automatic choices', () => {
			for (const automaticChoice of ['auto', 'default']) {
				const choices = new BattleChoiceBuilder(switchRequest([
					pokemon('Pikachu'),
					pokemon('Raichu'),
				], [true]));

				assert.equal(choices.addChoices(automaticChoice), null);
				assert.equal(choices.serializedChoice, 'default');
				assert.equal(choices.toString(), 'default');
				assert.equal(choices.isDone(), true);
				assert.equal(choices.isEmpty(), false);
				assert.match(choices.addChoice('switch 2'), /already chosen/);
			}
		});

		it('should serialize an automatic choice after explicit choices', () => {
			const request = moveRequest([
				pokemon('Charizard'),
				pokemon('Blastoise'),
			], [
				{moves: [move('Flamethrower')]},
				{moves: [move('Hydro Pump')]},
			]);
			const choices = new BattleChoiceBuilder(request);

			assert.equal(choices.addChoices('move 1, default'), null);
			assert.deepEqual(choices.choices, ['move 1']);
			assert.equal(choices.serializedChoice, 'move 1, default');
			assert.equal(choices.toString(), 'move 1, default');
			assert.equal(choices.isDone(), true);
		});

		it('should remain incomplete after a partial serialized choice', () => {
			const request = moveRequest([
				pokemon('Charizard'),
				pokemon('Blastoise'),
			], [
				{moves: [move('Flamethrower')]},
				{moves: [move('Hydro Pump')]},
			]);
			const choices = new BattleChoiceBuilder(request);

			assert.equal(choices.addChoices('move 1'), null);
			assert.equal(choices.toString(), 'move 1');
			assert.equal(choices.isDone(), false);
		});
	});

	describe('special mechanics', () => {
		const specials = ['mega', 'megax', 'megay', 'ultra', 'z', 'max', 'tera'];
		const flags = {mega: 'mega', z: 'zmove', max: 'max', tera: 'terastallize'};
		function active(options = {}) {
			return {
				moves: [move('Thunderbolt'), move('Protect')],
				canMegaEvo: true,
				canMegaEvoX: true,
				canMegaEvoY: true,
				canUltraBurst: true,
				zMoves: [move('Gigavolt Havoc'), move('Z-Protect')],
				canDynamax: true,
				maxMoves: [move('G-Max Volt Crash'), move('Max Guard')],
				gigantamax: 'G-Max Volt Crash',
				canTerastallize: 'Water',
				...options,
			};
		}
		function builder(options = {}) {
			return new BattleChoiceBuilder(moveRequest([pokemon('Pikachu')], [active(options)]));
		}

		it('preserves all simultaneous server options when normalizing a request', () => {
			const request = moveRequest([pokemon('Pikachu')], [{
				moves: [{move: 'Thunderbolt', pp: 16, maxpp: 16, target: 'normal'}],
				canMegaEvo: true,
				canZMove: [{move: 'Gigavolt Havoc', target: 'normal'}],
				canDynamax: true,
				maxMoves: {gigantamax: 'G-Max Volt Crash', maxMoves: [{move: 'G-Max Volt Crash', target: 'normal'}]},
				canTerastallize: 'Water',
			}]);
			BattleChoiceBuilder.fixRequest(request, {
				mySide: {active: [{}]},
				gameType: 'singles',
				parseDetails() {},
				parseHealth() {},
			});
			const options = request.active[0];
			assert.equal(options.canMegaEvo, true);
			assert.equal(options.zMoves[0].id, 'gigavolthavoc');
			assert.equal(options.canDynamax, true);
			assert.equal(options.maxMoves[0].id, 'gmaxvoltcrash');
			assert.equal(options.gigantamax, 'G-Max Volt Crash');
			assert.equal(options.canTerastallize, 'Water');
		});

		for (const selected of Object.keys(flags)) {
			it(`selecting ${selected} clears every other mechanic without hiding server options`, () => {
				const choices = builder();
				const originalRequest = JSON.stringify(choices.request);
				for (const previous of specials) {
					choices.selectMoveSpecial(previous);
					choices.selectMoveSpecial(selected);
					for (const special of specials) assert.equal(choices.current[special], special === selected);
					assert.equal(choices.moveSpecial(choices.current), ` ${flags[selected]}`);
				}
				assert.equal(JSON.stringify(choices.request), originalRequest);
				assert.equal(choices.alreadyMega || choices.alreadyZ || choices.alreadyMax || choices.alreadyTera, false);
			});
		}

		it('deselecting a mechanic restores normal moves without consuming any allowance', () => {
			const choices = builder();
			choices.selectMoveSpecial('z');
			assert.equal(choices.currentMoveList()[0].name, 'Gigavolt Havoc');
			choices.selectMoveSpecial('z', false);
			assert.equal(specials.some(special => choices.current[special]), false);
			assert.equal(choices.currentMoveList()[0].name, 'Thunderbolt');
			assert.equal(choices.alreadyZ, false);
		});

		it('switches correctly between the Z and Gigantamax move lists', () => {
			const choices = builder({canMegaEvo: undefined});
			choices.selectMoveSpecial('z');
			assert.equal(choices.currentMoveList()[0].name, 'Gigavolt Havoc');
			choices.selectMoveSpecial('max');
			assert.equal(choices.current.z, false);
			assert.equal(choices.currentMoveList()[0].name, 'G-Max Volt Crash');
			choices.selectMoveSpecial('tera');
			assert.equal(choices.current.max, false);
			assert.equal(choices.currentMoveList()[0].name, 'Thunderbolt');
		});

		it('rejects every pair of mechanic flags, including Mega variants and Ultra Burst', () => {
			const choices = builder();
			const commandFlags = {mega: 'mega', megax: 'megax', megay: 'megay', ultra: 'ultra', ...flags};
			for (let i = 0; i < specials.length; i++) {
				for (let j = i + 1; j < specials.length; j++) {
					assert.match(choices.addChoice(`move 1 ${commandFlags[specials[i]]} ${commandFlags[specials[j]]}`), /Only one/);
				}
			}
			assert.equal(choices.toString(), '');
		});

		it('rejects conflicts when a Z or Max flag is inferred from the move name', () => {
			const choices = builder();
			for (const command of [
				'move Gigavolt Havoc dynamax', 'move Gigavolt Havoc mega',
				'move G-Max Volt Crash zmove', 'move G-Max Volt Crash terastallize',
			]) assert.match(choices.addChoice(command), /Only one/);
		});

		it('refuses to serialize a programmatically constructed conflicting choice', () => {
			const choices = builder();
			choices.current.move = 1;
			choices.current.mega = true;
			choices.current.tera = true;
			assert.throws(() => choices.moveSpecial(choices.current), /Only one/);
			assert.throws(() => choices.stringChoice(choices.current), /Only one/);
			assert.throws(() => choices.toString(), /Only one/);
		});

		it('does not select or serialize mechanics absent from the current request', () => {
			const choices = new BattleChoiceBuilder(moveRequest([pokemon('Pikachu')], [{moves: [move('Thunderbolt')]}]));
			for (const special of specials) {
				const flag = special === 'z' ? 'zmove' : special === 'tera' ? 'terastallize' : special;
				assert.throws(() => choices.selectMoveSpecial(special), /not available/);
				assert.match(choices.addChoice(`move 1 ${flag}`), /not available/);
				assert.throws(() => choices.stringChoice({...choices.current, move: 1, [special]: true}), /not available/);
			}
			assert.equal(choices.addChoice('move 1'), null);
			assert.equal(choices.toString(), 'move 1');
		});

		it('allows a Z-Move only for a move slot that offers one', () => {
			const choices = builder({zMoves: [null, move('Z-Protect')]});
			assert.match(choices.addChoice('move 1 zmove'), /not available/);
			assert.equal(choices.addChoice('move 2 zmove'), null);
			assert.equal(choices.toString(), 'move 2 zmove');
		});

		for (const [special, flag] of Object.entries(flags)) {
			it(`preserves ordinary formats offering only ${special}`, () => {
				const options = active({
					canMegaEvo: undefined, canMegaEvoX: undefined, canMegaEvoY: undefined,
					canUltraBurst: undefined, canTerastallize: undefined, canDynamax: undefined,
					maxMoves: undefined, zMoves: undefined,
				});
				const source = active();
				if (special === 'mega') options.canMegaEvo = true;
				if (special === 'tera') options.canTerastallize = 'Water';
				if (special === 'z') options.zMoves = source.zMoves;
				if (special === 'max') {
					options.canDynamax = true;
					options.maxMoves = source.maxMoves;
				}
				const choices = new BattleChoiceBuilder(moveRequest([pokemon('Pikachu')], [options]));
				choices.selectMoveSpecial(special);
				assert.equal(choices.addChoice(`move 1 ${flag}`), null);
				assert.equal(choices.toString(), `move 1 ${flag}`);
			});
		}

		it('keeps Mega X and Y mutually exclusive and serializes the chosen forme', () => {
			const choices = builder();
			choices.selectMoveSpecial('megax');
			choices.selectMoveSpecial('megay');
			assert.equal(choices.current.megax, false);
			assert.equal(choices.current.megay, true);
			assert.equal(choices.addChoice('move 1 megay'), null);
			assert.equal(choices.toString(), 'move 1 megay');
		});

		it('continues Max Moves without serializing a second Dynamax activation', () => {
			const choices = builder({canDynamax: undefined});
			assert.equal(choices.currentMoveList()[0].name, 'G-Max Volt Crash');
			assert.equal(choices.addChoice('move G-Max Volt Crash'), null);
			assert.equal(choices.toString(), 'move 1');
			const conflict = builder({canDynamax: undefined});
			assert.match(conflict.addChoice('move G-Max Volt Crash terastallize'), /Only one/);
		});

		it('validates disabled status against the selected Z or Max move list', () => {
			for (const flag of ['zmove', 'max']) {
				const choices = builder({moves: [move('Thunderbolt', {disabled: true})]});
				assert.equal(choices.addChoice(`move Thunderbolt ${flag}`), null);
				assert.equal(choices.toString(), `move 1 ${flag}`);
			}
		});

		it('preserves a selected mechanic through target selection and undo', () => {
			const request = moveRequest([pokemon('Venusaur'), pokemon('Pikachu')], [active(), active()]);
			request.targetable = true;
			const choices = new BattleChoiceBuilder(request);
			assert.equal(choices.addChoice('move 1 mega +1'), null);
			assert.equal(choices.addChoice('move 1 zmove +2'), null);
			const previous = choices.previous();
			assert.equal(previous.current.move, 1);
			assert.equal(previous.current.z, true);
			assert.equal(previous.current.targetLoc, 0);
			assert.equal(previous.alreadyMega, true);
			assert.equal(previous.alreadyZ, false);
			previous.selectMoveSpecial('tera');
			assert.equal(previous.current.z, false);
			assert.equal(previous.addChoice('move 1 terastallize +1'), null);
			assert.equal(previous.toString(), 'move 1 mega +1, move 1 terastallize +1');
		});

		it('keeps separate per-mechanic choices for different active Pokémon', () => {
			const choices = new BattleChoiceBuilder(moveRequest(
				['Venusaur', 'Lucario', 'Pikachu', 'Garchomp'].map(name => pokemon(name)),
				Array.from({length: 4}, () => active())
			));
			assert.equal(choices.addChoices('move 1 mega, move 1 zmove, move 1 max, move 1 terastallize'), null);
			assert.equal(choices.alreadyMega && choices.alreadyZ && choices.alreadyMax && choices.alreadyTera, true);
			assert.equal(choices.toString(), 'move 1 mega, move 1 zmove, move 1 max, move 1 terastallize');
		});

		it('does not restore options that the next server request has removed', () => {
			const original = builder();
			original.selectMoveSpecial('mega');
			const next = new BattleChoiceBuilder(moveRequest([pokemon('Pikachu')], [{moves: [move('Thunderbolt')]}]));
			assert.equal(specials.some(special => next.current[special]), false);
			assert.throws(() => next.selectMoveSpecial('tera'), /not available/);
		});
	});
});
