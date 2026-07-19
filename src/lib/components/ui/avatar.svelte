<script lang="ts">
	type Props = { name: string; size?: number; src?: string };
	let { name, size = 40, src }: Props = $props();

	const initials = $derived(
		(name || '?')
			.split(' ')
			.map((s) => s[0] ?? '')
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);
	const hue = $derived((name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360);
	const bg = $derived(
		src
			? `url(${src}) center/cover`
			: `linear-gradient(135deg, hsl(${hue}, 30%, var(--avatar-l1)), hsl(${(hue + 40) % 360}, 25%, var(--avatar-l2)))`
	);
</script>

<div
	style="width:{size}px;height:{size}px;border-radius:50%;background:{bg};display:flex;align-items:center;justify-content:center;font:500 {Math.round(
		size * 0.36
	)}px/1 var(--font-sans);color:var(--ink-0);flex-shrink:0;border:1px solid var(--ink-line-2)"
>
	{#if !src}{initials}{/if}
</div>
