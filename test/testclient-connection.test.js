const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {describe, it} = require('node:test');
const {parseSync} = require('@babel/core');

const root = path.resolve(__dirname, '../play.pokemonshowdown.com');
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');
const scripts = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);

function configure(client, search) {
	const original = {id: 'showdown', host: 'sim3.psim.us', port: 443, httpport: 8000, registered: true};
	const Config = {defaultserver: original};
	const alerts = [];
	const context = vm.createContext({Config, location: {search}, alert: message => alerts.push(message)});
	context.window = context;
	const script = scripts(read(`testclient-${client}.html`)).find(code => code.includes('Config.testclient = true'));
	assert.ok(script, 'test client configuration script exists');
	vm.runInContext(script, context);
	return {Config, original, alerts, server: client === 'new' ? Config.defaultserver : Config.server};
}

// Isolate real built declarations without executing the rest of the browser UI.
function declaration(filename, name) {
	const source = read(filename);
	const node = parseSync(source).program.body.find(statement => statement.type === 'VariableDeclaration' &&
		statement.declarations.some(item => item.id.name === name));
	assert.ok(node, `${name} declaration exists`);
	return source.slice(node.start, node.end);
}
const serverCode = declaration('js/client-main.js', 'PSServer');
const connectionCode = declaration('js/client-connection.js', 'PSConnection');
function modernServer(config) {
	return vm.runInNewContext(`${serverCode}; new PSServer();`, {Config: {defaultserver: config}});
}
function socketRecorder() {
	const urls = [];
	function Socket(url) { urls.push(url); }
	return {urls, WebSocket: Socket, SockJS: Socket};
}
function directURL(server, raw = false) {
	const sockets = socketRecorder();
	const context = vm.createContext({...sockets, PS: {server}});
	if (raw) delete context.SockJS;
	vm.runInContext(`${connectionCode}; PSConnection.prototype.directConnect.call({});`, context);
	return sockets.urls[0];
}
function workerURL(server) {
	const sockets = socketRecorder();
	const context = vm.createContext({...sockets, self: {}, setInterval() {}});
	vm.runInContext(read('js/client-connection-worker.js'), context);
	context.self.onmessage({data: {type: 'connect', server}});
	return sockets.urls[0];
}

const oldSource = read('src/oldclient/client.js');
let oldConnect;
function findConnect(node) {
	if (!node || typeof node !== 'object') return;
	if (node.type === 'ObjectProperty' && node.key.name === 'connect') oldConnect = node.value;
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) value.forEach(findConnect);
		else if (value && typeof value === 'object') findConnect(value);
	}
}
findConnect(parseSync(oldSource).program);
assert.ok(oldConnect, 'legacy connect method exists');
function oldURL(server) {
	const sockets = socketRecorder();
	const location = new URL('https://client.example/testclient-old.html');
	const context = vm.createContext({
		...sockets, Config: {server, sockjsprefix: '/showdown'}, location,
		document: {location}, URL, $: {trim: text => text.trim()}, console: {log() {}},
	});
	vm.runInContext(`(${oldSource.slice(oldConnect.start, oldConnect.end)}).call({query: ''});`, context);
	return sockets.urls[0];
}

describe('Test client server configuration', () => {
	for (const client of ['new', 'old']) {
		for (const [query, host, port, protocol] of [
			['?~~copa-rinha-showdown.onrender.com:443', 'copa-rinha-showdown.onrender.com', 443, 'https'],
			['?~~localhost:8000', 'localhost', 8000, 'http'],
			['?~~localhost', 'localhost', 8000, 'http'],
		]) {
			it(`${client} client configures ${query} with ${protocol} and /showdown`, () => {
				const {Config, server, alerts} = configure(client, query);
				assert.equal(Config.testclient, true);
				assert.deepEqual(alerts, []);
				assert.equal(server.id, query.slice(3));
				assert.equal(server.host, host);
				assert.equal(server.port, port);
				assert.equal(server.httpport, port);
				assert.equal(server.protocol, protocol);
				assert.equal(server.prefix, '/showdown');
			});
		}
		it(`${client} client retains its normal default without a query`, () => {
			const {Config, original, alerts} = configure(client, '');
			assert.equal(Config.defaultserver, original);
			assert.equal(Config.server, undefined);
			assert.deepEqual(alerts, []);
		});
		it(`${client} client still reports unrecognized queries`, () => {
			const {Config, original, alerts} = configure(client, '?invalid');
			assert.equal(Config.defaultserver, original);
			assert.equal(Config.server, undefined);
			assert.deepEqual(alerts, ['Unrecognised query string syntax: ?invalid']);
		});
	}
});

describe('Test client connection URLs', () => {
	for (const [query, expected, expectedWorker] of [
		['?~~copa-rinha-showdown.onrender.com:443', 'https://copa-rinha-showdown.onrender.com:443/showdown',
			'wss://copa-rinha-showdown.onrender.com/showdown/websocket'],
		['?~~localhost:8000', 'http://localhost:8000/showdown', 'ws://localhost:8000/showdown/websocket'],
	]) {
		it(`modern worker and direct fallbacks use the correct protocol for ${query}`, () => {
			const server = modernServer(configure('new', query).server);
			assert.equal(directURL(server), expected);
			assert.equal(directURL(server, true), expected.replace('http', 'ws') + '/websocket');
			assert.equal(workerURL(server), expectedWorker);
		});
		it(`legacy client uses the correct protocol for ${query}`, () => {
			const server = configure('old', query).server;
			assert.equal(oldURL(server), server.host === 'localhost' ? expectedWorker : expected);
		});
	}
	it('preserves modern protocol inference for existing configurations without an explicit protocol', () => {
		assert.equal(modernServer({host: 'sim3.psim.us', port: 443, httpport: 8000}).protocol, 'https');
		assert.equal(modernServer({host: 'localhost', port: 8000}).protocol, 'http');
	});

	it('the Copa Rinha entry stays on this site and selects the HTTPS server automatically', () => {
		let target;
		const html = read('copa-rinha.html');
		vm.runInNewContext(scripts(html)[0], {location: {hash: '#battle-example', replace(url) { target = url; }}});
		const destination = new URL(target, 'https://copa-rinha-client.onrender.com/copa-rinha.html');
		assert.equal(destination.origin, 'https://copa-rinha-client.onrender.com');
		assert.equal(destination.pathname, '/testclient-new.html');
		assert.equal(destination.search, '?~~copa-rinha-showdown.onrender.com:443');
		assert.equal(destination.hash, '#battle-example');
		assert.ok(html.includes('href="testclient-new.html?~~copa-rinha-showdown.onrender.com:443"'));
		assert.equal(modernServer(configure('new', destination.search).server).protocol, 'https');
	});
});
