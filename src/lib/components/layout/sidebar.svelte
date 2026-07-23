<script lang="ts">
	import { page } from '$app/state';
	import Avatar from '../ui/avatar.svelte';
		import NavIcon from './nav-icon.svelte';
	import { BrandMark } from '$lib/components/ui';

	type NavItem = {
		id: string;
		label: string;
		icon: 'home' | 'alunos' | 'planos' | 'exer' | 'msgs' | 'agenda' | 'aluno' | 'crm' | 'config' | 'logout' | 'feedback';
		href: string;
		count?: number;
		badge?: number;
	};

	type Props = {
		showUser?: boolean;
		showBadges?: boolean;
		dense?: boolean;
		accentLogo?: boolean;
		userName?: string;
		userCref?: string;
		studentsCount?: number;
		unreadMessages?: number;
		newLeadsCount?: number;
		isAdmin?: boolean;
	};

	let {
		showUser = true,
		showBadges = true,
		dense = false,
		accentLogo = true,
		userName = 'Matheus Castro',
		userCref = 'CREF 123456-G',
		studentsCount = 0,
		unreadMessages = 0,
		newLeadsCount = 0,
		isAdmin = false
	}: Props = $props();

	const NAV_PRO = $derived<NavItem[]>([
		{ id: 'home', label: 'Visão geral', icon: 'home', href: '/dashboard' },
		// CRM aparece SÓ pro time admin do PreceptorFISIC
		...(isAdmin
			? [
					{
						id: 'crm',
						label: 'CRM',
						icon: 'crm' as const,
						href: '/crm',
						badge: newLeadsCount > 0 ? newLeadsCount : undefined
					}
				]
			: []),
		{
			id: 'alunos',
			label: 'Alunos',
			icon: 'alunos',
			href: '/alunos',
			count: studentsCount > 0 ? studentsCount : undefined
		},
		{ id: 'planos', label: 'Planos', icon: 'planos', href: '/planos' },
		{ id: 'exer', label: 'Exercícios', icon: 'exer', href: '/exercicios' },
		{
			id: 'msgs',
			label: 'Mensagens',
			icon: 'msgs',
			href: '/mensagens',
			badge: unreadMessages > 0 ? unreadMessages : undefined
		},
		{ id: 'agenda', label: 'Agenda', icon: 'agenda', href: '/agenda' }
	]);
	const NAV_FOOTER: NavItem[] = [
		{ id: 'assinatura', label: 'Assinatura', icon: 'planos', href: '/assinatura' },
		{ id: 'feedback', label: 'Feedback', icon: 'feedback', href: '/feedback' },
		{ id: 'config', label: 'Configurações', icon: 'config', href: '/configuracoes' }
	];

	const isActive = (href: string) => {
		const path = page.url.pathname;
		if (href === '/dashboard') return path === '/dashboard' || path === '/';
		return path.startsWith(href);
	};
</script>

<aside class="pf-sidebar" class:dense>
	{#if accentLogo}
		<div class="pf-sidebar__glow"></div>
	{/if}

	<a class="pf-sidebar__brand" href="/dashboard">
		<BrandMark size={30} />
		<div style="min-width:0">
			<div style="font:600 14px var(--font-sans);letter-spacing:-0.015em;color:var(--ink-0)">PreceptorFISIC</div>
			<div style="font:500 9.5px var(--font-mono);color:var(--ink-3);text-transform:uppercase;letter-spacing:0.1em;margin-top:2px">
				PRO · v3.2
			</div>
		</div>
	</a>

	<div class="pf-sidebar__section">Workspace</div>
	<nav class="pf-sidebar__nav">
		{#each NAV_PRO as it, i (it.id)}
			{@const on = isActive(it.href)}
			<a class="pf-navitem" class:on href={it.href} style="--stagger:{i}">
				<span class="pf-navitem__indicator" class:on></span>
				<span class="pf-navitem__icon" class:on>
					<NavIcon name={it.icon} size={18} />
				</span>
				<span style="flex:1">{it.label}</span>
				{#if showBadges && it.count != null && !it.badge}
					<span class="pf-navitem__count">{it.count}</span>
				{/if}
				{#if showBadges && it.badge}
					<span class="pf-navitem__badge">{it.badge}</span>
				{/if}
			</a>
		{/each}
	</nav>

	<div class="pf-sidebar__section pf-sidebar__section--footer">Conta</div>
	<nav class="pf-sidebar__nav">
		{#each NAV_FOOTER as it (it.id)}
			{@const on = isActive(it.href)}
			<a class="pf-navitem" class:on href={it.href}>
				<span class="pf-navitem__indicator" class:on></span>
				<span class="pf-navitem__icon" class:on>
					<NavIcon name={it.icon} size={18} />
				</span>
				<span style="flex:1">{it.label}</span>
			</a>
		{/each}
		<!-- Toggle de tema saiu daqui: a variante nav usava classes pf-navitem
		     com escopo DESTE componente e renderizava sem estilo dentro do
		     theme-toggle. Agora vive no canto superior direito do layout. -->
		<!-- Logout via POST (anti-CSRF) — GET /logout foi removido -->
		<form method="POST" action="/logout" style="display:contents">
			<button class="pf-navitem" type="submit" style="width:100%">
				<span class="pf-navitem__indicator"></span>
				<span class="pf-navitem__icon">
					<NavIcon name="logout" size={18} />
				</span>
				<span style="flex:1">Sair</span>
			</button>
		</form>
	</nav>

	{#if showUser}
		<div class="pf-userpill">
			<div style="position:relative">
				<Avatar name={userName} size={32} />
				<span class="pf-userpill__online"></span>
			</div>
			<div style="flex:1;min-width:0">
				<div style="font:500 12.5px var(--font-sans);color:var(--ink-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{userName}</div>
				<div style="font:500 10px var(--font-mono);color:var(--ink-3);text-transform:uppercase;letter-spacing:0.06em;margin-top:1px">{userCref}</div>
			</div>
			<button class="pf-userpill__menu" aria-label="Menu">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="6" r="1" />
					<circle cx="12" cy="12" r="1" />
					<circle cx="12" cy="18" r="1" />
				</svg>
			</button>
		</div>
	{/if}
</aside>

<style>
	.pf-sidebar {
		width: 240px;
		flex-shrink: 0;
		background: var(--bg-1);
		border-right: 1px solid var(--ink-line);
		display: flex;
		flex-direction: column;
		height: 100vh;
		padding: 18px 12px 14px;
		position: relative;
		overflow: hidden;
	}
	.pf-sidebar__glow {
		position: absolute;
		top: -80px;
		left: -40px;
		width: 220px;
		height: 220px;
		background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
		opacity: 0.6;
		pointer-events: none;
	}
	.pf-sidebar__brand {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 4px 8px 22px;
		position: relative;
		text-decoration: none;
	}
	.pf-sidebar__section {
		font: 500 9.5px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		padding: 6px 12px 8px;
	}
	.pf-sidebar__section--footer {
		padding: 12px 12px 8px;
		border-top: 1px solid var(--ink-line);
		margin-top: 8px;
	}
	.pf-sidebar__nav {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.pf-sidebar__nav:first-of-type {
		flex: 1;
	}
	.pf-navitem {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		background: transparent;
		border: 0;
		cursor: pointer;
		border-radius: var(--r-2);
		color: var(--ink-1);
		font: 400 13.5px var(--font-sans);
		letter-spacing: -0.005em;
		text-align: left;
		position: relative;
		transition:
			background 140ms var(--ease),
			color 140ms var(--ease);
		text-decoration: none;
		/* Entrada em cascata — cada item chega 30ms depois do anterior */
		animation: pf-fade-up var(--dur-2) var(--ease) backwards;
		animation-delay: calc(var(--stagger, 0) * 30ms);
	}
	.pf-sidebar.dense .pf-navitem {
		padding: 8px 12px;
	}
	.pf-navitem:hover {
		background: var(--bg-2);
		color: var(--ink-0);
	}
	.pf-navitem:hover .pf-navitem__icon {
		transform: translateX(2px) scale(1.08);
		color: var(--ink-0);
	}
	.pf-navitem:active {
		transform: scale(0.98);
	}
	.pf-navitem.on {
		background: var(--bg-3);
		color: var(--ink-0);
		font-weight: 500;
	}
	.pf-navitem__indicator {
		position: absolute;
		left: -12px;
		top: 50%;
		transform: translateY(-50%);
		width: 3px;
		height: 0;
		background: var(--accent);
		border-radius: 0 2px 2px 0;
		transition: height 260ms var(--ease-spring);
		box-shadow: 0 0 8px var(--accent-glow);
	}
	.pf-navitem__indicator.on {
		height: 18px;
	}
	.pf-navitem__icon {
		color: var(--ink-2);
		display: flex;
		transition:
			transform 200ms var(--ease-spring),
			color 140ms var(--ease);
	}
	.pf-navitem__icon.on {
		color: var(--accent);
	}
	.pf-navitem__count {
		font: 500 11px var(--font-mono);
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}
	.pf-navitem__badge {
		font-size: 10px;
		font-weight: 600;
		color: var(--accent-2);
		background: var(--accent-wash);
		padding: 2px 7px;
		border-radius: var(--r-pill);
		font-variant-numeric: tabular-nums;
		box-shadow: inset 0 0 0 1px rgba(167, 139, 250, 0.18);
		animation: pf-pop 320ms var(--ease-spring) both;
	}
	.pf-userpill {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 8px;
		margin-top: 10px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
	}
	.pf-userpill__online {
		position: absolute;
		bottom: -1px;
		right: -1px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--success);
		border: 2px solid var(--bg-2);
	}
	.pf-userpill__menu {
		background: transparent;
		border: 0;
		cursor: pointer;
		color: var(--ink-2);
		padding: 4px;
	}
	.pf-userpill__menu:hover {
		color: var(--ink-0);
	}
</style>
