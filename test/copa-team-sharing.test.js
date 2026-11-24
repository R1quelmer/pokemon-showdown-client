const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const {parseSync} = require('@babel/core');
const source = fs.readFileSync('play.pokemonshowdown.com/js/client-main.js', 'utf8');
const declaration = parseSync(source).program.body.find(node => node.type === 'VariableDeclaration' &&
	node.declarations.some(item => item.id.name === 'PSTeams'));
function session() {
	const sent = [], alerts = [], timers = [];
	function PSStreamModel() {}
	PSStreamModel.prototype.update = () => {};
	const PS = {user: {named: true}, connection: {connected: true}, rooms: {},
		send: value => sent.push(value), alert: value => alerts.push(value)};
	const Dex = {isCopaRinha: () => true};
	const context = vm.createContext({PSStreamModel, PS, Dex,
		_inheritsLoose(child, parent) {
			child.prototype = Object.create(parent.prototype);
			child.prototype.constructor = child;
			Object.setPrototypeOf(child, parent);
		},
		localStorage: {getItem: () => null}, setTimeout: fn => (timers.push(fn), timers.length), clearTimeout() {}});
	PS.teams = vm.runInContext(source.slice(declaration.start, declaration.end) + '\nnew PSTeams();', context);
	const team = {name: 'Name, with|separators\n', key: 'test', packedTeam: 'Pikachu|||Static|Thunderbolt', format: 'gen9coparinhanationaldexza'};
	const id = 'a'.repeat(32), url = `https://copa-rinha-client.onrender.com/team.html?id=${id}`;
	return {PS, Dex, team, sent, alerts, timers, id, url};
}
test('sharing uses native save and stores an immutable URL separately from account-owned IDs', () => {
	const s = session(); s.PS.teams.shareCopaTeam(s.team);
	assert.equal(s.sent.length, 1);
	assert(s.sent[0].startsWith('/teams save Name  with separators , gen9coparinhanationaldexza, 0, '));
	const snapshot = s.team.packedTeam;
	s.team.packedTeam += ',Protect';
	assert(s.PS.teams.receiveCopaShare({teamid:s.id, url:s.url, requestTeam:snapshot}));
	assert.equal(s.team.copaShare.url, s.url);
	assert.equal(s.team.copaShare.packedTeam, snapshot);
	assert.equal(s.team.teamid, undefined); assert.equal(s.team.uploaded, undefined);
	assert.equal(s.PS.teams.uploading, null);
});
test('stale responses and arbitrary external URLs cannot attach the wrong link to a local team', () => {
	const s = session(); s.PS.teams.shareCopaTeam(s.team);
	s.PS.teams.receiveCopaShare({teamid:s.id, url:s.url, requestTeam:'another team'});
	assert.equal(s.PS.teams.uploading, s.team); assert.equal(s.team.copaShare, undefined);
	s.PS.teams.receiveCopaShare({teamid:s.id, url:'https://evil.example/', requestTeam:s.team.packedTeam});
	assert.equal(s.team.copaShare, undefined); assert.equal(s.alerts.length, 1);
	assert.equal(s.PS.teams.uploading, null);
});
test('errors, guest state, scope, concurrent submissions and timeout preserve the local team', () => {
	const s = session();
	s.PS.user.named = false; s.PS.teams.shareCopaTeam(s.team); assert.equal(s.sent.length, 0);
	s.PS.user.named = true; s.Dex.isCopaRinha = () => false; s.PS.teams.shareCopaTeam(s.team); assert.equal(s.sent.length, 0);
	s.Dex.isCopaRinha = () => true; s.PS.teams.shareCopaTeam(s.team); s.PS.teams.shareCopaTeam(s.team);
	assert.equal(s.sent.length, 1);
	const packed = s.team.packedTeam;
	s.PS.teams.receiveCopaShare({error:'synthetic failure', requestTeam:packed});
	assert.equal(s.PS.teams.uploading, null); assert.equal(s.team.packedTeam, packed);
	s.PS.teams.shareCopaTeam(s.team); s.timers.at(-1)();
	assert.equal(s.PS.teams.uploading, null); assert.equal(s.team.packedTeam, packed);
	assert.equal(s.team.copaShare, undefined);
});
