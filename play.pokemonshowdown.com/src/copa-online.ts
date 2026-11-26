import type { CopaPartner, CopaRegion } from './copa-accounts';
/* eslint-disable no-restricted-globals */
/** Public presence over the native Showdown query transport, only in the Copa entry. */
import { Config, PS } from './client-main';
import { toID } from './battle-dex';

export const COPA_NICKNAME_COLORS = [
	{ id: 'cyan', label: 'Ciano', color: '#75e5fb' },
	{ id: 'mint', label: 'Verde-menta', color: '#8cf0bd' },
	{ id: 'pink', label: 'Rosa', color: '#ffaacf' },
	{ id: 'lilac', label: 'Lilás', color: '#d0baff' },
	{ id: 'peach', label: 'Pêssego', color: '#ffc4a5' },
];
interface CopaNickname { color?: string; gold: boolean; badges: CopaRegion[] }

export interface CopaOnlineUser {
	name: string;
	avatar: string;
	status: string;
	statusType: 'online' | 'busy' | 'idle';
	inBattle?: boolean;
}
export interface CopaPresenceSnapshot {
	total: number;
	guests: number;
	users: CopaOnlineUser[];
	members?: CopaMember[] | null;
	nicknames?: Map<string, CopaNickname>;
}
export function parseCopaPartner(input: unknown): CopaPartner | undefined {
	const value = input as Partial<CopaPartner> | undefined;
	if (typeof value?.species === 'string' && /^[a-z0-9]{1,32}$/.test(value.species) && typeof value.shiny === 'boolean') {
		return { species: value.species, shiny: value.shiny };
	}
	return undefined;
}

interface CopaMember {
	name: string; avatar: string; online: boolean; rooms: string[]; battle?: string; partner?: CopaPartner;
}

function publicAvatar(value: unknown) {
	const avatar = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : value;
	return typeof avatar === 'string' && /^#?[a-z0-9][a-z0-9._-]{0,79}$/i.test(avatar) ? avatar : 'unknown';
}

declare global {
	interface Window {
		CopaRinhaPresence?: typeof CopaRinhaPresence;
	}
}

export const CopaRinhaPresence = new class {
	snapshot: CopaPresenceSnapshot | null = null;
	state: 'loading' | 'ready' | 'unavailable' | 'offline' = 'loading';
	pending = false;
	private started = false;
	private poll: ReturnType<typeof setInterval> | null = null;
	private timeout: ReturnType<typeof setTimeout> | null = null;
	private requestedMembers = false;

	/** Accept public fields only; never keep unexpected server object properties. */
	parse(value: unknown): CopaPresenceSnapshot | null {
		if (!value || typeof value !== 'object') return null;
		const data = value as Partial<CopaPresenceSnapshot>;
		if (!Number.isSafeInteger(data.total) || !Number.isSafeInteger(data.guests) ||
			data.total! < 0 || data.guests! < 0 || data.guests! > data.total! ||
			!Array.isArray(data.users) || data.users.length > 10000) return null;
		const users: CopaOnlineUser[] = [];
		const seen = new Set<string>();
		for (const user of data.users) {
			if (!user || typeof user.name !== 'string' || !toID(user.name) || user.name.length > 40 ||
				toID(user.name).length > 18 || typeof user.status !== 'string' || user.status.length > 512 ||
				!['online', 'busy', 'idle'].includes(user.statusType)) return null;
			const id = toID(user.name);
			if (seen.has(id)) continue;
			seen.add(id);
			users.push({ name: user.name, inBattle: user.inBattle === true, status: user.status, statusType: user.statusType,
				avatar: publicAvatar(user.avatar) });
		}
		users.sort((a, b) => a.name.localeCompare(b.name));
		const snapshot: CopaPresenceSnapshot = { total: users.length + data.guests!, guests: data.guests!, users };
		if (data.members !== undefined) snapshot.members = this.parseMembers(data.members);
		if (Array.isArray(data.nicknames)) {
			const nicknames = new Map<string, CopaNickname>();
			(data.nicknames as unknown as {
				id: unknown, color?: unknown, gold?: boolean, badges?: CopaRegion[],
			}[]).slice(0, 1000).forEach(row => {
				if (!row || typeof row.id !== 'string' || !/^[a-z0-9]{1,18}$/.test(row.id)) return;
				const color = COPA_NICKNAME_COLORS.find(entry => entry.id === row.color)?.color;
				nicknames.set(row.id, { color, gold: row.gold === true, badges: Array.isArray(row.badges) ? row.badges : [] });
			});
			snapshot.nicknames = nicknames;
		}
		return snapshot;
	}
	private parseMembers(rows: unknown): CopaMember[] | null {
		if (!Array.isArray(rows) || rows.length > 1000) return null;
		const seen = new Set<string>();
		const members: CopaMember[] = [];
		for (const row of rows) {
			if (!row || typeof row.name !== 'string' || !/^[a-z0-9 ]{1,18}$/i.test(row.name) ||
				!toID(row.name) || typeof row.online !== 'boolean') return null;
			const id = toID(row.name);
			if (seen.has(id)) continue;
			seen.add(id);
			const rooms = row.online && Array.isArray(row.rooms) ?
				row.rooms.filter((room: unknown): room is string => typeof room === 'string' && room.length <= 120) : [];
			const battle = row.online && typeof row.battle === 'string' && /^battle-[a-z0-9-]{1,100}$/.test(row.battle) ?
				row.battle : undefined;
			const partner = parseCopaPartner(row.partner);
			members.push({ name: row.name, avatar: publicAvatar(row.avatar), online: row.online, rooms, battle, partner });
		}
		return members.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
	}
	private nicknameStyles?: HTMLStyleElement;
	private updateNicknameStyles() {
		const rules: string[] = [];
		this.snapshot?.nicknames?.forEach(({ color, gold }, id) => {
			const name = `[data-copa-name="${id}"]`;
			if (color) rules.push(`html.copa-rinha ${name}{color:${color}!important}`);
			if (gold) rules.push(`html.copa-rinha :is(#room-lobby,[id^="room-battle-"]) ${name}{color:#f3ce77!important}`);
		});
		const css = rules.join('\n');
		if (!this.nicknameStyles && css) {
			this.nicknameStyles = document.createElement('style');
			document.head.append(this.nicknameStyles);
		}
		if (this.nicknameStyles && this.nicknameStyles.textContent !== css) this.nicknameStyles.textContent = css;
	}

	private notify() {
		this.updateNicknameStyles();
		for (const id of PS.popups) {
			if (id.startsWith('copatrainer-')) PS.rooms[id]?.update(null);
		}
		PS.mainmenu.update(null);
		PS.rooms['rooms']?.update(null);
		PS.rooms['copaonline']?.update(null);
		PS.rooms['copamembers']?.update(null);
	}
	private cancelRequest() {
		if (this.timeout !== null) clearTimeout(this.timeout);
		this.timeout = null;
		this.pending = false;
	}
	private invalidate(state: typeof this.state) {
		this.cancelRequest();
		this.snapshot = null;
		this.state = state;
		this.notify();
	}
	refresh = () => {
		if (!this.started || !Config.copaRinhaLocalNames || document.hidden || this.pending) return;
		if (!PS.connection?.connected) {
			this.invalidate('offline');
			return;
		}
		this.pending = true;
		this.requestedMembers = !!PS.rooms['copamembers'];
		this.timeout = setTimeout(() => this.invalidate('unavailable'), 10000);
		PS.send(this.requestedMembers ? '/cmd copapresence members' : '/cmd copapresence nicknames');
	};
	receive(value: unknown) {
		if (!Config.copaRinhaLocalNames || !this.pending || !PS.connection?.connected || document.hidden) return;
		const snapshot = this.parse(value);
		const requestedMembers = this.requestedMembers;
		if (snapshot && requestedMembers && snapshot.members === undefined) snapshot.members = null;
		this.cancelRequest();
		this.snapshot = snapshot;
		this.state = snapshot ? 'ready' : 'unavailable';
		this.notify();
		if (!requestedMembers && PS.rooms['copamembers']) this.refresh();
	}
	disconnect() {
		if (!Config.copaRinhaLocalNames) return;
		this.invalidate('offline');
	}
	private visibility = () => {
		if (this.poll !== null) clearInterval(this.poll);
		this.poll = null;
		if (document.hidden) {
			this.invalidate('loading');
			return;
		}
		this.refresh();
		this.poll = setInterval(this.refresh, 15000);
	};
	start() {
		if (!Config.copaRinhaLocalNames || this.started) return;
		this.started = true;
		document.addEventListener('visibilitychange', this.visibility);
		this.visibility();
	}
	stop() {
		if (this.poll !== null) clearInterval(this.poll);
		this.poll = null;
		this.started = false;
		document.removeEventListener('visibilitychange', this.visibility);
		this.cancelRequest();
	}
};
window.CopaRinhaPresence = CopaRinhaPresence;
