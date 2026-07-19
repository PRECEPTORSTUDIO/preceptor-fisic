<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="legal-shell">
	<header class="legal-header">
		<a href="/" class="legal-brand">
			<div class="legal-logo">P</div>
			<div>
				<div class="legal-name">Preceptor Fisic</div>
				<div class="legal-sub">PRO · v3.2</div>
			</div>
		</a>
		<nav class="legal-nav">
			<a href="/legal/termos">Termos</a>
			<a href="/legal/privacidade">Privacidade</a>
			<a href="/login">Entrar</a>
		</nav>
	</header>

	<main class="legal-main">
		{@render children()}
	</main>

	<footer class="legal-footer">
		<span>© 2026 Preceptor Fisic</span>
		<span>Conformidade LGPD · sa-east-1</span>
	</footer>
</div>

<style>
	.legal-shell {
		min-height: 100vh;
		background: var(--bg-0);
		color: var(--ink-0);
		display: flex;
		flex-direction: column;
	}
	.legal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 32px;
		border-bottom: 1px solid var(--ink-line);
		background: var(--bg-1);
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.legal-brand {
		display: flex;
		align-items: center;
		gap: 11px;
		text-decoration: none;
	}
	.legal-logo {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: linear-gradient(135deg, var(--accent), var(--accent-dim));
		color: var(--on-accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font: 700 16px var(--font-sans);
		box-shadow: var(--glow-accent);
	}
	.legal-name {
		font: 600 15px var(--font-sans);
		color: var(--ink-0);
	}
	.legal-sub {
		font: 500 9.5px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-top: 1px;
	}
	.legal-nav {
		display: flex;
		gap: 24px;
	}
	.legal-nav a {
		font: 500 13.5px var(--font-sans);
		color: var(--ink-1);
		text-decoration: none;
		transition: color 140ms var(--ease);
	}
	.legal-nav a:hover {
		color: var(--ink-0);
	}
	.legal-main {
		flex: 1;
		max-width: 760px;
		margin: 0 auto;
		padding: 56px 32px 80px;
		width: 100%;
		box-sizing: border-box;
	}
	:global(.legal-main h1) {
		font: 500 36px var(--font-sans);
		letter-spacing: -0.025em;
		margin: 0 0 8px;
		color: var(--ink-0);
	}
	:global(.legal-main .legal-meta) {
		font: 500 11px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-bottom: 32px;
	}
	:global(.legal-main h2) {
		font: 500 22px var(--font-sans);
		letter-spacing: -0.018em;
		margin: 36px 0 12px;
		color: var(--ink-0);
	}
	:global(.legal-main h3) {
		font: 500 16px var(--font-sans);
		margin: 24px 0 8px;
		color: var(--ink-0);
	}
	:global(.legal-main p),
	:global(.legal-main li) {
		font: 400 15px/1.65 var(--font-sans);
		color: var(--ink-1);
	}
	:global(.legal-main p) {
		margin: 0 0 14px;
	}
	:global(.legal-main ul) {
		padding-left: 20px;
		margin: 8px 0 14px;
	}
	:global(.legal-main li) {
		margin-bottom: 6px;
	}
	:global(.legal-main strong) {
		color: var(--ink-0);
		font-weight: 600;
	}
	:global(.legal-main a) {
		color: var(--accent-2);
	}
	:global(.legal-main code) {
		font: 500 13px var(--font-mono);
		background: var(--bg-2);
		padding: 2px 6px;
		border-radius: 4px;
		color: var(--ink-0);
	}
	:global(.legal-main hr) {
		border: 0;
		border-top: 1px solid var(--ink-line);
		margin: 32px 0;
	}
	@media (max-width: 768px) {
		.legal-header {
			padding: 14px 16px;
		}
		.legal-nav {
			gap: 16px;
		}
		.legal-main {
			padding: 32px 16px 64px;
		}
		:global(.legal-main h1) {
			font-size: 28px;
		}
	}
	.legal-footer {
		padding: 24px 32px;
		border-top: 1px solid var(--ink-line);
		display: flex;
		justify-content: space-between;
		font: 500 11px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	@media (max-width: 768px) {
		.legal-footer {
			padding: 18px 16px;
			flex-direction: column;
			gap: 6px;
		}
	}
</style>
