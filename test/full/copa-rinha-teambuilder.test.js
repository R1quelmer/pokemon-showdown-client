const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {describe, it} = require('node:test');
const {parseSync} = require('@babel/core');

const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const canonical = 'gen9coparinhanationaldexza';
const oldFormats = ['coparinhanationaldexza', 'gen6coparinhanationaldexza'];
global.window = global;
for (const file of ['pokedex', 'moves', 'items', 'abilities', 'teambuilder-tables', 'search-index', 'aliases']) {
	Object.assign(global, require(path.join(root, 'data', `${file}.js`)));
}
Object.assign(global, require(path.join(root, 'data/text/en.js')));
require(path.join(root, 'js/battle-dex-data.js'));
require(path.join(root, 'js/battle-dex.js'));
function load(file, name) {
	return vm.runInThisContext(`${fs.readFileSync(path.join(root, 'js', file), 'utf8')}\n${name};`);
}
global.Teams = load('battle-teams.js', 'Teams');
global.DexSearch = load('battle-dex-search.js', 'DexSearch');
global.PSModel = global.PSStreamModel = function () {};
PSModel.prototype.update = function () {};
function declaration(file, name) {
	const source = fs.readFileSync(path.join(root, 'js', file), 'utf8');
	const node = parseSync(source).program.body.find(statement => statement.type === 'VariableDeclaration' &&
		statement.declarations.some(item => item.id.name === name));
	assert.ok(node, `${name} declaration exists`);
	return vm.runInThisContext(`${source.slice(node.start, node.end)}\n${name};`);
}
const PSTeams = declaration('client-main.js', 'PSTeams');
const TeamEditorState = declaration('battle-team-editor.js', 'TeamEditorState');
const PSTeambuilder = declaration('panel-teamdropdown.js', 'PSTeambuilder');
global.PSRoomPanel = function () {};
const TeambuilderPanel = declaration('panel-teambuilder.js', 'TeambuilderPanel');
global.preact = require('preact');
global.PSIcon = () => null;
const DetailsForm = declaration('battle-team-editor.js', 'DetailsForm');
const species = ['Lucario', 'Greninja', 'Venusaur', 'Pikachu', 'Dragapult', 'Miraidon'];
function storage(buffer = null) {
	let value = buffer;
	global.localStorage = {
		getItem(key) { assert.equal(key, 'showdown_teams'); return value; },
		setItem(key, text) { assert.equal(key, 'showdown_teams'); value = text; },
	};
	return () => value;
}
function search(type, value, set = '') {
	const search = new DexSearch(type, canonical, set);
	search.find(value);
	return search;
}
function legacyStorage() {
	const source = fs.readFileSync(path.join(root, 'src/oldclient/storage.js'), 'utf8');
	const methods = ['loadTeams', 'loadPackedTeams', 'unpackAllTeams', 'unpackLine'];
	const code = parseSync(source).program.body.filter(statement => {
		const expression = statement.expression;
		return expression?.type === 'AssignmentExpression' && expression.left.object?.name === 'Storage' &&
			methods.includes(expression.left.property.name);
	}).map(statement => source.slice(statement.start, statement.end)).join('\n');
	const Storage = {packTeam: Teams.pack};
	vm.runInNewContext(code, {Storage, Dex, localStorage, window: {localStorage}, $: {trim: text => text.trim()}});
	return Storage;
}

describe('Copa Rinha Gen 9 teams', () => {
	for (const format of oldFormats) {
		it(`migrates ${format} at load and persists only the format prefix`, () => {
			const original = `42[${format}-box]Minha pasta/Time da Copa|Pikachu|||Static|volttackle\n` +
				'gen6ou]Outro time|Greninja|||Protean|surf\nUnparseable preserved line';
			const saved = storage(original);
			const teams = new PSTeams();
			const team = teams.list[0];
			assert.equal(team.format, canonical);
			assert.equal(team.teamid, 42);
			assert.equal(team.isBox, true);
			assert.equal(team.folder, 'Minha pasta');
			assert.equal(team.name, 'Time da Copa');
			assert.equal(team.packedTeam, 'Pikachu|||Static|volttackle');
			assert.equal(teams.list[1].format, 'gen6ou');
			assert.equal(saved(), original.replace(`${format}-box]`, `${canonical}-box]`));
			assert.equal(Dex.migrateTeamFormats(saved()), saved(), 'migration is idempotent');
			assert.equal(new PSTeams().list[0].format, canonical);
			assert.equal(teams.teambuilderFormat(format), canonical);
		});
	}
	it('keeps the legacy Gen 6 fallback for other formats and leaves payloads untouched', () => {
		storage();
		const teams = new PSTeams();
		assert.equal(teams.unpackLine('ou]Old OU|Lucario').format, 'gen6ou');
		const text = 'gen9ou]coparinhanationaldexza|gen6coparinhanationaldexza';
		assert.equal(Dex.migrateTeamFormats(text), text);
	});
	it('imports readable Copa Rinha backups using either former ID', () => {
		for (const format of oldFormats) {
			const [team] = PSTeambuilder.importTeamBackup(`=== [${format}] Test ===\n\nLucario\n- Aura Sphere\n`);
			assert.equal(team.format, canonical);
			assert.equal(Teams.unpack(team.packedTeam)[0].species, 'Lucario');
		}
	});
	it('migrates and persists teams opened by the legacy client too', () => {
		for (const format of oldFormats) {
			const original = `7[${format}]Pasta/Copa|Lucario|||Inner Focus|aurasphere`;
			const saved = storage(original);
			const Storage = legacyStorage();
			Storage.loadTeams();
			assert.equal(Storage.teams[0].format, canonical);
			assert.equal(Storage.teams[0].gen, 9);
			assert.equal(Storage.teams[0].teamid, 7);
			assert.equal(Storage.teams[0].folder, 'Pasta');
			assert.equal(saved(), original.replace(format, canonical));
		}
	});
	it('imports a dragged team file without restoring the former Gen 6 ID', async () => {
		for (const format of oldFormats) {
			const team = await TeambuilderPanel.extractDraggedTeam({dataTransfer: {files: [{
				name: `[${format}-box] Copa.txt`, text: () => Promise.resolve('Lucario\n- Aura Sphere\n'),
			}]}});
			assert.equal(team.format, canonical);
			assert.equal(team.isBox, true);
			assert.equal(Teams.unpack(team.packedTeam)[0].species, 'Lucario');
		}
	});
	it('creates, edits, saves and reloads a six-Pokemon Gen 9 National Dex team', () => {
		const saved = storage();
		const teams = new PSTeams();
		const team = {name: 'Copa', format: canonical, packedTeam: '', folder: '', key: '', iconCache: null, isBox: false};
		teams.push(team);
		const editor = new TeamEditorState(team);
		assert.equal(editor.gen, 9);
		assert.equal(editor.dex.gen, 9);
		assert.equal(editor.format.isNatDex, true);
		assert.equal(editor.format.id, canonical);
		for (const name of species) {
			const set = {species: '', moves: ['Sleep Talk']};
			editor.changeSpecies(set, name);
			assert.equal(set.species, name);
			set.ability = editor.normalizeField('ability', editor.dex.species.get(name).abilities['0']);
			assert.ok(set.ability);
			editor.sets.push(set);
		}
		editor.sets[0].item = 'Lucarionite';
		editor.sets[2].item = 'Venusaurite';
		editor.sets[3].item = 'Pikanium Z';
		editor.sets[3].gigantamax = true;
		editor.save();
		teams.save();
		assert.ok(saved().startsWith(`${canonical}]`));
		const reloaded = new PSTeams();
		const reopened = new TeamEditorState(reloaded.list[0]);
		assert.equal(reopened.gen, 9);
		assert.deepEqual(reopened.sets.map(set => set.species), species);
		assert.equal(reopened.sets[3].gigantamax, true);
		reopened.sets[1].moves = ['Surf'];
		reopened.save();
		reloaded.save();
		const edited = new TeamEditorState(new PSTeams().list[0]);
		assert.equal(edited.gen, 9);
		assert.equal(edited.sets[1].moves[0], 'Surf');
	});
});

describe('Copa Rinha National Dex editor searches', () => {
	it('offers Gigantamax in Copa Gen 9 details while official Gen 9 retains its controls', () => {
		function inputs(format) {
			const editor = new TeamEditorState({format, packedTeam: '', key: ''});
			const form = new DetailsForm({editor, set: {species: 'Pikachu', moves: []}, onChange() {}});
			const names = [];
			function walk(node) {
				if (!node || typeof node !== 'object') return;
				if (Array.isArray(node)) return node.forEach(walk);
				if (node.type === 'input') names.push(node.props.name);
				walk(node.props?.children);
			}
			walk(form.render());
			return names;
		}
		assert.ok(inputs(canonical).includes('gigantamax'));
		assert.ok(inputs('gen8ou').includes('gigantamax'));
		assert.ok(!inputs('gen9ou').includes('gigantamax'));
		assert.ok(!inputs('gen9nationaldexou').includes('gigantamax'));
	});
	it('offers every requested generation and Uber Pokemon in the normal selector', () => {
		const results = search('pokemon', '').results.filter(row => row[0] === 'pokemon').map(row => row[1]);
		for (const name of [...species, 'Arceus', 'Venusaur-Mega', 'Mewtwo-Mega-X']) {
			assert.ok(results.includes(toID(name)), name);
		}
		for (const name of species) {
			const selector = search('pokemon', name);
			assert.equal(selector.dex.gen, 9);
			assert.ok(selector.results.some(row => row[0] === 'pokemon' && row[1] === toID(name)), name);
		}
	});
	it('loads Mega Stones, Z-Crystals and Gen 9 items', () => {
		for (const name of ['Lucarionite', 'Venusaurite', 'Pikanium Z', 'Booster Energy']) {
			assert.ok(search('item', name).results.some(row => row[0] === 'item' && row[1] === toID(name)), name);
		}
	});
	it('loads past National Dex moves and abilities from all represented generations', () => {
		assert.ok(search('move', 'Hidden Power', 'greninja').results.some(row => row[0] === 'move' && row[1] === 'hiddenpower'));
		for (const [name, pokemon] of [['Inner Focus', 'lucario'], ['Protean', 'greninja'], ['Hadron Engine', 'miraidon']]) {
			assert.ok(search('ability', name, pokemon).results.some(row => row[0] === 'ability' && row[1] === toID(name)), name);
		}
	});
	it('does not change the normal OU search tables', () => {
		const ou = new DexSearch('pokemon', 'gen9ou');
		ou.find('');
		assert.equal(ou.dex.gen, 9);
		assert.equal(ou.typedSearch.format, 'ou');
		assert.equal(ou.typedSearch.formatType, null);
	});
});
