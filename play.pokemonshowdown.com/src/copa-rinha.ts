/** Passwordless, unverified local names for the Copa Rinha entry only. */
import { Config, PS, type RoomID } from './client-main';
import { toID } from './battle-dex';

export const CopaRinhaLocalNames = new class {
	pending: string | null = null;
	private challenge: string | null = null;
	private attempt = 0;
	timer: ReturnType<typeof setTimeout> | null = null;
	storageKey() {
		const server = Config.defaultserver;
		return `copa-rinha:nickname:${server.host}:${server.port}/showdown`;
	}
	read() {
		try {
			return localStorage.getItem(this.storageKey()) || '';
		} catch {
			return '';
		}
	}
	clearPending() {
		this.attempt++;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.pending = null;
		PS.user.loggingIn = null;
	}
	connect() {
		if (!Config.copaRinhaLocalNames) return;
		const challenge = PS.user.challstr;
		if (this.challenge === challenge) return;
		this.challenge = challenge;
		this.clearPending();
		void window.CopaRinhaAvatars?.load();
		PS.user.initializing = false;
		PS.user.registered = null;
		const saved = this.read();
		if (saved) {
			this.choose(saved);
		} else {
			const open = () => {
				if (this.challenge === challenge && !PS.user.named && !this.pending && PS.roomTypes['login']) {
					PS.join('login' as RoomID);
				}
			};
			if (document.readyState === 'complete') open();
			else window.addEventListener('load', open, { once: true });
		}
		PS.user.update(null);
	}
	disconnect() {
		if (!Config.copaRinhaLocalNames) return;
		this.clearPending();
		this.challenge = null;
		PS.user.update(null);
	}
	choose(input: string) {
		if (!Config.copaRinhaLocalNames || this.pending) return;
		const name = PS.user.validateName(input).replace(/ +/g, ' ');
		const controls = input.split('').some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
		if (controls || /[|,;]/.test(input) || !/^[a-z0-9 ]{1,18}$/i.test(name) || !/[a-z]/i.test(name)) {
			this.reject('Use de 1 a 18 caracteres: letras, números e espaços, incluindo ao menos uma letra.');
			return;
		}
		if (!PS.connection?.connected || this.challenge === null) {
			this.reject('Aguarde a conexão com o servidor para escolher seu nome.');
			return;
		}
		this.clearPending();
		this.pending = name;
		// Native /trn silently ignores an exact no-op: no updateuser will follow.
		if (PS.user.named && PS.user.name === name) {
			this.confirm();
			return;
		}
		PS.user.loggingIn = name;
		PS.user.update(null);
		const attempt = this.attempt;
		this.timer = setTimeout(() => {
			if (attempt !== this.attempt) return;
			this.reject('O servidor não confirmou o nome. Tente novamente após reconectar.');
		}, 15000);
		PS.send(`/trn ${name}`);
	}
	confirm() {
		if (!Config.copaRinhaLocalNames) return;
		// Local aliases must never inherit a previously cached official account state.
		PS.user.registered = null;
		if (!this.pending || !PS.user.named || PS.user.userid !== toID(this.pending)) return;
		try {
			localStorage.setItem(this.storageKey(), PS.user.name);
		} catch {}
		this.clearPending();
		PS.user.registered = null;
		PS.user.update({ success: true });
	}
	reject(error: string, rejectedName?: string) {
		if (!Config.copaRinhaLocalNames) return;
		// Replies with a name belong to that attempt, never to a newer choice.
		if (rejectedName && (!this.pending || toID(rejectedName) !== toID(this.pending))) return;
		const name = this.pending || rejectedName;
		if (rejectedName !== undefined && name && toID(this.read()) === toID(name)) {
			// Stop restoring a refused saved alias; keep a different, confirmed alias.
			try { localStorage.removeItem(this.storageKey()); } catch {}
		}
		this.clearPending();
		PS.user.updateLogin({ name, error });
	}
	forget() {
		this.clearPending();
		try {
			localStorage.removeItem(this.storageKey());
		} catch {}
	}
};
