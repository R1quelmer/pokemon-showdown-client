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
		document.getElementById('match-players')!.textContent =
			replay.players.map((p: { name: string }) => p.name).join(' × ');
		const endLabels: Record<string, string> = { normal: 'Vitória', forfeit: 'Forfeit', tie: 'Empate', forced: 'Encerrada' };
		document.getElementById('match-details')!.textContent =
			`National Dex ZA · ${new Date(replay.createdAt).toLocaleString('pt-BR')} · ` +
			`${replay.turns} ${replay.turns === 1 ? 'turno' : 'turnos'} · ${endLabels[replay.endType] || 'Encerrada'}`;
		document.getElementById('match-winner')!.textContent = replay.winner ? `Vencedor: ${replay.winner}` : 'Empate';
		document.getElementById('turn-total')!.textContent = `/ ${replay.turns}`;
		const battle = new Battle({
			id: `battle-${replay.format}-${id}` as ID, $frame: $('.battle'), $logFrame: $('.battle-log'),
			log: replay.log.split('\n'), isReplay: true, paused: true,
		});
		battle.scene.setMute(true);
		const play = document.getElementById('play')! as HTMLButtonElement;
		const pause = document.getElementById('pause')! as HTMLButtonElement;
		const previous = document.getElementById('previous')! as HTMLButtonElement;
		const next = document.getElementById('next')! as HTMLButtonElement;
		const end = document.getElementById('end')! as HTMLButtonElement;
		const viewpoint = document.getElementById('viewpoint')!;
		const turnInput = document.getElementById('turn')! as HTMLInputElement;
		const updateControls = () => {
			const atEnd = battle.atQueueEnd;
			play.hidden = !battle.paused && !atEnd;
			play.textContent = atEnd ? 'Reproduzir novamente' : 'Reproduzir';
			pause.hidden = battle.paused || atEnd;
			previous.disabled = battle.turn <= 0;
			next.disabled = end.disabled = atEnd;
			viewpoint.setAttribute('aria-pressed', String(battle.viewpointSwitched));
			const nearPlayer = replay.players[battle.viewpointSwitched ? 1 : 0]?.name || '';
			document.getElementById('perspective-name')!.textContent = nearPlayer;
			// Battle.turn is -1 before playback, 0 at preview, then the actual protocol turn.
			// Preserve an in-progress seek destination while the user is typing.
			if (document.activeElement !== turnInput) turnInput.value = String(Math.max(0, battle.turn));
			document.getElementById('turn-position')!.textContent =
				`Turno ${Math.max(0, battle.turn)} de ${replay.turns}${atEnd ? ' · Fim do replay' : ''}`;
		};
		battle.subscribe(updateControls);
		play.onclick = () => {
			if (battle.atQueueEnd) battle.reset();
			battle.play();
		};
		pause.onclick = () => battle.pause();
		document.getElementById('restart')!.onclick = () => battle.reset();
		next.onclick = () => battle.seekBy(1);
		previous.onclick = () => battle.seekBy(-1);
		end.onclick = () => battle.seekTurn(Infinity);
		viewpoint.onclick = () => {
			battle.switchViewpoint();
			updateControls();
		};
		document.getElementById('turn-form')!.onsubmit = event => {
			event.preventDefault();
			const input = document.getElementById('turn')! as HTMLInputElement;
			const turn = Number(input.value);
			if (!input.value.trim() || !Number.isSafeInteger(turn) || turn < 0) return;
			input.blur();
			battle.seekTurn(turn);
		};
		document.getElementById('speed')!.onchange = event => {
			// Same timing tables and acceleration update as replays-battle / replay-embed.
			const timings = {
				hyperfast: [40, 1], fast: [50, 1], normal: [300, 1], slow: [500, 1000], reallyslow: [1000, 3000],
			};
			const speed = (event.target as HTMLSelectElement).value as keyof typeof timings;
			if (!timings[speed]) return;
			[battle.messageFadeTime, battle.messageShownTime] = timings[speed];
			battle.scene.updateAcceleration();
		};
		document.getElementById('controls')!.hidden = false;
		updateControls();
		const feedback = document.getElementById('copy-feedback')!;
		let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
		const showFeedback = (message: string, temporary = false) => {
			clearTimeout(feedbackTimer);
			feedback.textContent = message;
			feedback.hidden = false;
			if (temporary) feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 2000);
		};
		document.getElementById('copy')!.onclick = async () => {
			try {
				await navigator.clipboard.writeText(location.href);
				showFeedback('Link copiado', true);
			} catch {
				showFeedback(`Copie o endereço: ${location.href}`);
			}
		};
		const resize = () => {
			const width = document.getElementById('viewport')!.clientWidth;
			const scale = width / 640;
			document.getElementById('arena')!.style.transform = `scale(${scale})`;
			document.getElementById('viewport')!.style.height = `${360 * scale}px`;
		};
		window.addEventListener('resize', resize);
		resize();
		status.textContent = 'Replay carregado.';
		status.className = 'sr-only';
	} catch (error) {
		const known = error instanceof Error && ['Replay não encontrado.', 'Replay inválido.'].includes(error.message);
		status.textContent = known ? error.message : 'Não foi possível carregar o replay. Tente novamente.';
	}
}
void loadCopaReplay();
