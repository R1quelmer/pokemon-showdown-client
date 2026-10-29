/* This standalone page targets modern browsers with fetch and AbortSignal. */
/* eslint-disable no-restricted-syntax, no-restricted-globals */
/** Standalone Copa Rinha viewer using the native Showdown battle engine. */
import { Battle } from './battle';
import type { ID } from './battle-dex';

async function loadCopaReplay() {
	const status = document.getElementById('status')!;
	const id = new URLSearchParams(location.search).get('id') || '';
	if (!/^[A-Za-z0-9_-]{32}$/.test(id)) {
		status.textContent = 'ID de replay inválido.';
		return;
	}
	try {
		const response = await fetch(`https://copa-rinha-showdown.onrender.com/copa-rinha/replays/${id}`, {
			credentials: 'omit', signal: AbortSignal.timeout(30000),
		});
		if (!response.ok) {
			throw new Error(response.status === 404 ? 'Replay não encontrado.' : 'Falha ao carregar replay.');
		}
		const replay = await response.json();
		if (replay.id !== id || replay.format !== 'gen9coparinhanationaldexza' ||
			typeof replay.log !== 'string' || !Array.isArray(replay.players)) {
			throw new Error('Replay inválido.');
		}
		document.getElementById('metadata')!.textContent = `${replay.players.map((p: { name: string }) => p.name).join(' × ')} · ${replay.format} · ${new Date(replay.createdAt).toLocaleString('pt-BR')} · ${replay.winner ? `Vencedor: ${replay.winner}` : 'Empate'} · ${replay.turns} turnos · ${replay.endType}`;
		const battle = new Battle({
			id: `battle-${replay.format}-${id}` as ID, $frame: $('.battle'), $logFrame: $('.battle-log'),
			log: replay.log.split('\n'), isReplay: true, paused: true,
		});
		battle.scene.setMute(true);
		document.getElementById('controls')!.hidden = false;
		document.getElementById('play')!.onclick = () => battle.play();
		document.getElementById('pause')!.onclick = () => battle.pause();
		document.getElementById('restart')!.onclick = () => { battle.seekTurn(0); battle.pause(); };
		document.getElementById('next')!.onclick = () => { battle.seekTurn(battle.turn + 1); };
		document.getElementById('speed')!.onchange = event => {
			battle.messageFadeTime = 300 / Number((event.target as HTMLSelectElement).value);
		};
		document.getElementById('copy')!.onclick = async () => {
			try {
				await navigator.clipboard.writeText(location.href);
				status.textContent = 'Link copiado.';
			} catch {
				status.textContent = `Copie o endereço: ${location.href}`;
			}
		};
		const resize = () => {
			const width = document.getElementById('viewport')!.clientWidth;
			const scale = Math.min(1, width / 640);
			document.getElementById('arena')!.style.transform = `scale(${scale})`;
			document.getElementById('viewport')!.style.height = `${360 * scale}px`;
		};
		window.addEventListener('resize', resize);
		resize();
		status.textContent = 'Replay carregado.';
	} catch (error) {
		const known = error instanceof Error && ['Replay não encontrado.', 'Replay inválido.'].includes(error.message);
		status.textContent = known ? error.message : 'Não foi possível carregar o replay. Tente novamente.';
	}
}
void loadCopaReplay();
