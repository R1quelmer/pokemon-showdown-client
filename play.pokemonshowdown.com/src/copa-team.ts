/* Standalone sharing targets modern browsers with fetch and AbortSignal. */
/* eslint-disable no-restricted-syntax */
/** Public read-only viewer for unlisted shared teams. Untrusted values render as text. */
import { Dex } from './battle-dex';
import { Teams } from './battle-teams';
import { CopaSharedTeams, type CopaSharedTeam } from './copa-team-import';

function renderCopaTeam(shared: CopaSharedTeam) {
	const status = document.getElementById('team-status')!;
	document.title = `${shared.name || 'Time compartilhado'} — Copa Rinha II`;
	document.getElementById('team-name')!.textContent = shared.name || 'Time compartilhado';
	const date = new Date(shared.createdAt);
	document.getElementById('team-details')!.textContent = `Copa Rinha II · ${shared.sets.length} Pokémon · ID ${shared.id}` +
		(Number.isNaN(date.getTime()) ? '' : ` · ${date.toLocaleDateString('pt-BR')}`);
	const list = document.getElementById('pokemon-list')!;
	list.textContent = '';
	const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
		const element = document.createElement(tag);
		if (text !== undefined) element.textContent = text;
		return element;
	};
	shared.sets.forEach(set => {
		const species = Dex.species.get(set.species);
		const article = node('article'); article.className = 'pokemon-build';
		article.setAttribute('aria-label', `Build de ${species.name}`);
		const gender = ['M', 'F', 'N'].includes(set.gender || '') ? set.gender as Dex.GenderName : undefined;
		const sprite = Dex.getSpriteData(species.name, true, { gen: 9, shiny: !!set.shiny, gender });
		const image = node('img'); image.className = 'pokemon-sprite'; image.src = sprite.url;
		image.alt = `${species.name}${set.shiny ? ' shiny' : ''}`; image.width = sprite.w; image.height = sprite.h;
		image.referrerPolicy = 'no-referrer';
		const build = node('pre'), code = node('code');
		build.className = 'pokemon-export';
		// The native exporter owns all values, optional fields and line ordering.
		// Highlight text nodes only: nicknames and API data never become HTML.
		const lines = Teams.exportSet(set).replace(/\s+$/, '').split('\n');
		lines.forEach((line, index) => {
			const token = (text: string, className: string) => {
				const span = node('span', text); span.className = className; code.appendChild(span);
			};
			if (!index) {
				const item = line.lastIndexOf(' @ ');
				token(item < 0 ? line : line.slice(0, item), 'paste-name');
				if (item >= 0) {
					token(' @ ', 'paste-label'); token(line.slice(item + 3), 'paste-item');
				}
			} else if (line.startsWith('- ')) {
				token('- ', 'paste-label'); token(line.slice(2), 'paste-move');
			} else if (line.endsWith(' Nature')) {
				token(line.slice(0, -7), 'paste-nature'); token(' Nature', 'paste-label');
			} else {
				const colon = line.indexOf(': ');
				if (colon < 0) {
					code.appendChild(document.createTextNode(line));
				} else {
					token(line.slice(0, colon + 2), 'paste-label');
					const value = line.slice(colon + 2);
					if (line.startsWith('EVs: ') || line.startsWith('IVs: ')) {
						for (const part of value.split(/(\d+)/)) token(part, /^\d+$/.test(part) ? 'paste-number' : 'paste-stat');
					} else {
						token(value, line.startsWith('Ability: ') ? 'paste-ability' : 'paste-value');
					}
				}
			}
			if (index < lines.length - 1) code.appendChild(document.createTextNode('\n'));
		});
		build.appendChild(code); article.append(image, build); list.appendChild(article);
	});
	const exported = Teams.export(shared.sets);
	(document.getElementById('import-team') as HTMLAnchorElement).href = CopaSharedTeams.importURL(shared.id);
	const copy = async (value: string, success: string) => {
		try { await navigator.clipboard.writeText(value); status.textContent = success; } catch {
			status.textContent = 'Não foi possível copiar automaticamente. Selecione o texto do time ou copie o endereço da página.';
			list.focus();
			const range = document.createRange(); range.selectNodeContents(list);
			const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
		}
	};
	document.getElementById('copy-team')!.onclick = () => { void copy(exported, 'Time copiado.'); };
	document.getElementById('copy-team-link')!.onclick = () => { void copy(CopaSharedTeams.shareURL(shared.id), 'Link copiado.'); };
	document.getElementById('team-content')!.hidden = false;
	status.textContent = 'Time carregado.';
}

async function loadCopaTeam() {
	const status = document.getElementById('team-status')!;
	const input = document.getElementById('team-link') as HTMLInputElement;
	document.getElementById('open-team')!.onsubmit = event => {
		event.preventDefault();
		const id = CopaSharedTeams.idFromInput(input.value);
		if (!id) { status.textContent = 'Cole um link da Copa Rinha ou um identificador válido.'; return; }
		location.href = CopaSharedTeams.shareURL(id);
	};
	const id = new URLSearchParams(location.search).get('id');
	if (!id) return;
	if (!CopaSharedTeams.validID(id)) { status.textContent = 'Identificador de time inválido.'; return; }
	input.value = CopaSharedTeams.shareURL(id);
	status.textContent = 'Carregando time…';
	try {
		renderCopaTeam(await CopaSharedTeams.fetchTeam(id));
	} catch (error) {
		status.textContent = CopaSharedTeams.errorMessage(error);
	}
}
void loadCopaTeam();
