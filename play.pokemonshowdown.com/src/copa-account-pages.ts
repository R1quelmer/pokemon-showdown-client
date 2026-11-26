/* eslint-disable no-restricted-globals */
/* eslint-disable no-restricted-syntax */
/** Standalone account pages intentionally do not load the battle/chat client. */
const copaAccountEndpoint = 'https://copa-rinha-showdown.onrender.com/copa-rinha/accounts/';
const copaAccountStatus = document.getElementById('admin-status')!;
const copaAdminForm = document.getElementById('admin-form') as HTMLFormElement | null;
const copaRecoverForm = document.getElementById('recover-form') as HTMLFormElement | null;
const copaInput = (id: string) => document.getElementById(id) as HTMLInputElement;
async function copaAccountRequest(action: string, body: object, adminKey?: string) {
	const response = await fetch(copaAccountEndpoint + action, { method: 'POST', credentials: 'omit', cache: 'no-store',
		headers: { 'Content-Type': 'application/json', ...(adminKey ? { Authorization: `Bearer ${adminKey}` } : {}) },
		body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
	const value = await response.json();
	if (!response.ok)
		throw new Error(value.error || 'Não foi possível concluir a solicitação.');
	return value;
}
if (copaAdminForm) {
	copaAdminForm.onsubmit = event => {
		event.preventDefault();
		const action = copaInput('action').value;
		const button = copaAdminForm.querySelector('button')!;
		button.disabled = true;
		const result = document.getElementById('admin-result')!;
		result.textContent = '';
		copaAccountStatus.textContent = 'Processando…';
		void copaAccountRequest('admin', {
			action,
			names: copaInput('names').value.split(/[\n,]/).map(name => name.trim()).filter(Boolean),
		}, copaInput('admin-key').value).then(value => {
			result.textContent = value.recovery ?
				`Código de recuperação (uso único): ${value.recovery}` :
				value.accounts ? value.accounts.map((account: {
					name: string,
					registered: boolean,
					disabled: boolean,
					sessions: number,
					badges?: string[],
				}) => `${account.name} · ${account.registered ? 'registrado' : 'reservado'} · ` +
					`${account.disabled ? 'desativado' : 'ativo'} · ${account.sessions} sessões válidas` +
					(account.badges?.length ? ` · Insígnias: ${account.badges.join(', ')}` : '')).join('\n') : 'Operação concluída.';
			copaAccountStatus.textContent = 'Concluído.';
		}).catch(error => { copaAccountStatus.textContent = error.message; }).then(() => { button.disabled = false; });
	};
}
interface CopaAdminTrainerProfile {
	name: string;
	region: string;
	dreamTeam: ({ species: string, shiny: boolean } | null)[];
	badges: string[];
	achievements: string[];
	titles: string[];
}
const competitiveLookup = document.querySelector<HTMLFormElement>('#competitive-lookup');
if (competitiveLookup) {
	const editor = document.querySelector<HTMLFormElement>('#competitive-editor')!;
	const user = document.querySelector<HTMLSelectElement>('#competitive-user')!;
	const competitiveStatus = document.querySelector<HTMLElement>('#competitive-status')!;
	const loadAccounts = document.querySelector<HTMLButtonElement>('#competitive-accounts')!;
	const origin = editor.querySelector<HTMLSelectElement>('select[name=origin]')!;
	const badges = editor.querySelector('#competitive-badges .badge-regions-grid')!;
	const hall = editor.querySelector('#competitive-hall')!;
	const regions = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Hisui', 'Paldea'];
	const selectAll = copaInput('badge-select-all');
	const checkboxes = regions.map(region => {
		origin.add(new Option(region, region));
		const label = document.createElement('label');
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.name = 'completed';
		checkbox.value = region;
		label.append(checkbox, region);
		badges.append(label);
		return checkbox;
	});
	const updateSelectAll = () => {
		const checked = checkboxes.filter(checkbox => checkbox.checked).length;
		selectAll.checked = checked === checkboxes.length;
		selectAll.indeterminate = checked > 0 && checked < checkboxes.length;
	};
	for (const checkbox of checkboxes) checkbox.onchange = updateSelectAll;
	selectAll.onchange = () => {
		for (const checkbox of checkboxes) checkbox.checked = selectAll.checked;
	};

	type SpeciesChoice = { id: string, name: string, sprite: string };
	let catalog: SpeciesChoice[] = [];
	let localSprites: Record<string, unknown> = {};
	const speciesID = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
	const findSpecies = (value: string) => catalog.find(entry => entry.id === speciesID(value));
	const sprite = (image: HTMLImageElement, entry: SpeciesChoice, shiny: boolean) => {
		const variant = shiny ? '-shiny' : '';
		const local = `partner-za/${entry.id}${variant}.png`;
		const bw = `gen5${variant}/${entry.sprite}.png`;
		image.onerror = () => {
			image.onerror = null;
			image.src = `https://play.pokemonshowdown.com/sprites/${bw}`;
		};
		image.src = Array.isArray(localSprites[local]) ? `assets/copa-rinha/${local}` :
			`https://play.pokemonshowdown.com/sprites/dex${variant}/${entry.sprite}.png`;
	};

	const slots = Array.from({ length: 6 }, (_, index) => {
		const row = document.createElement('div');
		row.className = 'competitive-slot';
		const label = document.createElement('label');
		label.textContent = `Pokémon ${index + 1}`;
		const species = document.createElement('input');
		species.maxLength = 48;
		species.autocomplete = 'off';
		label.append(species);
		const shinyLabel = document.createElement('label');
		const shiny = document.createElement('input');
		shiny.type = 'checkbox';
		shinyLabel.append(shiny, ' Shiny');
		const preview = document.createElement('img');
		preview.alt = '';
		preview.className = 'competitive-preview';
		const suggestions = document.createElement('div');
		suggestions.className = 'competitive-suggestions';
		suggestions.hidden = true;
		const updatePreview = () => {
			const entry = findSpecies(species.value);
			preview.hidden = !entry;
			if (entry) {
				sprite(preview, entry, shiny.checked);
				preview.alt = entry.name + (shiny.checked ? ' · Shiny' : '');
			}
		};
		const suggest = () => {
			const query = speciesID(species.value);
			suggestions.replaceChildren();
			const matches = query ? catalog.filter(entry => entry.id.includes(query)).slice(0, 8) : [];
			matches.forEach(entry => {
				const button = document.createElement('button');
				button.type = 'button';
				const icon = document.createElement('img');
				icon.alt = '';
				sprite(icon, entry, shiny.checked);
				button.append(icon, entry.name);
				button.onclick = () => {
					species.value = entry.name;
					species.setCustomValidity('');
					species.focus();
					suggestions.hidden = true;
					updatePreview();
				};
				suggestions.append(button);
			});
			suggestions.hidden = !matches.length;
		};
		species.oninput = () => {
			species.setCustomValidity('');
			updatePreview();
			suggest();
		};
		species.onfocus = suggest;
		shiny.onchange = updatePreview;
		row.addEventListener('focusout', event => {
			if (!row.contains(event.relatedTarget as Node | null)) suggestions.hidden = true;
		});
		row.onkeydown = event => {
			if (event.key === 'Escape') {
				species.focus();
				suggestions.hidden = true;
			}
		};
		row.append(label, shinyLabel, preview, suggestions);
		hall.append(row);
		return { species, shiny, updatePreview, suggestions };
	});
	let loaded = '';
	const field = (name: string) => editor.elements.namedItem(name) as HTMLTextAreaElement;
	const admin = async (body: object) => {
		const key = copaInput('admin-key').value;
		if (!key) throw new Error('Informe a chave administrativa.');
		return copaAccountRequest('admin', body, key);
	};
	const run = async (buttons: HTMLButtonElement[], work: () => Promise<void>) => {
		buttons.forEach(button => { button.disabled = true; });
		competitiveStatus.textContent = 'Processando…';
		try {
			await work();
			competitiveStatus.textContent = 'Concluído.';
		} catch (error) {
			competitiveStatus.textContent = (error as Error).message;
		} finally {
			buttons.forEach(button => { button.disabled = false; });
		}
	};
	const buttons = Array.from(competitiveLookup.querySelectorAll('button'))
		.concat(Array.from(editor.querySelectorAll('button')));
	const hideEditor = () => {
		loaded = '';
		editor.hidden = true;
	};
	user.onchange = hideEditor;
	loadAccounts.onclick = () => {
		hideEditor();
		void run(buttons, async () => {
			const { accounts } = await admin({ action: 'list' }) as {
				accounts: { registered: boolean, name: string }[],
			};
			user.replaceChildren(new Option('Selecione uma conta', ''));
			for (const account of accounts.filter(row => row.registered).sort((a, b) => a.name.localeCompare(b.name))) {
				user.add(new Option(account.name, account.name));
			}
		});
	};
	competitiveLookup.onsubmit = event => {
		event.preventDefault();
		const name = user.value;
		hideEditor();
		void run(buttons, async () => {
			const { profile } = await admin({ action: 'get-trainer', name }) as { profile: CopaAdminTrainerProfile };
			if (!catalog.length) {
				const [result, crops] = await Promise.all([
					admin({ action: 'trainer-species' }) as Promise<{ species: SpeciesChoice[] }>,
					fetch('assets/copa-rinha/profile-crops.json').then(response => response.json()).catch(() => ({})),
				]);
				if (!catalog.length) catalog = result.species;
				localSprites = crops;
			}
			if (user.value !== name) return;
			loaded = name;
			document.querySelector('#competitive-name')!.textContent = profile.name;
			origin.value = profile.region;
			slots.forEach(({ species, shiny, updatePreview, suggestions }, index) => {
				const slot = profile.dreamTeam[index];
				species.value = findSpecies(slot?.species || '')?.name || slot?.species || '';
				species.setCustomValidity('');
				suggestions.hidden = true;
				shiny.checked = !!slot?.shiny;
				updatePreview();
			});
			for (const checkbox of badges.querySelectorAll<HTMLInputElement>('input')) {
				checkbox.checked = profile.badges.includes(checkbox.value);
			}
			updateSelectAll();
			field('achievements').value = profile.achievements.join('\n');
			field('titles').value = profile.titles.join('\n');
			editor.hidden = false;
		});
	};
	editor.onsubmit = event => {
		event.preventDefault();
		if (!loaded || user.value !== loaded) return;
		const invalid = slots.find(({ species }) => species.value.trim() && !findSpecies(species.value));
		if (invalid) {
			invalid.species.setCustomValidity('Escolha uma espécie ou forma válida.');
			invalid.species.reportValidity();
			return;
		}
		const lines = (name: string) => field(name).value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
		const profile = {
			region: origin.value,
			dreamTeam: slots.map(({ species, shiny }) => species.value.trim() ?
				{ species: findSpecies(species.value)!.id, shiny: shiny.checked } : null),
			badges: new FormData(editor).getAll('completed'),
			achievements: lines('achievements'),
			titles: lines('titles'),
		};
		void run(buttons, async () => { await admin({ action: 'save-trainer', name: loaded, profile }); });
	};
}
if (copaRecoverForm)
	copaRecoverForm.onsubmit = event => {
		event.preventDefault();
		const button = copaRecoverForm.querySelector('button')!;
		button.disabled = true;
		void copaAccountRequest('recover', {
			recovery: copaInput('recovery').value, password: copaInput('new-password').value,
		}).then(value => {
			localStorage.setItem('copa-rinha:account-session:v1', JSON.stringify(value));
			location.href = '/copa-rinha.html';
		}).catch(error => { copaAccountStatus.textContent = error.message; }).then(() => {
			copaInput('new-password').value = '';
			copaInput('recovery').value = '';
			button.disabled = false;
		});
	};
