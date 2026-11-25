/* eslint-disable no-restricted-syntax, no-restricted-globals */
/** Public replay discovery. No battle logs are downloaded until a replay is opened. */
interface CopaReplaySummary {
	id: string;
	format: string;
	createdAt: string;
	players: { name: string }[];
	winner: string;
	turns: number;
	endType: string;
}
export async function loadCopaReplayLibrary() {
	const library = document.getElementById('replay-library')!;
	library.hidden = false;
	const status = document.getElementById('library-status')!;
	const list = document.getElementById('replay-list')!;
	const more = document.getElementById('more-replays') as HTMLButtonElement;
	const filter = document.getElementById('replay-filter') as HTMLFormElement;
	const input = document.getElementById('replay-player') as HTMLInputElement;
	let cursor = '', player = '', loading = false;
	const seen = new Set<string>();
	const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text: string) => {
		const element = document.createElement(tag);
		element.textContent = text;
		return element;
	};
	const load = async (reset: boolean) => {
		if (loading) return;
		loading = true;
		more.disabled = true;
		const submit = filter.querySelector('button')!;
		submit.disabled = true;
		if (reset) {
			cursor = ''; seen.clear(); list.textContent = '';
		}
		status.textContent = 'Carregando replays públicos…';
		try {
			const query = new URLSearchParams();
			if (player) query.set('player', player);
			if (cursor) query.set('cursor', cursor);
			const response = await fetch(`https://copa-rinha-showdown.onrender.com/copa-rinha/replays/?${query}`, {
				credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000),
			});
			if (!response.ok) throw new Error('Unavailable');
			const data = await response.json();
			if (!data || !Array.isArray(data.replays) || data.replays.length > 20 ||
				(data.cursor !== null && (typeof data.cursor !== 'string' || data.cursor.length > 2048))) {
				throw new Error('Invalid page');
			}
			const entries: CopaReplaySummary[] = data.replays;
			for (const replay of entries) {
				if (!replay || !/^[A-Za-z0-9_-]{32}$/.test(replay.id) || replay.format !== 'gen9coparinhanationaldexza' ||
					!Array.isArray(replay.players) || replay.players.length !== 2 ||
					!replay.players.every(p => typeof p.name === 'string' && p.name.length <= 40) ||
					!Number.isFinite(Date.parse(replay.createdAt)) || typeof replay.winner !== 'string' ||
					!Number.isSafeInteger(replay.turns) || replay.turns < 0) throw new Error('Invalid replay');
			}
			entries.forEach(replay => {
				if (seen.has(replay.id)) return;
				seen.add(replay.id);
				const row = node('li', '');
				const link = node('a', replay.players.map(p => p.name).join(' × '));
				link.href = `/replay.html?id=${replay.id}`;
				const date = new Date(replay.createdAt).toLocaleString('pt-BR');
				const endings: Record<string, string> = { normal: 'Vitória', forfeit: 'Forfeit', tie: 'Empate', forced: 'Encerrada' };
				const details = node('p', `Copa Rinha II · ${date} · ${replay.turns} ${replay.turns === 1 ? 'turno' : 'turnos'} · ` +
					(endings[replay.endType] || 'Encerrada'));
				const actions = node('div', ''); actions.className = 'replay-actions';
				const watch = node('a', 'Assistir'); watch.href = link.href; watch.className = 'team-button';
				const copy = node('button', 'Copiar link'); copy.type = 'button'; copy.className = 'team-button';
				copy.onclick = async () => {
					try {
						await navigator.clipboard.writeText(link.href);
						status.textContent = 'Link copiado.';
					} catch { status.textContent = `Copie o link: ${link.href}`; }
				};
				actions.append(watch, copy);
				row.append(link, details, node('small', replay.winner ? `Vencedor: ${replay.winner}` : 'Empate'), actions);
				list.appendChild(row);
			});
			// Only one request runs at a time; the filter is disabled until it completes.
			// eslint-disable-next-line require-atomic-updates
			cursor = data.cursor || '';
			more.hidden = !cursor;
			more.textContent = 'Carregar mais';
			const countLabel = seen.size === 1 ? 'replay público exibido' : 'replays públicos exibidos';
			status.textContent = seen.size ? `${seen.size} ${countLabel}.` :
				'Nenhum replay público encontrado. Replays antigos sem visibilidade confirmada não aparecem aqui.';
		} catch {
			status.textContent = 'Não foi possível carregar a central. Você ainda pode abrir um replay pelo link ou ID.';
			more.hidden = false;
			more.textContent = 'Tentar novamente';
		} finally {
			// eslint-disable-next-line require-atomic-updates
			loading = false;
			more.disabled = false; submit.disabled = false;
		}
	};
	filter.onsubmit = event => {
		event.preventDefault();
		if (loading) return;
		player = input.value.toLowerCase().replace(/[^a-z0-9]/g, '');
		if (player.length > 18) { status.textContent = 'Nickname inválido.'; return; }
		void load(true);
	};
	more.onclick = () => { void load(false); };
	await load(true);
}
