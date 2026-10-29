const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {describe, it} = require('node:test');
const {parseSync} = require('@babel/core');
const {Dex: SourceDex} = require('../../caches/pokemon-showdown/dist/sim/dex');

const root = path.resolve(__dirname, '../../play.pokemonshowdown.com');
const format = 'gen9coparinhanationaldexza';
// Species inventory from smogon/pokemon-showdown ccfaa20f32af363569cd21a9d501b2bc1ded26b1.
const zaIds = [
	'raichumegax', 'raichumegay', 'clefablemega', 'victreebelmega',
	'starmiemega', 'dragonitemega', 'meganiummega', 'feraligatrmega',
	'skarmorymega', 'chimechomega', 'absolmegaz', 'staraptormega',
	'garchompmegaz', 'lucariomegaz', 'froslassmega', 'heatranmega',
	'darkraimega', 'emboarmega', 'excadrillmega', 'scolipedemega',
	'scraftymega', 'eelektrossmega', 'chandeluremega', 'golurkmega',
	'chesnaughtmega', 'delphoxmega', 'greninjamega', 'pyroarmega',
	'floettemega', 'meowsticmmega', 'meowsticfmega', 'malamarmega',
	'barbaraclemega', 'dragalgemega', 'hawluchamega', 'zygardemega',
	'crabominablemega', 'golisopodmega', 'drampamega', 'magearnamega',
	'magearnaoriginalmega', 'zeraoramega', 'falinksmega', 'scovillainmega',
	'glimmoramega', 'tatsugiricurlymega', 'tatsugiridroopymega', 'tatsugiristretchymega',
	'baxcaliburmega',
];
const megas = zaIds.map(id => SourceDex.species.get(id));
const stoneIds = [...new Set(megas.map(mega => SourceDex.toID(mega.requiredItem)))];
global.window = global;
global.Config = {routes: {client: 'play.pokemonshowdown.com', dex: 'dex.pokemonshowdown.com'}};
for (const file of ['pokedex', 'moves', 'items', 'abilities', 'teambuilder-tables', 'search-index', 'aliases']) {
	Object.assign(global, require(path.join(root, 'data', `${file}.js`)));
}
Object.assign(global, require(path.join(root, 'data/text/en.js')));
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/battle-dex-data.js'), 'utf8'));
require(path.join(root, 'js/battle-dex.js'));
function load(file, name) {
	return vm.runInThisContext(`${fs.readFileSync(path.join(root, 'js', file), 'utf8')}\n${name};`);
}
global.Teams = load('battle-teams.js', 'Teams');
global.DexSearch = load('battle-dex-search.js', 'DexSearch');
global.PSModel = function () {};
PSModel.prototype.update = function () {};
const editorSource = fs.readFileSync(path.join(root, 'js/battle-team-editor.js'), 'utf8');
const editorNode = parseSync(editorSource).program.body.find(statement => statement.type === 'VariableDeclaration' &&
	statement.declarations.some(item => item.id.name === 'TeamEditorState'));
const TeamEditorState = vm.runInThisContext(`${editorSource.slice(editorNode.start, editorNode.end)}\nTeamEditorState;`);
global.preact = require('preact');
const PSSearchResults = load('battle-searchresults.js', 'PSSearchResults');
global.Pokemon = function () {};
function search(type, species = '', selectedFormat = format) {
	const result = new DexSearch(type, selectedFormat, species);
	result.find('');
	return result;
}
function ids(search, type) {
	return search.results.filter(row => row[0] === type).map(row => row[1]);
}

describe('Copa Rinha Legends Z-A client data and selectors', () => {
	it('retains all 49 upstream Mega formes and 45 distinct stones in generated client data', () => {
		assert.equal(megas.length, 49);
		assert.equal(stoneIds.length, 45);
		for (const mega of megas) {
			assert.ok(mega.exists && mega.isMega && mega.gen === 9, mega.name);
			const actual = Dex.species.get(mega.id);
			assert.equal(actual.name, mega.name);
			assert.equal(actual.gen, 9);
			assert.deepEqual(actual.types, mega.types, mega.name);
			assert.deepEqual(actual.baseStats, mega.baseStats, mega.name);
			assert.deepEqual(actual.abilities, mega.abilities, mega.name);
			assert.deepEqual(actual.battleOnly, mega.battleOnly, mega.name);
			assert.deepEqual(actual.requiredItems, [mega.requiredItem], mega.name);
			const stone = SourceDex.items.get(mega.requiredItem);
			assert.deepEqual(Dex.items.get(stone.id).megaStone, stone.megaStone, stone.name);
			assert.ok(Dex.text.get(Dex.items.get(stone.id)).shortDesc, stone.name);
			assert.ok(Dex.abilities.get(mega.abilities[0]).exists, mega.abilities[0]);
			assert.ok(Dex.text.get(Dex.abilities.get(mega.abilities[0])).shortDesc, mega.abilities[0]);
		}
	});
	it('offers every Z-A Mega and its required base normally, without an Illegal label', () => {
		const selector = search('pokemon');
		const available = ids(selector, 'pokemon');
		for (const mega of megas) {
			assert.ok(available.includes(mega.id), mega.name);
			assert.equal(selector.typedSearch.illegalReasons[mega.id], undefined, mega.name);
			assert.notEqual(selector.getTier(Dex.species.get(mega.id)), 'Illegal', mega.name);
		}
		assert.ok(available.includes('floetteeternal'));
		assert.equal(selector.typedSearch.illegalReasons.floetteeternal, undefined);
		assert.notEqual(selector.getTier(Dex.species.get('floetteeternal')), 'Illegal');
	});
	it('offers all Mega Stones in the normal and Pokemon-specific item menus', () => {
		const selector = search('item');
		for (const stoneId of stoneIds) {
			assert.ok(ids(selector, 'item').includes(stoneId), stoneId);
			assert.equal(selector.typedSearch.illegalReasons[stoneId], undefined, stoneId);
		}
		for (const mega of megas) {
			const stone = SourceDex.items.get(mega.requiredItem);
			for (const base of Object.keys(stone.megaStone)) {
				assert.ok(ids(search('item', SourceDex.toID(base)), 'item').includes(stone.id), `${base} / ${stone.name}`);
			}
		}
	});
	it('keeps official National Dex legality and unrelated Future/CAP content unchanged', () => {
		const official = search('pokemon', '', 'gen9nationaldexag');
		const officialItems = search('item', '', 'gen9nationaldexag');
		for (const mega of megas) assert.ok(!ids(official, 'pokemon').includes(mega.id), mega.name);
		for (const stone of stoneIds) assert.ok(!ids(officialItems, 'item').includes(stone), stone);
		for (const id of ['eternatuseternamax', 'crucibellemega']) {
			assert.ok(!ids(search('pokemon'), 'pokemon').includes(id), id);
		}
		assert.ok(!ids(search('item'), 'item').includes('crucibellite'));
		for (const selectedFormat of [format, 'gen9nationaldexag']) {
			assert.ok(ids(search('pokemon', '', selectedFormat), 'pokemon').includes('venusaurmega'));
			assert.ok(ids(search('item', '', selectedFormat), 'item').includes('venusaurite'));
		}
	});
	it('uses the actual pre-Mega forme for gender-specific Copa Rinha abilities', () => {
		const female = ids(search('ability', 'meowsticfmega'), 'ability');
		const male = ids(search('ability', 'meowsticmmega'), 'ability');
		assert.ok(female.includes('competitive'));
		assert.ok(!female.includes('prankster'));
		assert.ok(male.includes('prankster'));
		assert.ok(!male.includes('competitive'));
		const official = ids(search('ability', 'meowsticfmega', 'gen9nationaldexag'), 'ability');
		assert.ok(official.includes('prankster'), 'the official-format selector is unchanged');
	});
	it('preserves all names, type/stat/ability rows and existing icon/sprite paths', () => {
		const selector = search('pokemon');
		selector.numAbilityCols = 2;
		const renderer = new PSSearchResults({search: selector});
		for (const mega of megas) {
			const row = renderer.renderPokemonRowHTML(0, mega.id, 0, 0);
			assert.ok(row.includes(`data-entry="pokemon|${mega.name}"`), mega.name);
			for (const type of mega.types) assert.ok(row.includes(`alt="${type}"`), mega.name);
			assert.ok(row.includes(mega.abilities[0]), mega.name);
			for (const stat of Object.values(mega.baseStats)) assert.ok(row.includes(`<br />${stat}</span>`), mega.name);
			assert.ok(Dex.getPokemonIconNum(mega.id) > 1025, mega.name);
			const builder = Dex.getTeambuilderSpriteData(mega.name, Dex.forGen(9));
			assert.equal(builder.spriteid, mega.spriteid, mega.name);
			assert.notEqual(builder.spriteid, '0', mega.name);
			for (const front of [true, false]) {
				assert.ok(Dex.getSpriteData(mega.name, front, {gen: 9}).url.endsWith(`/${mega.spriteid}.png`), mega.name);
			}
		}
	});
	it('edits and round-trips mixed old/new Mega Stone teams without forcing another format', () => {
		const team = {format, packedTeam: '', key: ''};
		const editor = new TeamEditorState(team);
		for (const name of ['Venusaur-Mega', 'Clefable-Mega', 'Lucario-Mega-Z', 'Raichu-Mega-X', 'Floette-Mega', 'Greninja-Mega']) {
			const set = {species: '', moves: ['Sleep Talk']};
			editor.changeSpecies(set, name);
			assert.equal(set.item, Dex.species.get(name).requiredItems[0], name);
			editor.sets.push(set);
		}
		editor.save();
		const reopened = new TeamEditorState(team);
		assert.equal(reopened.gen, 9);
		assert.equal(reopened.format.id, format);
		assert.equal(reopened.sets.length, 6);
		assert.deepEqual(reopened.sets.map(set => set.item), ['Venusaurite', 'Clefablite', 'Lucarionite Z', 'Raichunite X', 'Floettite', 'Greninjite']);
	});
});
