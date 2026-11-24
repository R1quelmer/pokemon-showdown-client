/* Standalone sharing targets modern browsers with fetch and AbortSignal. */
/* eslint-disable no-restricted-syntax, no-restricted-globals */
/** Unlisted Copa Rinha team links. Native Teams/PSTeams own serialization and storage. */
import { Teams } from './battle-teams';
import { Dex } from './battle-dex';
import { PS, type Team, type RoomID } from './client-main';

export interface CopaSharedTeam {
	id: string;
	name: string;
	format: 'gen9coparinhanationaldexza';
	createdAt: string;
	packedTeam: string;
	importText: string;
	sets: Dex.PokemonSet[];
}

export const CopaSharedTeams = new class {
	readonly api = 'https://copa-rinha-showdown.onrender.com/copa-rinha/teams/';
	readonly format = 'gen9coparinhanationaldexza';
	validID(id: string) {
		return /^[A-Za-z0-9_-]{32}$/.test(id);
	}
	idFromInput(input: string): string | null {
		const value = input.trim();
		if (this.validID(value)) return value;
		try {
			const url = new URL(value, location.href);
			if ((url.origin !== location.origin && url.origin !== 'https://copa-rinha-client.onrender.com') ||
				url.username || url.password || url.pathname !== '/team.html' || url.searchParams.getAll('id').length !== 1) {
				return null;
			}
			const id = url.searchParams.get('id') || '';
			return this.validID(id) ? id : null;
		} catch {
			return null;
		}
	}
	parse(data: unknown, id: string): CopaSharedTeam {
		if (!data || typeof data !== 'object') throw new Error('Resposta de time inválida.');
		const value = data as Record<string, unknown>;
		if (!this.validID(id) || value.id !== id || value.format !== this.format ||
			typeof value.packedTeam !== 'string' || value.packedTeam.length > 65536 || !value.packedTeam) {
			throw new Error('Resposta de time inválida.');
		}
		const sets = Teams.unpack(value.packedTeam);
		if (!sets?.length || sets.length > 300 || sets.some(set =>
			!Dex.species.get(set.species).exists || !Array.isArray(set.moves) || set.moves.length > 24
		)) throw new Error('O time compartilhado não pôde ser interpretado.');
		return {
			id, format: this.format, name: typeof value.name === 'string' ? value.name.slice(0, 100) : '',
			createdAt: typeof value.createdAt === 'string' ? value.createdAt.slice(0, 40) : '',
			packedTeam: Teams.pack(sets), importText: Teams.export(sets), sets,
		};
	}
	errorMessage(error: unknown) {
		const messages = [
			'Identificador de time inválido.', 'Resposta de time inválida.',
			'Time não encontrado. Confira o link de compartilhamento.', 'Armazenamento temporariamente indisponível. Tente novamente em instantes.',
			'Não foi possível carregar o time.',
		];
		return error instanceof Error && messages.includes(error.message) ? error.message :
			'Não foi possível acessar o time. Tente novamente em instantes.';
	}
	async fetchTeam(id: string): Promise<CopaSharedTeam> {
		if (!this.validID(id)) throw new Error('Identificador de time inválido.');
		const response = await fetch(this.api + id, { credentials: 'omit', signal: AbortSignal.timeout(20000) });
		if (response.status === 404) throw new Error('Time não encontrado. Confira o link de compartilhamento.');
		if (response.status === 400) throw new Error('Identificador de time inválido.');
		if (!response.ok) throw new Error('Armazenamento temporariamente indisponível. Tente novamente em instantes.');
		const body = await response.text();
		if (body.length > 262144) throw new Error('Resposta de time inválida.');
		let data;
		try { data = JSON.parse(body); } catch { throw new Error('Resposta de time inválida.'); }
		return this.parse(data, id);
	}
	shareURL(id: string) {
		if (!this.validID(id)) throw new Error('Identificador de time inválido.');
		const url = new URL('team.html', location.href);
		url.search = `?id=${id}`;
		url.hash = '';
		return url.href;
	}
	importURL(id: string) {
		if (!this.validID(id)) throw new Error('Identificador de time inválido.');
		return `testclient-new.html?~~copa-rinha-showdown.onrender.com:443&copa-rinha=1&import-team=${id}#teambuilder`;
	}
	withoutImport(search: string) {
		// Keep the upstream ?~~host:port syntax byte-for-byte; URLSearchParams would encode it.
		const parts = search.replace(/^\?/, '').split('&').filter(part => !new URLSearchParams(part).has('import-team'));
		return parts.filter(Boolean).length ? '?' + parts.filter(Boolean).join('&') : '';
	}
	async importFromURL() {
		if (typeof PS === 'undefined' || !Dex.isCopaRinha()) return;
		const id = new URLSearchParams(location.search).get('import-team');
		if (!id) return;
		try {
			const shared = await this.fetchTeam(id);
			let team = PS.teams.list.find(existing =>
				existing.format === shared.format && existing.packedTeam === shared.packedTeam);
			if (!team) {
				team = {
					name: (shared.name || 'Time compartilhado').replace(/[|\r\n]/g, ' ').replace(/\//g, '∕'),
					format: shared.format as Team['format'], folder: '', packedTeam: shared.packedTeam,
					key: '', iconCache: null, isBox: shared.sets.length > 6,
				};
				PS.teams.unshift(team);
				PS.teams.save();
			}
			PS.join(`team-${team.key}` as RoomID);
			const url = new URL(location.href);
			url.search = this.withoutImport(url.search);
			history.replaceState(history.state, '', url.pathname + url.search + url.hash);
		} catch (error) {
			PS.alert(this.errorMessage(error));
		}
	}
};
