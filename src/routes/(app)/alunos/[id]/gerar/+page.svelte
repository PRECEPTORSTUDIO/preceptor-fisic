<script lang="ts">
	import { Button, Avatar, Eyebrow, toast } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let {
		data,
		form
	}: { data: PageData; form: { error?: string; rateLimited?: boolean } | null } = $props();
	const detail = $derived(data.detail);
	const student = $derived(detail.student);
	const hp = $derived(detail.healthProfile);
	const diagnoses = $derived((hp?.diagnoses as { label: string }[] | null) ?? []);
	const meds = $derived((hp?.medications as { name: string; dose?: string; frequency?: string }[] | null) ?? []);
	const limitations = $derived(
		((hp?.injuries as { region: string; notes?: string }[] | null) ?? []).map(
			(i) => i.region + (i.notes ? ' · ' + i.notes : '')
		)
	);

	let phase = $state<'idle' | 'generating'>('idle');
	let notes = $state('');
	let msgIdx = $state(0);

	// Equipamento disponível — valores EN (mesmos do exercise_catalog),
	// labels PT. Pré-populado das preferências e persistido na action.
	const EQUIPMENT_OPTIONS: { value: string; label: string }[] = [
		{ value: 'body weight', label: 'Peso corporal' },
		{ value: 'dumbbell', label: 'Halteres' },
		{ value: 'barbell', label: 'Barra' },
		{ value: 'band', label: 'Elástico' },
		{ value: 'kettlebell', label: 'Kettlebell' },
		{ value: 'cable', label: 'Polia (cabo)' },
		{ value: 'leverage machine', label: 'Máquinas' },
		{ value: 'smith machine', label: 'Smith' },
		{ value: 'stability ball', label: 'Bola suíça' },
		{ value: 'bench', label: 'Banco' }
	];
	let equipment = $state<string[]>([...(data.detail.preferences?.equipmentAvailable ?? [])]);

	const messages = [
		'Carregando contexto clínico…',
		'Recuperando RAG (preferência ACSM)…',
		'PreceptorFISIC montando prescrição…',
		'Validando restrições clínicas…',
		'Finalizando…'
	];
	const HIGH_RISK_KEYS = ['cardiopatia', 'avc', 'dpoc', 'insuficiência', 'stent', 'diabetes tipo 1'];
	function isHighRisk(c: string) {
		return HIGH_RISK_KEYS.some((r) => c.toLowerCase().includes(r));
	}
	const hasHighRisk = $derived(diagnoses.some((d) => isHighRisk(d.label)));

	const age = $derived.by(() => {
		if (!student.birthDate) return null;
		const b = new Date(student.birthDate);
		const now = new Date();
		let a = now.getFullYear() - b.getFullYear();
		const m = now.getMonth() - b.getMonth();
		if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
		return a;
	});

	const goalsList = $derived((detail.preferences?.goals as string[] | null) ?? []);
	const GOAL_LABELS: Record<string, string> = {
		emagrecimento: 'Emagrecimento',
		hipertrofia: 'Hipertrofia',
		forca: 'Força',
		condicionamento_cardiovascular: 'Cardio',
		qualidade_de_vida: 'Saúde geral',
		reabilitacao: 'Reabilitação',
		performance: 'Performance'
	};
	const primaryGoal = $derived(goalsList[0] ? (GOAL_LABELS[goalsList[0]] ?? goalsList[0]) : 'sem objetivo');

	$effect(() => {
		if (phase !== 'generating') return;
		// O teardown do $effect roda antes de re-executar E ao destruir o
		// componente, então o interval nunca vaza (ex.: gerar → falhar → gerar
		// de novo criava um 2º interval com o 1º ainda rodando).
		const id = setInterval(() => (msgIdx = (msgIdx + 1) % messages.length), 2000);
		return () => clearInterval(id);
	});
</script>

<svelte:head>
	<title>Gerar plano · PreceptorFISIC</title>
</svelte:head>

{#if phase === 'generating'}
	<div style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg-0)">
		<div style="display:flex;flex-direction:column;align-items:center;gap:24px;max-width:460px">
			<div style="position:relative;width:80px;height:80px">
				<div class="spinner"></div>
			</div>
			<div style="text-align:center">
				<div style="font:500 18px var(--font-sans);color:var(--ink-0);margin-bottom:8px">
					Iniciando geração
				</div>
				<div style="font:var(--body-sm);color:var(--accent);min-height:20px">
					{messages[msgIdx]}
				</div>
				<div style="font:var(--label-mono);color:var(--ink-3);margin-top:14px">Você será redirecionado pra tela do plano em segundos…</div>
			</div>
		</div>
	</div>
{:else if false}
	<div style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg-0)">
		<div style="text-align:center">
			<div
				style="width:72px;height:72px;border-radius:50%;background:var(--success-dim);display:inline-flex;align-items:center;justify-content:center;color:var(--success);font-size:32px;margin-bottom:18px"
			>✓</div>
			<div style="font:500 22px var(--font-sans);color:var(--ink-0)">Plano gerado com sucesso</div>
			<div style="font:var(--body-sm);color:var(--ink-2);margin-top:8px">Abrindo seu treino personalizado…</div>
		</div>
	</div>
{:else}
	<div style="flex:1;overflow-y:auto;background:var(--bg-0)">
		<header
			style="display:flex;align-items:center;justify-content:space-between;padding:20px 32px;border-bottom:1px solid var(--ink-line);background:var(--bg-1);position:sticky;top:0;z-index:10"
		>
			<div style="display:flex;align-items:center;gap:10px">
				<button
					onclick={() => goto(`/alunos/${student.id}`)}
					style="background:var(--bg-2);border:1px solid var(--ink-line-2);cursor:pointer;width:32px;height:32px;border-radius:8px;color:var(--ink-1)"
				>←</button>
				<div>
					<h1 style="margin:0;font:600 22px var(--font-sans);letter-spacing:-0.015em">Gerar treino</h1>
					<div style="font:var(--body-sm);color:var(--ink-2);margin-top:2px">Para {student.name}</div>
				</div>
			</div>
		</header>

		<div style="padding:32px;max-width:820px;margin:0 auto">
			<div class="card" style="padding:24px;margin-bottom:16px">
				<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
					<Avatar name={student.name} size={56} />
					<div>
						<div style="font:500 18px var(--font-sans);color:var(--ink-0)">{student.name}</div>
						<div style="font:var(--body-sm);color:var(--ink-2);margin-top:3px">
							{age ? age + ' anos · ' : ''}{primaryGoal}
						</div>
					</div>
				</div>

				{#if diagnoses.length > 0}
					<div style="margin-bottom:16px">
						<Eyebrow>Condições médicas</Eyebrow>
						<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
							{#each diagnoses as d, i (d.label + i)}
								{@const risk = isHighRisk(d.label)}
								<span
									style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--r-pill);font:500 12px var(--font-sans);background:{risk
										? 'var(--danger-dim)'
										: 'var(--bg-3)'};color:{risk
										? 'var(--danger)'
										: 'var(--ink-1)'};border:1px solid {risk ? 'var(--danger)' : 'var(--ink-line-2)'}"
								>
									{#if risk}<span>⚠</span>{/if}
									{d.label}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if limitations.length > 0}
					<div style="margin-bottom:16px">
						<Eyebrow>Limitações</Eyebrow>
						<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
							{#each limitations as l, i (l + i)}
								<div style="font:var(--body-sm);color:var(--ink-1)">• {l}</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if meds.length > 0}
					<div>
						<Eyebrow>Medicações</Eyebrow>
						<div style="margin-top:8px;font:var(--body-sm);color:var(--ink-1)">
							{meds.map((m) => m.name + (m.dose ? ' ' + m.dose : '')).join(' · ')}
						</div>
					</div>
				{/if}
			</div>

			{#if hasHighRisk}
				<div
					style="padding:18px;margin-bottom:16px;border-radius:var(--r-3);background:var(--warn-dim);border:1px solid var(--warn);display:flex;gap:14px;align-items:flex-start"
				>
					<span style="color:var(--warn);font-size:22px">⚠</span>
					<div>
						<div style="font:500 14px var(--font-sans);color:var(--warn);margin-bottom:4px">
							Atenção: condições de alto risco detectadas
						</div>
						<div style="font:var(--body-sm);color:var(--ink-1)">
							Este paciente possui condições que requerem prescrição cuidadosa. O plano será validado contra protocolos de segurança clínica.
						</div>
					</div>
				</div>
			{/if}

			<form
				method="POST"
				action="?/generate"
				use:enhance={() => {
					phase = 'generating';
					return async ({ update, result }) => {
						// Exceção não tratada (DB fora, rede): trata ANTES do update(),
						// senão o applyAction default renderiza a página de erro e o
						// usuário perde as notas — ou fica preso no spinner.
						if (result.type === 'error') {
							phase = 'idle';
							toast.error('Falha inesperada ao gerar o plano. Tente de novo.');
							return;
						}
						await update();
						// Se falhou (ex: rate limit), volta pra idle
						if (result.type === 'failure') phase = 'idle';
					};
				}}
			>
				{#if form?.error}
					<div
						class="card"
						style="padding:14px 18px;margin-bottom:14px;background:{form.rateLimited
							? 'var(--warn-dim)'
							: 'var(--danger-dim)'};border:1px solid {form.rateLimited
							? 'var(--warn)'
							: 'var(--danger)'};display:flex;align-items:flex-start;gap:10px"
					>
						<span style="color:{form.rateLimited ? 'var(--warn)' : 'var(--danger)'};font-size:18px;line-height:1"
							>{form.rateLimited ? '⏱' : '⚠'}</span
						>
						<div style="flex:1">
							<div
								style="font:500 13px var(--font-sans);color:{form.rateLimited
									? 'var(--warn)'
									: 'var(--danger)'};margin-bottom:4px"
							>
								{form.rateLimited ? 'Limite de geração atingido' : 'Erro ao gerar plano'}
							</div>
							<div style="font:var(--body-sm);color:var(--ink-0);line-height:1.5">{form.error}</div>
						</div>
					</div>
				{/if}

				<div class="card" style="padding:24px;margin-bottom:16px">
					<Eyebrow>Equipamento disponível</Eyebrow>
					<div style="font:var(--body-sm);color:var(--ink-2);margin-top:6px">
						O PreceptorFISIC só prescreve exercícios com o que o aluno tem à disposição.
					</div>
					<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
						{#each EQUIPMENT_OPTIONS as opt (opt.value)}
							{@const checked = equipment.includes(opt.value)}
							<label
								style="display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:var(--r-pill);cursor:pointer;font:500 13px var(--font-sans);background:{checked
									? 'var(--accent-wash)'
									: 'var(--bg-3)'};color:{checked
									? 'var(--accent-2)'
									: 'var(--ink-1)'};border:1px solid {checked ? 'var(--accent)' : 'var(--ink-line-2)'}"
							>
								<input
									type="checkbox"
									name="equipment"
									value={opt.value}
									bind:group={equipment}
									style="accent-color:var(--accent);margin:0"
								/>
								{opt.label}
							</label>
						{/each}
					</div>
				</div>

				<div class="card" style="padding:24px;margin-bottom:20px">
					<Eyebrow>Observações profissionais (opcional)</Eyebrow>
					<textarea
						name="notes"
						bind:value={notes}
						maxlength="2000"
						placeholder="Adicione notas que o PreceptorFISIC deve considerar ao gerar o treino…"
						style="width:100%;margin-top:10px;min-height:100px;padding:14px;background:var(--bg-2);border:1px solid var(--ink-line-2);border-radius:var(--r-2);color:var(--ink-0);font:14px var(--font-sans);resize:vertical;outline:none;box-sizing:border-box"
					></textarea>
					<div
						style="margin-top:6px;text-align:right;font:var(--label-mono);color:{notes.length >= 2000
							? 'var(--warn)'
							: 'var(--ink-3)'}"
					>
						{notes.length}/2000
					</div>
				</div>

				{#if data.subscriptionBlocked}
					<div
						class="card"
						style="padding:14px 18px;margin-bottom:14px;background:var(--warn-dim);border:1px solid var(--warn);font:var(--body-sm);color:var(--ink-1)"
					>
						⚠ Sua assinatura não está ativa — a geração de planos fica bloqueada.
						<a href="/assinatura" style="color:var(--accent-2)">Renovar assinatura →</a>
					</div>
				{/if}
				<Button type="submit" disabled={data.subscriptionBlocked} style="width:100%;justify-content:center">⚡ Gerar plano personalizado</Button>

				<div style="margin-top:14px;text-align:center;font:var(--label-mono);color:var(--ink-3)">
					PreceptorFISIC · RAG 49 fontes · Preferência ACSM ★
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.spinner {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		border: 2px solid var(--ink-line);
		border-top-color: var(--accent);
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
