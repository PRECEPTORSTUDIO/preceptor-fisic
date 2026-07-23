<script lang="ts">
	import { page } from '$app/state';
	import NavIcon from './nav-icon.svelte';
	import Avatar from '../ui/avatar.svelte';

	type Props = {
		open: boolean;
		onClose: () => void;
		userName?: string;
		userCref?: string;
		isAdmin?: boolean;
	};
	let {
		open,
		onClose,
		userName = 'Profissional',
		userCref = '—',
		isAdmin = false
	}: Props = $props();

	type Item = {
		id: string;
		label: string;
		sub: string;
		icon: 'home' | 'alunos' | 'planos' | 'exer' | 'msgs' | 'agenda' | 'aluno' | 'crm' | 'config' | 'logout' | 'feedback';
		href: string;
		danger?: boolean;
	};

	const ITEMS: Item[] = $derived([
		// CRM admin-only — esconde pra usuários não-admin
		...(isAdmin
			? [
					{
						id: 'crm',
						label: 'CRM',
						sub: 'Funil de aquisição (admin)',
						icon: 'crm' as const,
						href: '/crm'
					}
				]
			: []),
		{ id: 'exer', label: 'Exercícios', sub: 'Catálogo + cadastro', icon: 'exer', href: '/exercicios' },
		{ id: 'msgs', label: 'Mensagens', sub: 'Conversas com alunos', icon: 'msgs', href: '/mensagens' },
		{ id: 'feedback', label: 'Feedback', sub: 'Reporte bugs e ideias', icon: 'feedback', href: '/feedback' },
		{ id: 'config', label: 'Configurações', sub: 'Perfil e preferências', icon: 'config', href: '/configuracoes' }
	]);

	const isActive = (href: string) => page.url.pathname.startsWith(href);
</script>

{#if open}
	<div
		class="m-sheet-backdrop"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
		role="button"
		tabindex="-1"
		aria-label="Fechar menu"
	></div>

	<div class="m-sheet" role="dialog" aria-modal="true" aria-label="Mais opções">
		<div class="m-sheet__handle"></div>

		<div class="m-sheet__userpill">
			<Avatar name={userName} size={36} />
			<div style="flex:1;min-width:0">
				<div class="m-sheet__name">{userName}</div>
				<div class="m-sheet__cref">{userCref}</div>
			</div>
			<div class="m-sheet__online"></div>
		</div>

		<nav class="m-sheet__nav">
			{#each ITEMS as it, i (it.id)}
				{@const on = isActive(it.href)}
				<a
					class="m-sheet__item"
					class:on
					class:danger={it.danger}
					href={it.href}
					onclick={onClose}
					style="--stagger:{i}"
				>
					<span class="m-sheet__ico" class:on>
						<NavIcon name={it.icon} size={20} />
					</span>
					<div style="flex:1;min-width:0">
						<div class="m-sheet__lbl">{it.label}</div>
						<div class="m-sheet__sub">{it.sub}</div>
					</div>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-3)">
						<path d="M9 18l6-6-6-6" />
					</svg>
				</a>
			{/each}
			<!-- Logout via POST (anti-CSRF) — GET /logout foi removido -->
			<form method="POST" action="/logout" style="display:contents">
				<button
					class="m-sheet__item danger"
					type="submit"
					onclick={onClose}
					style="width:100%;text-align:left;background:transparent;border:0;cursor:pointer;font:inherit"
				>
					<span class="m-sheet__ico">
						<NavIcon name="logout" size={20} />
					</span>
					<div style="flex:1;min-width:0">
						<div class="m-sheet__lbl">Sair</div>
						<div class="m-sheet__sub">Encerrar sessão</div>
					</div>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-3)">
						<path d="M9 18l6-6-6-6" />
					</svg>
				</button>
			</form>
		</nav>

		<div class="m-sheet__footer">
			<span class="m-sheet__dot"></span>
			DADOS NA REGIÃO BR · CONFORMIDADE LGPD
		</div>
	</div>
{/if}

<style>
	.m-sheet-backdrop {
		display: none;
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		z-index: 60;
		animation: m-fade 200ms var(--ease);
	}
	.m-sheet {
		display: none;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 70;
		background: var(--bg-1);
		border-top: 1px solid var(--ink-line);
		border-radius: 20px 20px 0 0;
		padding: 12px 16px calc(20px + env(safe-area-inset-bottom, 0px));
		box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5);
		animation: m-slide 240ms var(--ease);
		max-height: 85vh;
		overflow-y: auto;
	}
	@media (max-width: 1023px) {
		.m-sheet-backdrop,
		.m-sheet {
			display: block;
		}
	}

	@keyframes m-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes m-slide {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	.m-sheet__handle {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--ink-line-2);
		margin: 0 auto 16px;
	}
	.m-sheet__userpill {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		margin-bottom: 14px;
	}
	.m-sheet__name {
		font: 500 14px var(--font-sans);
		color: var(--ink-0);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.m-sheet__cref {
		font: 500 10px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-top: 2px;
	}
	.m-sheet__online {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--success);
		box-shadow: 0 0 6px var(--success);
	}
	.m-sheet__nav {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.m-sheet__item {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 12px;
		text-decoration: none;
		color: var(--ink-1);
		border-radius: var(--r-2);
		transition:
			background 140ms var(--ease),
			transform 140ms var(--ease);
		/* Cascata: itens entram logo após o slide do sheet */
		animation: pf-fade-up 260ms var(--ease) backwards;
		animation-delay: calc(80ms + var(--stagger, 0) * 35ms);
	}
	.m-sheet__item:active {
		transform: scale(0.98);
	}
	.m-sheet__item:hover,
	.m-sheet__item.on {
		background: var(--bg-2);
		color: var(--ink-0);
	}
	.m-sheet__item.danger {
		color: var(--danger);
	}
	.m-sheet__ico {
		color: var(--ink-2);
		display: flex;
	}
	.m-sheet__ico.on {
		color: var(--accent);
	}
	.m-sheet__item.danger .m-sheet__ico {
		color: var(--danger);
	}
	.m-sheet__lbl {
		font: 500 14px var(--font-sans);
		color: inherit;
	}
	.m-sheet__sub {
		font: 400 12px var(--font-sans);
		color: var(--ink-3);
		margin-top: 2px;
	}
	.m-sheet__footer {
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px solid var(--ink-line);
		font: var(--label-mono);
		color: var(--ink-3);
		text-align: center;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 8px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.m-sheet__dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
	}
</style>
