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
if (copaAdminForm)
	copaAdminForm.onsubmit = event => {
		event.preventDefault();
		const button = copaAdminForm.querySelector('button')!;
		button.disabled = true;
		const result = document.getElementById('admin-result')!;
		result.textContent = '';
		copaAccountStatus.textContent = 'Processando…';
		void copaAccountRequest('admin', {
			action: copaInput('action').value,
			names: copaInput('names').value.split(/[\n,]/).map(name => name.trim()).filter(Boolean),
		}, copaInput('admin-key').value).then(value => {
			result.textContent = value.recovery ?
				`Código de recuperação (uso único): ${value.recovery}` :
				value.accounts ? value.accounts.map((account: {
					name: string,
					registered: boolean,
					disabled: boolean,
					sessions: number,
				}) => `${account.name} · ${account.registered ? 'registrado' : 'reservado'} · ` +
					`${account.disabled ? 'desativado' : 'ativo'} · ${account.sessions} sessões válidas`).join('\n') : 'Operação concluída.';
			copaAccountStatus.textContent = 'Concluído.';
		}).catch(error => { copaAccountStatus.textContent = error.message; }).then(() => { button.disabled = false; });
	};
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
