/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */
/** Accounts are exclusive to Copa Rinha. No Showdown passwords or assertions. */
import { toID } from './battle-dex';
import { Config, PS } from './client-main';
import { CopaRinhaLocalNames } from './copa-rinha';
const endpoint = 'https://copa-rinha-showdown.onrender.com/copa-rinha/accounts/';
const storageKey = 'copa-rinha:account-session:v1';
interface Session {
	name: string;
	token: string;
	expires: number;
}
export interface CopaPartner { species: string; shiny: boolean }
export interface CopaProfile { name: string; avatar: string; partner?: CopaPartner; nicknameColor?: string }
export const COPA_REGIONS = [
	'Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Hisui', 'Paldea',
] as const;
export type CopaRegion = typeof COPA_REGIONS[number];
export interface CopaTrainerCard {
	bio: string;
	region: CopaRegion | '';
	dreamTeam: (CopaPartner | null)[];
	banner: string;
}
export interface CopaTrainer extends CopaProfile {
	online: boolean;
	registeredAt?: string;
	card?: CopaTrainerCard;
	badges: CopaRegion[];
	goldNickname?: boolean;
	achievements?: string[];
	titles?: string[];
	stats?: { total: number, wins: number, losses: number };
}
class CopaAccountError extends Error {
	readonly status: number;
	constructor(message: string, status: number) { super(message); this.status = status; }
}
declare global {
	interface Window {
		CopaAccounts?: typeof CopaAccounts;
	}
}
export const CopaAccounts = new class {
	private generation = 0;
	private read(): Session | null {
		try {
			const data = JSON.parse(localStorage.getItem(storageKey) || 'null');
			return data && typeof data.name === 'string' && /^[a-zA-Z0-9_-]{43}$/.test(data.token) &&
				data.expires > Date.now() ? data : null;
		} catch {
			return null;
		}
	}
	private async request(action: string, data: object, token?: string) {
		const response = await fetch(endpoint + action, { method: 'POST', credentials: 'omit', cache: 'no-store',
			headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
			body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
		const result = await response.json();
		if (!response.ok)
			throw new CopaAccountError(result.error || 'Contas temporariamente indisponíveis.', response.status);
		return result;
	}
	async profile(name: string): Promise<CopaProfile | null> {
		return (await this.request('profile', { name })).member;
	}
	async trainer(name: string): Promise<CopaTrainer | null> {
		return (await this.request('trainer', { name })).trainer;
	}
	ownsProfile(name: string) {
		const session = this.read();
		return !!(Config.copaRinhaLocalNames && session && toID(session.name) === toID(name) &&
			toID(session.name) === PS.user.userid && PS.user.named);
	}
	async saveTrainer(card: Pick<CopaTrainerCard, 'bio' | 'banner'>): Promise<CopaTrainerCard> {
		const session = this.read();
		if (!session || !this.ownsProfile(session.name)) throw new Error('Entre com sua conta Copa Rinha.');
		return (await this.request('edit-trainer', { card }, session.token)).card;
	}
	async saveNicknameColor(color: string | null) {
		const session = this.read();
		if (!session || !this.ownsProfile(session.name)) throw new Error('Entre com sua conta Copa Rinha.');
		await this.request('nickname-color', { color }, session.token);
		window.CopaRinhaPresence?.refresh();
	}
	async savePartner(partner: CopaPartner | null) {
		const session = this.read();
		if (!Config.copaRinhaLocalNames || !session || toID(session.name) !== PS.user.userid) {
			throw new Error('Entre com sua conta Copa Rinha para salvar o parceiro.');
		}
		await this.request('partner', { partner }, session.token);
		window.CopaRinhaPresence?.refresh();
	}

	async resume() {
		if (!Config.copaRinhaLocalNames)
			return;
		const session = this.read();
		if (!session) {
			PS.user.updateLogin({ name: CopaRinhaLocalNames.read(), error: 'Entre com sua conta exclusiva da Copa Rinha.' });
			return;
		}
		await this.bind(session);
	}
	begin(name: string) {
		const session = this.read();
		if (session?.name.toLowerCase().replace(/ /g, '') === name.toLowerCase().replace(/ /g, '')) {
			void this.bind(session);
		} else
			PS.user.updateLogin({ name, error: 'Entre ou registre uma conta exclusiva da Copa Rinha.' });
	}
	async authenticate(action: 'login' | 'register' | 'recover', name: string, password: string, recovery?: string) {
		if (!Config.copaRinhaLocalNames || PS.user.loggingIn)
			return;
		name = PS.user.validateName(name).replace(/ +/g, ' ');
		const generation = this.generation;
		PS.user.loggingIn = name || 'Conta Copa';
		PS.user.update(null);
		try {
			const session = await this.request(action, { name, password, recovery }) as Session;
			if (generation !== this.generation) {
				void this.request('logout', {}, session.token).catch(() => {});
				return;
			}
			// Persist only the opaque session; passwords never enter storage or WS.
			localStorage.setItem(storageKey, JSON.stringify(session));
			await this.bind(session);
		} catch (error) {
			CopaRinhaLocalNames.reject(error instanceof Error ? error.message : 'Não foi possível entrar.');
		}
	}
	private async bind(session: Session) {
		const generation = ++this.generation;
		const challenge = PS.user.challstr;
		try {
			if (!PS.connection?.connected || !challenge)
				throw new Error('Aguarde a conexão com o servidor.');
			const grant = await this.request('grant', { challenge }, session.token);
			if (generation !== this.generation || PS.user.challstr !== challenge || !PS.connection?.connected)
				return;

			CopaRinhaLocalNames.clearPending();
			CopaRinhaLocalNames.pending = grant.name;
			PS.user.loggingIn = grant.name;
			PS.user.update(null);
			// The marker is public. The server consumes a one-use grant bound to the
			// native, random connection challenge. No bearer token goes into chat logs.
			CopaRinhaLocalNames.timer = setTimeout(() => CopaRinhaLocalNames.reject('O servidor não confirmou a conta.'), 15000);
			PS.send(`/trn ${grant.name},0,copa`);
		} catch (error) {
			if (generation === this.generation) {
				// A rejected token cannot be resumed. Network/storage outages keep it for retry.
				if (error instanceof CopaAccountError && error.status === 401 && this.read()?.token === session.token) {
					localStorage.removeItem(storageKey);
				}
				CopaRinhaLocalNames.reject(error instanceof Error ? error.message : 'Falha ao recuperar a conta.');
			}
		}
	}
	disconnect() { this.generation++; }
	async logout() {
		const session = this.read();
		try {
			if (session) {
				try { await this.request('logout', {}, session.token); } catch (error) {
					// 401 confirms that the server has already invalidated this session.
					if (!(error instanceof CopaAccountError) || error.status !== 401) throw error;
				}
			}
			localStorage.removeItem(storageKey);
			CopaRinhaLocalNames.forget();
			this.disconnect();
			PS.connection?.disconnect();
			PS.user.setName('Guest', false, PS.user.avatar);
		} catch {
			PS.alert('Não foi possível invalidar a sessão. Tente sair novamente.');
		}
	}
};
window.CopaAccounts = CopaAccounts;
window.addEventListener('storage', event => {
	if (!Config.copaRinhaLocalNames || event.key !== storageKey)
		return;
	if (!event.newValue) {
		CopaAccounts.disconnect();
		PS.connection?.disconnect();
		PS.user.setName('Guest', false, PS.user.avatar);
	} else
		void CopaAccounts.resume();
});
