<script lang="ts">
	type IconName = 'home' | 'alunos' | 'planos' | 'exer' | 'msgs' | 'agenda' | 'aluno' | 'crm' | 'config' | 'logout' | 'feedback' | 'guia';
	type Props = { name: IconName; size?: number };
	let { name, size = 18 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
	{#if name === 'home'}
		<path d="M3 11l9-7 9 7" />
		<path d="M5 10v9h14v-9" />
		<path d="M10 19v-5h4v5" />
	{:else if name === 'alunos'}
		<circle cx="9" cy="8" r="3.2" />
		<path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
		<circle cx="16.5" cy="9" r="2.6" />
		<path d="M14.5 19c.2-2.2 1.7-4 4-4 1.5 0 2.6.7 3.4 1.7" />
	{:else if name === 'planos'}
		<rect x="4" y="4" width="16" height="16" rx="2" />
		<path d="M8 9h8M8 13h8M8 17h5" />
	{:else if name === 'exer'}
		<path d="M5 8v8M5 12h2M19 8v8M19 12h-2M7 10v4M17 10v4M9 11v2M15 11v2M11 11.5h2" />
	{:else if name === 'msgs'}
		<path d="M4 6h16v10H10l-4 4v-4H4z" />
	{:else if name === 'agenda'}
		<rect x="4" y="5" width="16" height="15" rx="2" />
		<path d="M4 9h16M9 3v4M15 3v4" />
		<circle cx="9" cy="13" r=".8" fill="currentColor" />
		<circle cx="13" cy="13" r=".8" fill="currentColor" />
		<circle cx="9" cy="17" r=".8" fill="currentColor" />
	{:else if name === 'aluno'}
		<rect x="6" y="3" width="12" height="18" rx="2.5" />
		<path d="M10 18h4" />
	{:else if name === 'crm'}
		<!-- Funil/pipeline: linhas convergindo pra um ponto -->
		<path d="M3 5h18l-7 8v6l-4-2v-4z" />
	{:else if name === 'config'}
		<circle cx="12" cy="12" r="3" />
		<path d="M19.4 14.5c.1-.4.1-.8.1-1.2v-1c0-.4 0-.8-.1-1.2l2-1.5-2-3.4-2.4.7c-.6-.5-1.3-.9-2-1.2L14.5 3h-5l-.5 2.5c-.7.3-1.4.7-2 1.2l-2.4-.7-2 3.4 2 1.5c-.1.4-.1.8-.1 1.2v1c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-.7c.6.5 1.3.9 2 1.2L9.5 21h5l.5-2.5c.7-.3 1.4-.7 2-1.2l2.4.7 2-3.4z" />
	{:else if name === 'logout'}
		<path d="M14 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" />
		<path d="M9 12h13l-3-3M22 12l-3 3" />
	{:else if name === 'feedback'}
		<!-- Balão de conversa com coração (feedback) -->
		<path d="M4 5h16v11H9l-5 4z" />
		<path d="M12 8.5c-1-1.2-3-.6-3 1 0 1.3 1.6 2.2 3 3.2 1.4-1 3-1.9 3-3.2 0-1.6-2-2.2-3-1z" />
	{:else if name === 'guia'}
		<!-- Livro aberto (guia de uso) -->
		<path d="M12 6c-1.5-1-3.5-1.5-5.5-1.5C5 4.5 4 4.7 4 4.7v13S5 17.5 6.5 17.5c2 0 4 .5 5.5 1.5" />
		<path d="M12 6c1.5-1 3.5-1.5 5.5-1.5C19 4.5 20 4.7 20 4.7v13S19 17.5 17.5 17.5c-2 0-4 .5-5.5 1.5z" />
	{/if}
</svg>
