/* eslint-disable no-restricted-globals */
/** Public presence over the native Showdown query transport, only in the Copa entry. */
import { Config, PS } from './client-main';
import { toID } from './battle-dex';

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
			const avatar: unknown = typeof user.avatar === 'number' && Number.isSafeInteger(user.avatar) && user.avatar >= 0 ?
				String(user.avatar) : user.avatar;
			users.push({ name: user.name, inBattle: user.inBattle === true, status: user.status, statusType: user.statusType,
				avatar: typeof avatar === 'string' && /^#?[a-z0-9][a-z0-9._-]{0,79}$/i.test(avatar) ? avatar : 'unknown' });
		}
		users.sort((a, b) => a.name.localeCompare(b.name));
		return { total: users.length + data.guests!, guests: data.guests!, users };
	}
	private notify() {
		PS.rooms['rooms']?.update(null);
		PS.rooms['copaonline']?.update(null);
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
		this.timeout = setTimeout(() => this.invalidate('unavailable'), 10000);
		PS.send('/cmd copapresence');
	};
	receive(value: unknown) {
		if (!Config.copaRinhaLocalNames || !this.pending || !PS.connection?.connected || document.hidden) return;
		const snapshot = this.parse(value);
		this.cancelRequest();
		this.snapshot = snapshot;
		this.state = snapshot ? 'ready' : 'unavailable';
		this.notify();
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
