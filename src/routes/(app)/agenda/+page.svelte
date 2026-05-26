<script lang="ts">
	import { Button, Eyebrow } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const weekStart = $derived(new Date(data.weekStart));
	const appointments = $derived(data.appointments);

	const HOURS = Array.from({ length: 13 }, (_, i) => 7 + i);
	const slot = 60;

	const days = $derived(
		Array.from({ length: 7 }, (_, i) => {
			const d = new Date(weekStart);
			d.setDate(weekStart.getDate() + i);
			return d;
		})
	);

	const today = new Date();
	const todayIdx = $derived(
		days.findIndex((d) => d.toDateString() === today.toDateString())
	);

	function eventsForDay(idx: number) {
		const day = days[idx];
		if (!day) return [];
		return appointments.filter((a) => {
			const at = new Date(a.startsAt);
			return at.toDateString() === day.toDateString();
		});
	}

	function topPx(at: string) {
		const d = new Date(at);
		const hour = d.getHours() + d.getMinutes() / 60;
		return Math.max(0, (hour - HOURS[0]!) * slot);
	}

	function colorForType(t: string) {
		if (t === 'avaliacao') return 'var(--info)';
		if (t === 'reabilitacao') return 'var(--warn)';
		return 'var(--accent)';
	}

	const summaryItems = $derived([
		{ l: 'Sessões agendadas', v: String(appointments.length) },
		{ l: 'Avaliações', v: String(appointments.filter((a) => a.type === 'avaliacao').length) },
		{ l: 'Reabilitação', v: String(appointments.filter((a) => a.type === 'reabilitacao').length) },
		{ l: 'Treinos', v: String(appointments.filter((a) => a.type === 'treino').length) }
	]);

	let view = $state<'day' | 'week' | 'month'>('week');
	const monthLabel = $derived(weekStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
	const rangeLabel = $derived(
		`${weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')} — ${days[6]?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}`
	);
</script>

<div class="ag-shell" style="overflow:hidden;height:100vh;display:flex;flex-direction:column">
	<header
		class="ag-header"
		style="padding:24px 32px 18px;display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid var(--ink-line);background:var(--bg-1)"
	>
		<div>
			<Eyebrow>{monthLabel}</Eyebrow>
			<div style="display:flex;align-items:baseline;gap:12px;margin-top:6px">
				<h1 style="font:var(--display-md);margin:0;letter-spacing:-0.025em">Agenda</h1>
				<span style="font:var(--body-lg);color:var(--ink-2)">{rangeLabel}</span>
			</div>
		</div>
		<div style="display:flex;gap:14px;align-items:center">
			<div
				style="display:flex;gap:4px;padding:4px;background:var(--bg-2);border:1px solid var(--ink-line);border-radius:var(--r-2)"
			>
				{#each ['day', 'week', 'month'] as v (v)}
					<button
						onclick={() => (view = v as typeof view)}
						style="padding:6px 12px;font:var(--label-mono);cursor:pointer;border:0;background:{view ===
						v
							? 'var(--bg-4)'
							: 'transparent'};color:{view === v ? 'var(--ink-0)' : 'var(--ink-2)'};border-radius:6px;text-transform:uppercase"
					>{v === 'day' ? 'DIA' : v === 'week' ? 'SEMANA' : 'MÊS'}</button>
				{/each}
			</div>
			<Button onclick={() => goto('/agenda/nova')}>+ Nova sessão</Button>
		</div>
	</header>

	<div class="ag-body" style="display:flex;flex:1;overflow:hidden">
		<aside
			class="ag-aside"
			style="width:260px;padding:24px;border-right:1px solid var(--ink-line);overflow-y:auto;background:var(--bg-1)"
		>
			<Eyebrow>Esta semana</Eyebrow>
			<div style="margin-top:10px">
				{#each summaryItems as x (x.l)}
					<div
						style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--ink-line)"
					>
						<span style="font:var(--body-sm);color:var(--ink-2)">{x.l}</span>
						<span class="num" style="font:500 14px var(--font-mono);color:var(--ink-0)">{x.v}</span>
					</div>
				{/each}
			</div>

			<div style="margin-top:24px">
				<Eyebrow>Tipos</Eyebrow>
				<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
					{#each [{ c: 'var(--accent)', l: 'Treino' }, { c: 'var(--info)', l: 'Avaliação' }, { c: 'var(--warn)', l: 'Reabilitação' }] as x (x.l)}
						<div style="display:flex;align-items:center;gap:10px">
							<span style="width:10px;height:10px;background:{x.c};border-radius:2px"></span>
							<span style="flex:1;font:var(--body-sm);color:var(--ink-1)">{x.l}</span>
						</div>
					{/each}
				</div>
			</div>
		</aside>

		<div class="ag-grid-wrap" style="flex:1;overflow:auto;background:var(--bg-0)">
			<div
				class="ag-day-head"
				style="display:grid;grid-template-columns:60px repeat(7, 1fr);position:sticky;top:0;background:var(--bg-1);border-bottom:1px solid var(--ink-line-2);z-index:2"
			>
				<div></div>
				{#each days as d, i (i)}
					{@const isToday = i === todayIdx}
					<div
						style="padding:14px 8px;text-align:center;border-left:1px solid var(--ink-line);background:{isToday
							? 'var(--accent-wash)'
							: 'transparent'}"
					>
						<div style="font:var(--label-mono);color:{isToday ? 'var(--accent)' : 'var(--ink-3)'}">
							{d.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase().replace('.', '')}
						</div>
						<div
							class="num"
							style="font:600 22px var(--font-mono);color:{isToday ? 'var(--accent)' : 'var(--ink-0)'};margin-top:2px"
						>{String(d.getDate()).padStart(2, '0')}</div>
					</div>
				{/each}
			</div>

			<div class="ag-day-body" style="display:grid;grid-template-columns:60px repeat(7, 1fr);position:relative">
				<div>
					{#each HOURS as h (h)}
						<div style="height:{slot}px;padding:4px 8px 0;text-align:right">
							<span class="num" style="font:var(--label-mono);color:var(--ink-3)">{String(h).padStart(2, '0')}:00</span>
						</div>
					{/each}
				</div>
				{#each days as _, di (di)}
					{@const events = eventsForDay(di)}
					<div
						style="position:relative;border-left:1px solid var(--ink-line);background:{di === todayIdx
							? 'rgba(167,139,250,0.025)'
							: 'transparent'}"
					>
						{#each HOURS as h (h)}
							<div style="height:{slot}px;border-bottom:1px solid var(--ink-line)"></div>
						{/each}
						{#each events as e (e.id)}
							{@const top = topPx(e.startsAt)}
							{@const height = (e.durationMinutes / 60) * slot - 4}
							{@const color = colorForType(e.type)}
							<button
								type="button"
								onclick={() => goto(`/agenda/${e.id}/editar`)}
								style="all:unset;cursor:pointer;position:absolute;left:4px;right:4px;top:{top + 2}px;height:{height}px;background:var(--bg-2);border:1px solid {color};border-left:3px solid {color};border-radius:6px;padding:6px 8px;overflow:hidden;box-sizing:border-box"
							>
								<div class="num" style="font:500 11px var(--font-mono);color:{color}">
									{new Date(e.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
								</div>
								<div
									style="font:600 12px var(--font-sans);color:var(--ink-0);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
								>{e.studentName ?? e.label ?? 'Sessão'}</div>
								{#if height > 50 && e.label}
									<div
										style="font:var(--body-sm);color:var(--ink-2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
									>{e.label}</div>
								{/if}
							</button>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	@media (max-width: 1023px) {
		.ag-shell {
			height: auto !important;
			min-height: 100vh;
		}
		.ag-header {
			padding: 14px 16px !important;
			flex-direction: column !important;
			align-items: stretch !important;
			gap: 12px !important;
		}
		.ag-header :global(h1) {
			font-size: 22px !important;
		}
		.ag-aside {
			display: none;
		}
		.ag-body {
			overflow: visible !important;
		}
		/* Timeline rola horizontalmente em mobile, com dias largura mínima */
		.ag-grid-wrap {
			overflow-x: auto;
		}
		.ag-day-head,
		.ag-day-body {
			grid-template-columns: 48px repeat(7, minmax(110px, 1fr)) !important;
			min-width: 820px;
		}
	}
</style>
