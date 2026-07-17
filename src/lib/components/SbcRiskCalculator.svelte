<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui';
	import { toast } from '$lib/components/ui/toast.svelte';
	import {
		stratifySbc,
		sbcCategoryLabel,
		type ErgSex,
		type SbcCategory
	} from '$lib/clinical/sbc-risk';

	// age/sex vêm do aluno; systolicBp pode vir da última avaliação física.
	// `submitName`: quando definido, o componente NÃO tem botão próprio de aplicar
	// — em vez disso emite o nível calculado num <input hidden name={submitName}>,
	// pra entrar no formulário que o contém (ex.: cadastro do aluno). Sem ele,
	// mostra o botão "Aplicar ao perfil" (ficha, via action applyCvRisk).
	let {
		age,
		sex,
		initialSystolicBp = null,
		submitName = undefined
	}: {
		age: number | null;
		sex: string;
		initialSystolicBp?: number | null;
		submitName?: string;
	} = $props();

	const isBioSex = (s: string): s is ErgSex => s === 'masculino' || s === 'feminino';

	// Entradas do escore.
	let totalCholesterol = $state<string>('');
	let hdl = $state<string>('');
	let systolicBp = $state<string>(initialSystolicBp != null ? String(initialSystolicBp) : '');
	let onBpMed = $state(false);
	let smoker = $state(false);
	let diabetes = $state(false);
	let establishedCvd = $state(false);
	let highRiskCondition = $state(false);
	let saving = $state(false);

	const num = (s: string) => {
		const n = parseFloat(String(s).replace(',', '.'));
		return Number.isFinite(n) ? n : null;
	};

	const CAT_COLOR: Record<SbcCategory, { color: string; bg: string }> = {
		baixo: { color: 'var(--success)', bg: 'var(--success-dim)' },
		intermediario: { color: 'var(--warn)', bg: 'var(--warn-dim)' },
		alto: { color: 'var(--danger)', bg: 'var(--danger-dim)' },
		muito_alto: { color: 'var(--danger)', bg: 'var(--danger-dim)' }
	};

	// Resultado reativo — só calcula com sexo biológico + exames + PAS preenchidos.
	const result = $derived.by(() => {
		const ct = num(totalCholesterol);
		const h = num(hdl);
		const pas = num(systolicBp);
		if (!isBioSex(sex) || age == null || !ct || !h || !pas) return null;
		return stratifySbc(
			{
				sex,
				age,
				totalCholesterol: ct,
				hdl: h,
				systolicBp: pas,
				onBpMed,
				smoker,
				diabetes
			},
			{ establishedCvd, highRiskCondition }
		);
	});
</script>

<div class="card" style="padding:24px">
	<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
		<div
			style="width:32px;height:32px;border-radius:var(--r-1);background:var(--accent-wash);display:flex;align-items:center;justify-content:center;color:var(--accent);font:600 15px var(--font-sans)"
		>
			♥
		</div>
		<div style="font:500 16px var(--font-sans);color:var(--ink-0)">
			Risco cardiovascular — SBC
		</div>
	</div>
	<div style="font:var(--label-mono);color:var(--ink-2);margin-bottom:16px">
		Escore de Risco Global (Framingham 2008) · 10 anos
	</div>

	{#if !isBioSex(sex)}
		<div style="font:var(--body-sm);color:var(--warn)">
			O escore exige sexo biológico (masculino/feminino). Ajuste o cadastro do aluno.
		</div>
	{:else if age == null}
		<div style="font:var(--body-sm);color:var(--warn)">
			Data de nascimento ausente — necessária para o escore.
		</div>
	{:else}
		<!-- Exames + parâmetros -->
		<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
			<div>
				<label class="lbl">Colesterol total (mg/dL)</label>
				<input class="inp" type="text" inputmode="decimal" placeholder="213" bind:value={totalCholesterol} />
			</div>
			<div>
				<label class="lbl">HDL (mg/dL)</label>
				<input class="inp" type="text" inputmode="decimal" placeholder="50" bind:value={hdl} />
			</div>
			<div>
				<label class="lbl">PA sistólica (mmHg)</label>
				<input class="inp" type="text" inputmode="decimal" placeholder="140" bind:value={systolicBp} />
			</div>
		</div>
		<div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:16px">
			<label class="chk"><input type="checkbox" bind:checked={onBpMed} /> Em anti-hipertensivo</label>
			<label class="chk"><input type="checkbox" bind:checked={smoker} /> Tabagista</label>
			<label class="chk"><input type="checkbox" bind:checked={diabetes} /> Diabetes</label>
		</div>
		<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
			<label class="chk">
				<input type="checkbox" bind:checked={establishedCvd} />
				Doença aterosclerótica estabelecida (IAM/AVC/DAP prévios) → muito alto
			</label>
			<label class="chk">
				<input type="checkbox" bind:checked={highRiskCondition} />
				Condição de alto risco (DRC, LDL≥190, aterosclerose subclínica…) → alto
			</label>
		</div>

		{#if result}
			{@const cc = CAT_COLOR[result.category]}
			<div
				style="display:flex;align-items:baseline;gap:12px;padding:14px 16px;border-radius:var(--r-2);background:{cc.bg};border:1px solid {cc.color};margin-bottom:12px"
			>
				<div style="font:600 28px var(--font-mono);color:{cc.color};font-variant-numeric:tabular-nums">
					{result.reclassified ? '—' : result.riskPct + '%'}
				</div>
				<div>
					<div style="font:600 14px var(--font-sans);color:{cc.color}">
						{sbcCategoryLabel(result.category)}
					</div>
					<div style="font:var(--label-mono);color:var(--ink-2)">risco em 10 anos</div>
				</div>
			</div>

			{#each result.notes as n, i (n + i)}
				<div style="font:var(--body-sm);color:var(--ink-2);margin-bottom:6px">• {n}</div>
			{/each}

			{#if submitName}
				<!-- Modo campo: emite o nível pro formulário que contém a calculadora. -->
				<input type="hidden" name={submitName} value={result.level} />
			{:else}
				<form
					method="POST"
					action="?/applyCvRisk"
					use:enhance={() => {
						saving = true;
						return async ({ result: r, update }) => {
							saving = false;
							if (r.type === 'success') toast.success('Risco aplicado ao perfil do aluno');
							else if (r.type === 'failure') toast.error('Falha ao salvar');
							await update({ reset: false });
						};
					}}
					style="margin-top:8px"
				>
					<input type="hidden" name="level" value={result.level} />
					<Button type="submit" size="sm" disabled={saving}>
						{saving ? 'Salvando…' : `Aplicar ao perfil (${sbcCategoryLabel(result.category)})`}
					</Button>
				</form>
			{/if}
		{:else if submitName}
			<!-- Sem exames ainda: submete 'baixo' como padrão (pode calcular na ficha). -->
			<input type="hidden" name={submitName} value="baixo" />
			<div style="font:var(--body-sm);color:var(--ink-2)">
				Preencha colesterol total, HDL e PA sistólica para calcular (ou deixe para a ficha do aluno).
			</div>
		{:else}
			<div style="font:var(--body-sm);color:var(--ink-2)">
				Preencha colesterol total, HDL e PA sistólica para calcular.
			</div>
		{/if}
	{/if}
</div>

<style>
	.chk {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font: var(--body-sm);
		color: var(--ink-1);
		cursor: pointer;
	}
	.chk input {
		accent-color: var(--accent);
	}
</style>
