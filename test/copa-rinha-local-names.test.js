const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {describe, it} = require('node:test');
const {parseSync} = require('@babel/core');
const preact = require('preact');

const root = path.resolve(__dirname, '../play.pokemonshowdown.com');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const id = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const scripts = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
function declaration(file, name) {
	const source = read(file);
	const node = parseSync(source).program.body.find(statement => statement.type === 'VariableDeclaration' &&
		statement.declarations.some(item => item.id.name === name));
	assert.ok(node, `${name} declaration exists`);
	return source.slice(node.start, node.end);
}
function session(enabled = true, stored = new Map()) {
	const sent = [], updates = [], errors = [], rooms = [], timers = new Map();
	const Config = {copaRinhaLocalNames: enabled, defaultserver: {host: 'copa-rinha-showdown.onrender.com', port: 443}};
	const PS = {
		connection: {connected: true}, roomTypes: {login: {}},
		user: {
			name: 'Guest 1', userid: 'guest1', named: false, initializing: true,
			registered: null, loggingIn: null,
			validateName: name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
			update: value => updates.push(value), updateLogin: value => errors.push(value),
		},
		send: value => sent.push(value), join: room => rooms.push(room),
	};
	const context = vm.createContext({
		Config, PS, toID: id, document: {readyState: 'complete'}, window: {},
		localStorage: {
			getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value),
			removeItem: key => stored.delete(key),
		},
		setTimeout: callback => { const key = timers.size + 1; timers.set(key, callback); return key; },
		clearTimeout: key => timers.delete(key),
	});
	const names = vm.runInContext(read('js/copa-rinha.js') + '\nCopaRinhaLocalNames;', context);
	function confirm(name) {
		Object.assign(PS.user, {name, userid: id(name), named: true});
		names.confirm();
	}
	return {names, Config, PS, sent, updates, errors, rooms, timers, stored, context, confirm};
}

describe('Copa Rinha local nicknames', () => {
	it('does nothing outside the Copa Rinha entry', () => {
		const s = session(false);
		s.names.connect(); s.names.choose('Jogador Um'); s.names.confirm(); s.names.reject('unused');
		assert.deepEqual(s.sent, []); assert.deepEqual(s.errors, []); assert.deepEqual(s.rooms, []);
		assert.equal(s.PS.user.initializing, true);
	});
	it('opens the nickname form without contacting an account service', () => {
		const s = session(); s.names.connect();
		assert.equal(s.PS.user.initializing, false);
		assert.deepEqual(s.rooms, ['login']); assert.deepEqual(s.sent, []);
	});
	it('sends only a raw rename and saves the nickname after server confirmation', () => {
		const s = session(); s.names.choose('João Rinha');
		assert.deepEqual(s.sent, ['/trn Joao Rinha']);
		assert.equal(s.stored.size, 0);
		s.confirm('Joao Rinha');
		assert.equal(s.stored.get(s.names.storageKey()), 'Joao Rinha');
		assert.equal(s.PS.user.registered, null); assert.equal(s.PS.user.loggingIn, null);
		assert.equal(s.timers.size, 0); assert.equal(s.updates.at(-1).success, true);
	});
	it('restores a confirmed nickname on reload and after another connection challenge', () => {
		const original = session(); original.names.choose('Jogador Um'); original.confirm('Jogador Um');
		const reloaded = session(true, original.stored); reloaded.names.connect();
		assert.deepEqual(reloaded.sent, ['/trn Jogador Um']);
		reloaded.confirm('Jogador Um'); reloaded.names.connect();
		assert.deepEqual(reloaded.sent, ['/trn Jogador Um', '/trn Jogador Um']);
	});
	it('does not persist a different server identity or a rejected nickname', () => {
		const s = session(); s.names.choose('Jogador Um'); s.confirm('Outra Pessoa');
		assert.equal(s.stored.size, 0);
		s.names.reject('Nome em uso');
		assert.equal(s.PS.user.loggingIn, null); assert.equal(s.timers.size, 0);
		assert.equal(s.errors.at(-1).error, 'Nome em uso'); assert.equal(s.stored.size, 0);
	});
	it('rejects protocol delimiters, controls, empty names and names longer than 18 characters', () => {
		for (const input of ['', '123', 'a'.repeat(19), 'A\n/logout', 'A\r/trn B', 'A|/trn B', 'A,1,assertion', 'A;B', 'A\0B']) {
			const s = session(); s.names.choose(input);
			assert.deepEqual(s.sent, [], input); assert.equal(s.errors.length, 1, input);
		}
	});
	it('handles a disconnected server and a rename timeout without saving', () => {
		const s = session(); s.PS.connection.connected = false; s.names.choose('Jogador');
		assert.deepEqual(s.sent, []); assert.equal(s.errors.length, 1);
		s.PS.connection.connected = true; s.names.choose('Jogador');
		[...s.timers.values()][0]();
		assert.equal(s.PS.user.loggingIn, null); assert.equal(s.stored.size, 0);
	});
	it('forgets the local nickname on explicit logout', () => {
		const s = session(); s.names.choose('Jogador'); s.confirm('Jogador'); s.names.forget();
		assert.equal(s.stored.size, 0); assert.equal(s.names.read(), '');
	});
	it('does not make login-server requests or attach a test-client key in local mode', async () => {
		const s = session();
		const login = vm.runInContext(declaration('js/client-connection.js', 'PSLoginServer') + '\nPSLoginServer;', s.context);
		const data = {pass: 'must-stay-local'};
		assert.equal(await login.rawQuery('login', data), null);
		assert.deepEqual(data, {pass: 'must-stay-local'});
		assert.equal(await login.query('upkeep'), null);
	});
	it('keeps the usual account-service query path outside Copa local mode', async () => {
		const s = session(false), requests = [];
		s.Config.routes = {client: 'play.pokemonshowdown.com'};
		s.PS.server = {id: 'showdown'};
		Object.assign(s.context, {
			location: {pathname: '/testclient-new.html'}, PSStorage: {request() {}},
			Net: url => ({get: options => { requests.push({url, options}); return Promise.resolve('response'); }}),
		});
		const login = vm.runInContext(declaration('js/client-connection.js', 'PSLoginServer') + '\nPSLoginServer;', s.context);
		assert.equal(await login.rawQuery('upkeep', {challstr: 'challenge'}), 'response');
		assert.equal(requests[0].url, 'https://play.pokemonshowdown.com/~~showdown/action.php');
		assert.equal(requests[0].options.body.act, 'upkeep');
		assert.equal(requests[0].options.body.sid, undefined);
	});
});

describe('Copa Rinha nickname page isolation', () => {
	const configScript = scripts(read('testclient-new.html')).find(script => script.includes('Config.testclient = true'));
	function configure(search) {
		const Config = {defaultserver: {host: 'sim3.psim.us', port: 443}};
		const context = vm.createContext({Config, location: {search}}); context.window = context;
		vm.runInContext(configScript, context);
		return Config;
	}
	it('requires the Copa marker, host and HTTPS port together', () => {
		for (const query of ['', '?~~copa-rinha-showdown.onrender.com:443', '?~~other.example:443&copa-rinha=1',
			'?~~copa-rinha-showdown.onrender.com:8000&copa-rinha=1']) {
			assert.equal(configure(query).copaRinhaLocalNames, false, query);
		}
		assert.equal(configure('?~~copa-rinha-showdown.onrender.com:443&copa-rinha=1').copaRinhaLocalNames, true);
	});
	it('omits the SID-bearing test-client key script only in Copa local mode', () => {
		const keyScript = scripts(read('testclient-new.html')).find(script => script.includes('document.write'));
		for (const local of [true, false]) {
			const written = [];
			vm.runInNewContext(keyScript, {Config: {copaRinhaLocalNames: local}, document: {write: text => written.push(text)}});
			assert.equal(written.length, local ? 0 : 1);
			if (!local) assert.ok(written[0].includes('../config/testclient-key.js'));
		}
	});
	it('renders only a nickname field and an impersonation notice, even if a password state was supplied', () => {
		const s = session();
		Object.assign(s.context, {
			preact, PSRoomPanel: function (props) { this.props = props; }, PSPanelWrapper: function () {},
			_inheritsLoose(subclass, superclass) {
				subclass.prototype = Object.create(superclass.prototype);
				subclass.prototype.constructor = subclass;
				Object.setPrototypeOf(subclass, superclass);
			},
		});
		const LoginPanel = vm.runInContext(declaration('js/panel-popups.js', 'LoginPanel') + '\nLoginPanel;', s.context);
		const panel = new LoginPanel({room: {args: {needsPassword: true, needsGoogle: true}}});
		panel.getUsername = () => 'Jogador';
		const inputs = [], text = [];
		function walk(node) {
			if (typeof node === 'string') text.push(node);
			if (!node || typeof node !== 'object') return;
			if (Array.isArray(node)) return node.forEach(walk);
			if (node.type === 'input') inputs.push(node.props);
			walk(node.props?.children);
		}
		walk(panel.render());
		assert.equal(inputs.length, 1); assert.equal(inputs[0].name, 'username'); assert.equal(inputs[0].type, 'text');
		assert.ok(text.includes('Entrar'));
		assert.ok(text.some(value => value.includes('Outra pessoa') && value.includes('autenticação segura')));
	});
});
