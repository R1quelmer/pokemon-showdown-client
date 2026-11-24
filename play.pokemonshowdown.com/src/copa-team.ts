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
	const stats: { [stat: string]: string } = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
	shared.sets.forEach(set => {
		const species = Dex.species.get(set.species);
		const article = node('article'); article.className = 'pokemon-build';
		const header = node('div'); header.className = 'pokemon-header';
		const gender = ['M', 'F', 'N'].includes(set.gender || '') ? set.gender as Dex.GenderName : undefined;
		const sprite = Dex.getSpriteData(species.name, true, { gen: 9, shiny: !!set.shiny, gender });
		const image = node('img'); image.className = 'pokemon-sprite'; image.src = sprite.url;
		image.alt = `${species.name}${set.shiny ? ' shiny' : ''}`; image.width = sprite.w; image.height = sprite.h;
		image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
		const heading = node('div');
		heading.appendChild(node('h2', set.name || species.name));
		if (set.name && set.name !== species.name) heading.appendChild(node('p', species.name));
		const traits = [set.gender, set.shiny ? 'Shiny' : '', `Nível ${set.level || 100}`];
		heading.appendChild(node('p', traits.filter(Boolean).join(' · ')));
		header.append(image, heading); article.appendChild(header);
		const details = node('dl');
		const row = (label: string, value: string | HTMLElement) => {
			const wrapper = node('div'), description = node('dd');
			if (typeof value === 'string') description.textContent = value; else description.appendChild(value);
			wrapper.append(node('dt', label), description); details.appendChild(wrapper);
		};
		row('Espécie', species.name);
		row('Item', set.item || 'Sem item');
		row('Habilidade', set.ability || species.abilities[0]);
		row('Natureza', set.nature || 'Hardy');
		row('Tera Type', set.teraType || species.types[0]);
		row('EVs', Object.entries(stats).map(([key, label]) => `${set.evs?.[key as 'hp'] || 0} ${label}`).join(' / '));
		row('IVs', Object.entries(stats).map(([key, label]) => `${set.ivs?.[key as 'hp'] ?? 31} ${label}`).join(' / '));
		const moves = node('ul'); moves.className = 'move-list';
		for (const move of set.moves) moves.appendChild(node('li', Dex.moves.get(move).name || move));
		row('Movimentos', moves);
		if (set.happiness !== undefined) row('Felicidade', String(set.happiness));
		if (set.gigantamax) row('Gigantamax', 'Sim');
		if (set.dynamaxLevel !== undefined) row('Nível Dynamax', String(set.dynamaxLevel));
		if (set.pokeball) row('Poké Ball', set.pokeball);
		if (set.hpType) row('Hidden Power', set.hpType);
		article.appendChild(details); list.appendChild(article);
	});
	const exported = Teams.export(shared.sets);
	(document.getElementById('team-export') as HTMLTextAreaElement).value = exported;
	(document.getElementById('import-team') as HTMLAnchorElement).href = CopaSharedTeams.importURL(shared.id);
	const copy = async (value: string, success: string) => {
		try { await navigator.clipboard.writeText(value); status.textContent = success; } catch {
			status.textContent = 'Não foi possível copiar automaticamente. Selecione o texto abaixo ou copie o endereço da página.';
			const textarea = document.getElementById('team-export') as HTMLTextAreaElement;
			textarea.focus(); textarea.select();
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
