/** Passwordless, unverified local names for the Copa Rinha entry only. */
import { Config, PS, type RoomID } from './client-main';
import { toID } from './battle-dex';

export const CopaRinhaLocalNames = new class {
	pending: string | null = null;
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
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.pending = null;
		PS.user.loggingIn = null;
	}
	connect() {
		if (!Config.copaRinhaLocalNames) return;
		this.clearPending();
		PS.user.initializing = false;
		PS.user.registered = null;
		const saved = this.read();
		if (saved) {
			this.choose(saved);
		} else {
			const open = () => {
				if (!PS.user.named && PS.roomTypes['login']) PS.join('login' as RoomID);
			};
			if (document.readyState === 'complete') open();
			else window.addEventListener('load', open, { once: true });
		}
		PS.user.update(null);
	}
	choose(input: string) {
		if (!Config.copaRinhaLocalNames) return;
		const name = PS.user.validateName(input).replace(/ +/g, ' ');
		const controls = input.split('').some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
		if (controls || /[|,;]/.test(input) || !/^[a-z0-9 ]{1,18}$/i.test(name) || !/[a-z]/i.test(name)) {
			this.reject('Use de 1 a 18 caracteres: letras, números e espaços, incluindo ao menos uma letra.');
			return;
		}
		if (!PS.connection?.connected) {
			this.reject('Aguarde a conexão com o servidor para escolher seu nome.');
			return;
		}
		this.clearPending();
		this.pending = name;
		PS.user.loggingIn = name;
		PS.user.update(null);
		PS.send(`/trn ${name}`);
		this.timer = setTimeout(() => {
			this.reject('O servidor não confirmou o nome. Tente novamente após reconectar.');
		}, 15000);
	}
	confirm() {
		if (!Config.copaRinhaLocalNames || !this.pending || !PS.user.named || PS.user.userid !== toID(this.pending)) return;
		try {
			localStorage.setItem(this.storageKey(), PS.user.name);
		} catch {}
		this.clearPending();
		PS.user.registered = null;
		PS.user.update({ success: true });
	}
	reject(error: string) {
		if (!Config.copaRinhaLocalNames) return;
		this.clearPending();
		PS.user.updateLogin({ error });
	}
	forget() {
		this.clearPending();
		try {
			localStorage.removeItem(this.storageKey());
		} catch {}
	}
};
