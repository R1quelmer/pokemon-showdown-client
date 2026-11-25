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
			registered: null, loggingIn: null, challstr: '4|fixture-first-connection',
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
	names.connect();
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
		reloaded.confirm('Jogador Um');
		reloaded.names.disconnect();
		Object.assign(reloaded.PS.user, {name: 'Guest 2', userid: 'guest2', named: false, challstr: '4|fixture-reconnect'});
		reloaded.names.connect();
		assert.deepEqual(reloaded.sent, ['/trn Jogador Um', '/trn Jogador Um']);
	});
	it('does not resend or replace an in-flight attempt on duplicate challenge or submit', () => {
		const s = session(); s.names.choose('Primeiro');
		s.names.connect(); s.names.choose('Segundo'); s.names.choose('A|Invalid');
		assert.deepEqual(s.sent, ['/trn Primeiro']);
		assert.equal(s.names.pending, 'Primeiro'); assert.equal(s.timers.size, 1);
		assert.deepEqual(s.errors, []);
	});
	it('selecting the exact confirmed name succeeds without sending a silent native no-op', () => {
		const s = session(); s.names.choose('Jogador'); s.confirm('Jogador');
		s.names.choose('Jogador');
		assert.deepEqual(s.sent, ['/trn Jogador']); assert.equal(s.timers.size, 0);
		assert.equal(s.names.pending, null); assert.equal(s.updates.at(-1).success, true);
	});
	it('ignores a late rejection for another name and preserves the refused name for the form', () => {
		const s = session(); s.names.choose('Primeiro');
		s.names.reject('Nome em uso', 'Primeiro');
		assert.equal(s.errors.at(-1).name, 'Primeiro');
		s.names.choose('Segundo'); s.names.reject('Late failure', 'Primeiro');
		assert.equal(s.names.pending, 'Segundo'); assert.equal(s.errors.length, 1);
		s.confirm('Segundo'); s.names.reject('Late failure', 'Primeiro');
		assert.equal(s.errors.length, 1); assert.equal(s.names.read(), 'Segundo');
	});
	it('does not retry rejected restoration and keeps a different confirmed alias on failed manual change', () => {
		const original = session(); original.names.choose('Confirmado'); original.confirm('Confirmado');
		original.names.choose('Ocupado'); original.names.reject('Nome em uso', 'Ocupado');
		assert.equal(original.names.read(), 'Confirmado'); assert.equal(original.PS.user.name, 'Confirmado');
		const restored = session(true, original.stored);
		restored.names.reject('Nome em uso', 'Confirmado'); restored.names.connect();
		assert.deepEqual(restored.sent, ['/trn Confirmado']); assert.equal(restored.names.read(), '');
		assert.equal(session(true, restored.stored).sent.length, 0);
	});
	it('invalidates disconnected timers and waits for the new handshake before choosing a name', () => {
		const s = session(); s.names.choose('Primeiro');
		const expired = [...s.timers.values()][0]; s.names.disconnect();
		assert.equal(s.timers.size, 0); assert.equal(s.PS.user.loggingIn, null);
		expired(); assert.equal(s.errors.length, 0);
		s.names.choose('Segundo'); assert.equal(s.sent.length, 1);
		assert(s.errors.at(-1).error.includes('Aguarde'));
		s.PS.user.challstr = '4|next'; s.names.connect(); s.names.choose('Segundo');
		expired(); assert.equal(s.names.pending, 'Segundo');
		assert.equal(s.errors.length, 1); assert.equal(s.timers.size, 1);
	});
	it('does not persist a different server identity or a rejected nickname', () => {
		const s = session(); s.names.choose('Jogador Um'); s.confirm('Outra Pessoa');
		assert.equal(s.stored.size, 0);
		s.names.reject('Nome em uso');
		assert.equal(s.PS.user.loggingIn, null); assert.equal(s.timers.size, 0);
		assert.equal(s.errors.at(-1).error, 'Nome em uso'); assert.equal(s.stored.size, 0);
	});
	it('clears official account markers on local updates even without a pending rename', () => {
		const s = session(); s.PS.user.registered = {name: 'Cached account', userid: 'cachedaccount'};
		s.names.confirm();
		assert.equal(s.PS.user.registered, null);
		const outside = session(false); const registered = {name: 'Official account', userid: 'officialaccount'};
		outside.PS.user.registered = registered; outside.names.confirm();
		assert.equal(outside.PS.user.registered, registered);
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

describe('native login form and official account isolation', () => {
	function panel(s, args) {
		Object.assign(s.context, {
			preact, PSRoomPanel: function (props) { this.props = props; }, PSPanelWrapper: function () {},
			_inheritsLoose(subclass, superclass) {
				subclass.prototype = Object.create(superclass.prototype);
				subclass.prototype.constructor = subclass;
				Object.setPrototypeOf(subclass, superclass);
			},
		});
		const LoginPanel = vm.runInContext(declaration('js/panel-popups.js', 'LoginPanel') + '\nLoginPanel;', s.context);
		const result = new LoginPanel({room: {args}});
		result.forceUpdate = () => {};
		return result;
	}
	it('submits the current local draft even with an old name in popup args and after a disabled-field rejection', () => {
		const s = session();
		const input = {value: 'Nome Digitado', disabled: false};
		const p = panel(s, {name: 'Nome Antigo', error: 'Old error'});
		p.base = {querySelector: selector => selector === 'input[name=username]' ? input : null};
		s.PS.user.changeName = name => s.names.choose(name);
		p.update(); p.handleSubmit({preventDefault() {}});
		assert.deepEqual(s.sent, ['/trn Nome Digitado']); assert.equal(p.props.room.args, null);
		input.disabled = true;
		s.names.reject('Nome em uso', 'Nome Digitado'); p.props.room.args = s.errors.at(-1);
		assert.equal(p.getUsername(), 'Nome Digitado');
		input.disabled = false; input.value = 'Outro Digitado'; p.update(); p.handleSubmit({preventDefault() {}});
		assert.equal(s.sent.at(-1), '/trn Outro Digitado');
	});
	it('retains official name locking and pending-name priority outside Copa mode', () => {
		const s = session(false), p = panel(s, {name: 'Official Account', needsPassword: true});
		p.base = {querySelector: () => ({value: 'Other typed name', disabled: false})};
		p.update(); assert.equal(p.getUsername(), 'Official Account');
		s.PS.user.loggingIn = 'Pending Official'; assert.equal(p.getUsername(), 'Pending Official');
		assert.equal(p.props.room.args.needsPassword, true);
	});
	it('retains official assertion, password and registered-account behavior', async () => {
		const s = session(false), requests = [];
		Object.assign(s.context, {
			PSStreamModel: function () {},
			_inheritsLoose(subclass, superclass) {
				subclass.prototype = Object.create(superclass.prototype);
				subclass.prototype.constructor = subclass;
				Object.setPrototypeOf(subclass, superclass);
			},
			PSLoginServer: {
				rawQuery: async (action, data) => { requests.push({action, data}); return ';'; },
				query: async (action, data) => {
					requests.push({action, data});
					return {curuser: {loggedin: true, username: 'Official User'}, assertion: 'fixture-assertion'};
				},
			},
		});
		const User = vm.runInContext(declaration('js/client-main.js', 'PSUser') + '\nPSUser;', s.context);
		const user = new User(); user.update = state => s.updates.push(state);
		user.challstr = 'fixture-official-challenge'; s.PS.user = user; s.PS.rooms = {login: {}};
		user.changeName('Official User'); await new Promise(resolve => setImmediate(resolve));
		assert.equal(requests[0].action, 'getassertion');
		assert.equal(requests[0].data.challstr, 'fixture-official-challenge');
		assert.equal(s.updates.at(-1).needsPassword, true); assert.deepEqual(s.sent, []);
		user.changeNameWithPassword('Official User', 'fixture-password');
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(requests[1].action, 'login'); assert.equal(requests[1].data.pass, 'fixture-password');
		assert.equal(user.registered.userid, 'officialuser');
		assert.deepEqual(s.sent, ['/trn Official User,0,fixture-assertion']);
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
	it('keeps the legacy alias form isolated from official password states and shows the Copa account notice', () => {
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
		assert.ok(text.some(value => value.includes('exclusiva da Copa Rinha') && value.includes('senha')));
	});
	it('does not solicit account passwords from direct registration/password routes in Copa mode', () => {
		const s = session();
		Object.assign(s.context, {
			preact, PSRoomPanel: function (props) { this.props = props; }, PSPanelWrapper: function () {},
			_inheritsLoose(subclass, superclass) {
				subclass.prototype = Object.create(superclass.prototype);
				subclass.prototype.constructor = subclass;
				Object.setPrototypeOf(subclass, superclass);
			},
		});
		for (const name of ['RegisterPanel', 'ChangePasswordPanel']) {
			const Panel = vm.runInContext(declaration('js/panel-popups.js', name) + '\n' + name + ';', s.context);
			const panel = new Panel({room: {}});
			const types = [];
			function walk(node) {
				if (!node || typeof node !== 'object') return;
				if (Array.isArray(node)) return node.forEach(walk);
				if (node.type === 'input') types.push(node.props.type);
				walk(node.props?.children);
			}
			walk(panel.render()); assert.deepEqual(types, []);
		}
	});

});
