<script lang="ts">
	import type { LoadWeek } from '$lib/server/queries';

	type Props = {
		weeks: LoadWeek[];
		externalMetric: 'tonnage' | 'volume';
	};
	let { weeks, externalMetric }: Props = $props();

	// Recorta semanas vazias do começo (antes da 1ª sessão) pra não poluir
	const trimmed = $derived.by(() => {
		const firstActive = weeks.findIndex((w) => w.sessions > 0);
		return firstActive < 0 ? weeks : weeks.slice(firstActive);
	});

	// Valor da carga externa conforme a métrica escolhida
	function extOf(w: LoadWeek): number {
		return externalMetric === 'tonnage' ? w.tonnage : w.repVolume;
	}

	const extLabel = $derived(
		externalMetric === 'tonnage' ? 'peso levantado (séries × reps × kg)' : 'volume (séries × reps)'
	);
	const extUnit = $derived(externalMetric === 'tonnage' ? 'kg' : 'reps');

	// Geometria do SVG
	const W = 640;
	const H = 200;
	const PAD = { top: 18, right: 16, bottom: 28, left: 16 };
	const plotW = W - PAD.left - PAD.right;
	const plotH = H - PAD.top - PAD.bottom;

	const geom = $derived.by(() => {
		const pts = trimmed;
		if (pts.length === 0) {
			return { extPath: '', intPath: '', extDots: [], intDots: [], xLabels: [] };
		}
		const extMax = Math.max(1, ...pts.map(extOf));
		const intMax = Math.max(1, ...pts.map((w) => w.internalLoad));
		const n = pts.length;
		const xAt = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
		const extYAt = (v: number) => PAD.top + plotH - (v / extMax) * plotH;
		const intYAt = (v: number) => PAD.top + plotH - (v / intMax) * plotH;

		const extPath = pts.map((w, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${extYAt(extOf(w))}`).join(' ');
		const intPath = pts
			.map((w, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${intYAt(w.internalLoad)}`)
			.join(' ');

		const extDots = pts
			.map((w, i) => ({ x: xAt(i), y: extYAt(extOf(w)), v: extOf(w), has: w.sessions > 0 }))
			.filter((d) => d.has);
		const intDots = pts
			.map((w, i) => ({ x: xAt(i), y: intYAt(w.internalLoad), v: w.internalLoad, has: w.internalLoad > 0 }))
			.filter((d) => d.has);

		// Labels do eixo X — no máximo ~6 pra não embolar
		const step = Math.max(1, Math.ceil(n / 6));
		const xLabels = pts
			.map((w, i) => ({ x: xAt(i), label: w.weekLabel, i }))
			.filter((_, i) => i % step === 0 || i === n - 1);

		return { extPath, intPath, extDots, intDots, xLabels };
	});

	// Valores mais recentes (última semana com dados)
	const latest = $derived.by(() => {
		const withData = [...trimmed].reverse().find((w) => w.sessions > 0);
		return withData ?? null;
	});

	// Veredito de adaptação — compara metade recente vs metade antiga das
	// semanas COM treino. Precisa de >= 4 semanas com dados.
	const verdict = $derived.by(() => {
		const active = trimmed.filter((w) => w.sessions > 0 && extOf(w) > 0 && w.internalLoad > 0);
		if (active.length < 4) {
			return {
				label: 'Coletando dados',
				tone: 'neutral' as const,
				detail: `Precisa de ~4 semanas de treino pra avaliar tendência (tem ${active.length}).`
			};
		}
		const mid = Math.floor(active.length / 2);
		const older = active.slice(0, mid);
		const recent = active.slice(mid);
		const avg = (arr: LoadWeek[], f: (w: LoadWeek) => number) =>
			arr.reduce((s, w) => s + f(w), 0) / arr.length;

		const extOld = avg(older, extOf);
		const extRecent = avg(recent, extOf);
		const extChange = extOld > 0 ? ((extRecent - extOld) / extOld) * 100 : 0;

		// "custo" interno por unidade de carga externa (quanto o corpo paga)
		const costOld = avg(older, (w) => w.internalLoad / Math.max(1, extOf(w)));
		const costRecent = avg(recent, (w) => w.internalLoad / Math.max(1, extOf(w)));
		const costChange = costOld > 0 ? ((costRecent - costOld) / costOld) * 100 : 0;

		if (extChange >= 8 && costChange <= 5) {
			return {
				label: 'Adaptando bem 📈',
				tone: 'success' as const,
				detail: `Carga externa +${extChange.toFixed(0)}% e o custo interno se manteve. O corpo aguenta mais trabalho pelo mesmo esforço.`
			};
		}
		if (extChange >= 8 && costChange > 20) {
			return {
				label: 'Carga subindo rápido ⚠',
				tone: 'warn' as const,
				detail: `Carga +${extChange.toFixed(0)}% mas o custo interno subiu ${costChange.toFixed(0)}%. Atenção à fadiga acumulada.`
			};
		}
		if (Math.abs(extChange) < 8 && costChange <= -8) {
			return {
				label: 'Condicionando 💪',
				tone: 'success' as const,
				detail: `Mesma carga externa, custo interno ${Math.abs(costChange).toFixed(0)}% menor. Sinal claro de condicionamento.`
			};
		}
		if (extChange <= -15) {
			return {
				label: 'Volume caindo ↓',
				tone: 'warn' as const,
				detail: `Carga externa ${extChange.toFixed(0)}%. Pausa, lesão ou desmotivação? Vale conversar.`
			};
		}
		return {
			label: 'Estável',
			tone: 'neutral' as const,
			detail: 'Carga e esforço consistentes nas últimas semanas.'
		};
	});

	const toneColor = $derived(
		verdict.tone === 'success'
			? 'var(--success)'
			: verdict.tone === 'warn'
				? 'var(--warn)'
				: 'var(--ink-2)'
	);
	const toneBg = $derived(
		verdict.tone === 'success'
			? 'var(--success-dim)'
			: verdict.tone === 'warn'
				? 'var(--warn-dim)'
				: 'var(--bg-3)'
	);

	function fmt(n: number): string {
		if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
		return String(Math.round(n));
	}
</script>

<div class="lc">
	<!-- Legenda + valores recentes -->
	<div class="lc-head">
		<div class="lc-legend">
			<span class="lc-leg">
				<span class="lc-swatch" style="background:var(--accent)"></span>
				Carga externa — {extLabel}
			</span>
			<span class="lc-leg">
				<span class="lc-swatch" style="background:var(--warn)"></span>
				Carga interna — esforço (PSE × tempo)
			</span>
		</div>
		{#if latest}
			<div class="lc-latest">
				<div class="lc-latest-item">
					<span class="num" style="color:var(--accent)">{fmt(extOf(latest))}</span>
					<span class="lc-latest-unit">{extUnit}/sem</span>
				</div>
				<div class="lc-latest-sep"></div>
				<div class="lc-latest-item">
					<span class="num" style="color:var(--warn)">{fmt(latest.internalLoad)}</span>
					<span class="lc-latest-unit">UA/sem</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Gráfico -->
	<svg viewBox="0 0 {W} {H}" class="lc-svg" preserveAspectRatio="none" role="img" aria-label="Gráfico de evolução de carga">
		<!-- Linhas de grade horizontais -->
		{#each [0, 0.25, 0.5, 0.75, 1] as g (g)}
			<line
				x1={PAD.left}
				x2={W - PAD.right}
				y1={PAD.top + g * plotH}
				y2={PAD.top + g * plotH}
				stroke="var(--ink-line)"
				stroke-width="1"
				stroke-dasharray={g === 1 ? '0' : '2 4'}
				opacity={g === 1 ? 0.6 : 0.3}
			/>
		{/each}

		<!-- Linha carga externa -->
		<path d={geom.extPath} fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
		{#each geom.extDots as d (d.x)}
			<circle cx={d.x} cy={d.y} r="3" fill="var(--accent)" stroke="var(--bg-2)" stroke-width="1.5" />
		{/each}

		<!-- Linha carga interna -->
		<path d={geom.intPath} fill="none" stroke="var(--warn)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="5 3" />
		{#each geom.intDots as d (d.x)}
			<circle cx={d.x} cy={d.y} r="3" fill="var(--warn)" stroke="var(--bg-2)" stroke-width="1.5" />
		{/each}

		<!-- Labels do eixo X -->
		{#each geom.xLabels as xl (xl.i)}
			<text x={xl.x} y={H - 8} fill="var(--ink-3)" font-size="11" font-family="var(--font-mono)" text-anchor="middle">{xl.label}</text>
		{/each}
	</svg>

	<!-- Veredito de adaptação -->
	<div class="lc-verdict" style="background:{toneBg};border-color:{toneColor}33">
		<span class="lc-verdict-label" style="color:{toneColor}">{verdict.label}</span>
		<span class="lc-verdict-detail">{verdict.detail}</span>
	</div>
</div>

<style>
	.lc {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.lc-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	.lc-legend {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.lc-leg {
		display: flex;
		align-items: center;
		gap: 8px;
		font: var(--body-sm);
		color: var(--ink-1);
	}
	.lc-swatch {
		width: 14px;
		height: 3px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.lc-latest {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.lc-latest-item {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}
	.lc-latest-item .num {
		font: 600 22px var(--font-mono);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.lc-latest-unit {
		font: var(--label-mono);
		color: var(--ink-3);
		margin-top: 3px;
	}
	.lc-latest-sep {
		width: 1px;
		height: 28px;
		background: var(--ink-line);
	}
	.lc-svg {
		width: 100%;
		height: 200px;
		display: block;
		overflow: visible;
	}
	.lc-verdict {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 12px 14px;
		border: 1px solid;
		border-radius: var(--r-2);
	}
	.lc-verdict-label {
		font: 600 14px var(--font-sans);
	}
	.lc-verdict-detail {
		font: var(--body-sm);
		color: var(--ink-2);
		line-height: 1.45;
	}
</style>
