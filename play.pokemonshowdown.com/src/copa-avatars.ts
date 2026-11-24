/** Optional local artwork; a nickname/avatar association is not proof of identity. */
import { Config, PS } from './client-main';
import { toID } from './battle-dex';

declare global {
	interface Window {
		CopaRinhaAvatars?: typeof CopaRinhaAvatars;
	}
}

interface CopaAvatarManifest {
	version: 1;
	avatars: { [id: string]: { file: string } };
	participants: { [userid: string]: string };
}

export const CopaRinhaAvatars = new class {
	private loading: Promise<void> | null = null;
	private participants: { [userid: string]: string } = Object.create(null);
	private images: { [id: string]: string } = Object.create(null);

	isLocal() {
		return !!(Config.copaRinhaLocalNames &&
			Config.defaultserver?.host === 'copa-rinha-showdown.onrender.com' && Config.defaultserver.port === 443 &&
			(!Config.server || Config.server.host === 'copa-rinha-showdown.onrender.com') &&
			(!PS.server || PS.server.host === 'copa-rinha-showdown.onrender.com'));
	}

	/** Reject external URLs, SVG, traversal and unexpected manifest structures. */
	validate(data: unknown): CopaAvatarManifest | null {
		if (!data || typeof data !== 'object') return null;
		const value = data as Partial<CopaAvatarManifest>;
		if (value.version !== 1 || !value.avatars || !value.participants ||
			typeof value.avatars !== 'object' || typeof value.participants !== 'object' ||
			Array.isArray(value.avatars) || Array.isArray(value.participants)) return null;
		if (Object.keys(value.avatars).length > 64 || Object.keys(value.participants).length > 256) return null;
		for (const [id, avatar] of Object.entries(value.avatars)) {
			if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) || !avatar || typeof avatar !== 'object' ||
				typeof avatar.file !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.(?:png|gif|webp)$/i.test(avatar.file) ||
				avatar.file.includes('..')) return null;
		}
		for (const [userid, id] of Object.entries(value.participants)) {
			if (!/^[a-z0-9]{1,18}$/.test(userid) || typeof id !== 'string' ||
				!Object.keys(value.avatars).includes(id)) return null;
		}
		return value as CopaAvatarManifest;
	}

	load() {
		if (!this.isLocal() || typeof window.fetch !== 'function' || typeof Image === 'undefined') return Promise.resolve();
		if (this.loading) return this.loading;
		this.loading = window.fetch('/assets/copa-rinha/avatars.json', { credentials: 'omit' }).then(response => (
			response.ok ? response.json() : null
		)).then(data => {
			const manifest = this.validate(data);
			if (!manifest) return;
			const images: { [id: string]: string } = Object.create(null);
			return Promise.all(Object.entries(manifest.avatars).map(([id, avatar]) => new Promise<void>(resolve => {
				const image = new Image();
				const url = '/assets/copa-rinha/avatars/' + avatar.file;
				image.onload = () => {
					if (image.naturalWidth > 0 && image.naturalHeight > 0) images[id] = url;
					resolve();
				};
				image.onerror = () => resolve();
				image.src = url;
			}))).then(() => {
				this.images = images;
				this.participants = manifest.participants;
				PS.update();
			});
		}).catch(() => {});
		return this.loading;
	}

	resolve(participant: string): string | null {
		if (!this.isLocal()) return null;
		const id = this.participants[toID(participant)];
		return id && this.images[id] || null;
	}
};
