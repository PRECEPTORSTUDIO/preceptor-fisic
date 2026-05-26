<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="aluno-shell">
	<div class="aluno-frame">
		{@render children()}
	</div>
</div>

<style>
	.aluno-shell {
		min-height: 100vh;
		background: radial-gradient(ellipse at top, #1a1530 0%, var(--bg-0) 60%);
		display: flex;
		justify-content: center;
		align-items: stretch;
	}
	.aluno-frame {
		width: 100%;
		max-width: 480px;
		min-height: 100vh;
		background: var(--bg-0);
		color: var(--ink-0);
		font: var(--body);
		position: relative;
		display: flex;
		flex-direction: column;
		view-transition-name: aluno-content;
	}
	/* Tablet — frame um pouco maior, com borda decorativa */
	@media (min-width: 600px) and (max-width: 1023px) {
		.aluno-frame {
			border-left: 1px solid var(--ink-line);
			border-right: 1px solid var(--ink-line);
			margin: 24px 0;
			border-radius: var(--r-4);
			overflow: hidden;
			box-shadow: var(--shadow-pop);
		}
	}
	/* Desktop — modo dashboard, expande a frame e remove a "cara de celular" */
	@media (min-width: 1024px) {
		.aluno-shell {
			padding: 32px 24px 48px;
		}
		.aluno-frame {
			max-width: 1180px;
			min-height: calc(100vh - 80px);
			background: transparent;
			border-radius: 0;
		}
	}
</style>
