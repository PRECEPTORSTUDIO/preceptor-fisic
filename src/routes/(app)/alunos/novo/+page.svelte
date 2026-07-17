<script lang="ts">
	import { Button, Eyebrow, toast } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { stratifyCardiovascularRisk, type CvRiskLevel, type Sex } from '$lib/clinical/cv-risk';
	import { deriveTagsFromDiagnosisLabels } from '$lib/clinical/condition-tags';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const GOALS = [
		{ id: 'emagrecimento', label: 'Emagrecimento' },
		{ id: 'hipertrofia', label: 'Hipertrofia' },
		{ id: 'forca', label: 'Força' },
		{ id: 'condicionamento_cardiovascular', label: 'Cardio' },
		{ id: 'qualidade_de_vida', label: 'Saúde geral' },
		{ id: 'reabilitacao', label: 'Reabilitação' },
		{ id: 'performance', label: 'Performance' }
	];

	const v = (form as any)?.values ?? {};
	let mode = $state<'completo' | 'link'>((form as any)?.mode ?? 'completo');
	let goals = $state<string[]>(v.goals ?? []);
	let submitting = $state(false);

	// ── Estratificação de risco CV ao vivo (mesmo motor da ficha) ─────────────
	// Campos reativos: conforme o profissional preenche, o risco recalcula.
	// Sem PA/PAR-Q ainda (só vêm na avaliação física) → confiança menor aqui.
	let birthDate = $state<string>(v.birthDate ?? '');
	let sex = $state<string>(v.sex ?? 'nao_informado');
	let weightKg = $state<string>(v.weightKg ?? '');
	let heightCm = $state<string>(v.heightCm ?? '');
	let diagnoses = $state<string>(v.diagnoses ?? '');
	let medications = $state<string>(v.medications ?? '');

	const toNum = (s: string) => {
		const n = parseFloat(String(s).replace(',', '.'));
		return Number.isFinite(n) ? n : null;
	};
	const splitList = (s: string) =>
		s
			.split(/[,\n]/)
			.map((x) => x.trim())
			.filter(Boolean);

	const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
	const cvRisk = $derived.by(() => {
		const w = toNum(weightKg);
		const h = toNum(heightCm);
		const bmi = w && h ? Math.round((w / Math.pow(h / 100, 2)) * 10) / 10 : null;
		const age = birthDate ? Math.floor((Date.now() - new Date(birthDate).getTime()) / YEAR_MS) : null;
		const diagLabels = splitList(diagnoses);
		return stratifyCardiovascularRisk({
			sex: sex as Sex,
			ageYears: age,
			bmi,
			systolicBp: null,
			diastolicBp: null,
			restingHr: null,
			conditionTags: deriveTagsFromDiagnosisLabels(diagLabels),
			diagnoses: diagLabels.map((label) => ({ label })),
			medications: splitList(medications).map((name) => ({ name })),
			parqPositive: null
		});
	});

	const RISK_META: Record<CvRiskLevel, { label: string; color: string; bg: string }> = {
		baixo: { label: 'Baixo', color: 'var(--success)', bg: 'var(--success-dim)' },
		moderado: { label: 'Moderado', color: 'var(--warn)', bg: 'var(--warn-dim)' },
		alto: { label: 'Alto', color: 'var(--danger)', bg: 'var(--danger-dim)' },
		muito_alto: { label: 'Muito alto', color: 'var(--danger)', bg: 'var(--danger-dim)' }
	};

	// Valor submetido (name="cardiovascularRisk"). Segue a sugestão até o
	// profissional escolher manualmente (aí respeita a escolha dele).
	let selectedRisk = $state<CvRiskLevel>('baixo');
	let riskTouched = $state(false);
	$effect(() => {
		const suggested = cvRisk.level;
		if (!riskTouched) selectedRisk = suggested;
	});

	// Resultado do modo "link": URL gerada pro aluno preencher.
	const fillUrl = $derived((form as any)?.fillUrl as string | undefined);

	function toggleGoal(g: string) {
		goals = goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g];
	}

	async function copyLink() {
		if (!fillUrl) return;
		try {
			await navigator.clipboard.writeText(fillUrl);
			toast.success('Link copiado!');
		} catch {
			toast.error('Não consegui copiar — selecione e copie manualmente.');
		}
	}
</script>

<svelte:head>
	<title>Novo aluno · Preceptor Fisic</title>
</svelte:head>

<div style="flex:1;overflow-y:auto;background:var(--bg-0)">
	<header
		style="display:flex;align-items:center;gap:16px;padding:20px 32px;border-bottom:1px solid var(--ink-line);background:var(--bg-1);position:sticky;top:0;z-index:10"
	>
		<button
			onclick={() => goto('/alunos')}
			style="background:var(--bg-3);border:1px solid var(--ink-line-2);cursor:pointer;width:36px;height:36px;border-radius:var(--r-1);color:var(--ink-1);font-size:18px"
		>←</button>
		<div style="flex:1">
			<Eyebrow>Cadastro</Eyebrow>
			<h1 style="margin:4px 0 0;font:600 22px var(--font-sans);letter-spacing:-0.015em">Novo aluno</h1>
		</div>
	</header>

	{#if fillUrl}
		<!-- Sucesso modo link: mostra o link pro aluno preencher -->
		<div style="padding:32px;max-width:780px;margin:0 auto">
			<div class="card" style="padding:24px">
				<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
					<span style="font-size:20px">✅</span>
					<h2 style="margin:0;font:600 18px var(--font-sans)">Aluno criado — agora envie o link</h2>
				</div>
				<p style="font:var(--body-sm);color:var(--ink-2);margin:0 0 16px">
					Mande este link pro aluno. Ele preenche os próprios dados (perfil clínico, objetivos e
					preferências) e o cadastro fica completo automaticamente.
				</p>
				<div style="display:flex;gap:8px;align-items:stretch">
					<input
						class="inp"
						readonly
						value={fillUrl}
						onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
						style="flex:1;font-size:13px"
					/>
					<Button onclick={copyLink}>Copiar link</Button>
				</div>
				<div style="display:flex;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid var(--ink-line)">
					<Button variant="secondary" onclick={() => goto('/alunos')}>Ver alunos</Button>
					<Button variant="secondary" onclick={() => location.reload()}>Cadastrar outro</Button>
				</div>
			</div>
		</div>
	{:else}
		<!-- Seletor de modo -->
		<div style="padding:24px 32px 0;max-width:780px;margin:0 auto">
			<div
				style="display:grid;grid-template-columns:1fr 1fr;gap:10px"
			>
				<button
					type="button"
					onclick={() => (mode = 'completo')}
					class="mode-btn"
					class:active={mode === 'completo'}
				>
					<div style="font:600 14px var(--font-sans)">Preencher eu mesmo</div>
					<div style="font:var(--body-sm);color:var(--ink-2);margin-top:2px">Cadastro completo agora</div>
				</button>
				<button
					type="button"
					onclick={() => (mode = 'link')}
					class="mode-btn"
					class:active={mode === 'link'}
				>
					<div style="font:600 14px var(--font-sans)">Enviar link pro aluno</div>
					<div style="font:var(--body-sm);color:var(--ink-2);margin-top:2px">Você só põe nome, e-mail e idade</div>
				</button>
			</div>
		</div>

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update({ reset: false });
					submitting = false;
				};
			}}
			style="padding:24px 32px 32px;max-width:780px;margin:0 auto"
		>
			<input type="hidden" name="mode" value={mode} />

			{#if form?.error}
				<div
					style="padding:12px 16px;margin-bottom:20px;border-radius:var(--r-2);background:var(--danger-dim);border:1px solid var(--danger);color:var(--danger);font:var(--body-sm)"
				>
					<div style="font-weight:600;margin-bottom:4px">{form.error}</div>
					{#if (form as any)?.issues}
						<ul style="margin:6px 0 0;padding-left:18px">
							{#each (form as any).issues as issue}
								<li>{issue}</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

			<!-- Identidade -->
			<div class="card" style="padding:24px;margin-bottom:16px">
				<Eyebrow>Identidade</Eyebrow>
				<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px;margin-top:14px">
					<div>
						<label class="lbl">Nome completo *</label>
						<input class="inp" name="name" required placeholder="Ana Beatriz Silva" value={v.name ?? ''} />
					</div>
					<div>
						<label class="lbl">Data nasc.{mode === 'link' ? ' *' : ''}</label>
						<input class="inp" name="birthDate" type="date" required={mode === 'link'} bind:value={birthDate} />
					</div>
					{#if mode === 'completo'}
						<div>
							<label class="lbl">Sexo *</label>
							<select class="inp" name="sex" required bind:value={sex}>
								<option value="nao_informado">Não informado</option>
								<option value="feminino">Feminino</option>
								<option value="masculino">Masculino</option>
								<option value="outro">Outro</option>
							</select>
						</div>
					{:else}
						<div>
							<label class="lbl">E-mail *</label>
							<input class="inp" name="email" type="email" required placeholder="ana@email.com" value={v.email ?? ''} />
						</div>
					{/if}
				</div>
				{#if mode === 'completo'}
					<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;margin-top:14px">
						<div>
							<label class="lbl">Peso (kg)</label>
							<!-- type=text: com type=number o browser sanitiza "70,5" pra "" e o servidor nunca vê a vírgula -->
							<input class="inp" name="weightKg" type="text" inputmode="decimal" placeholder="62,4" bind:value={weightKg} />
						</div>
						<div>
							<label class="lbl">Altura (cm)</label>
							<input class="inp" name="heightCm" type="text" inputmode="decimal" placeholder="165" bind:value={heightCm} />
						</div>
						<div>
							<label class="lbl">Telefone</label>
							<input class="inp" name="phone" placeholder="+55 11 9..." value={v.phone ?? ''} />
						</div>
						<div>
							<label class="lbl">E-mail</label>
							<input class="inp" name="email" type="email" placeholder="ana@email.com" value={v.email ?? ''} />
						</div>
					</div>
				{/if}
			</div>

			{#if mode === 'link'}
				<div
					style="padding:14px 16px;margin-bottom:16px;border-radius:var(--r-2);background:var(--accent-wash);border:1px solid var(--accent);color:var(--ink-1);font:var(--body-sm)"
				>
					Você só preenche o básico. Ao cadastrar, geramos um link pro aluno completar perfil clínico,
					objetivos e preferências de treino.
				</div>
			{/if}

			{#if mode === 'completo'}
				<!-- Perfil clínico -->
				<div class="card" style="padding:24px;margin-bottom:16px">
					<Eyebrow>Perfil clínico</Eyebrow>
					<div style="display:grid;grid-template-columns:1fr;gap:14px;margin-top:14px">
						<div>
							<label class="lbl">Diagnósticos (separe por vírgula)</label>
							<textarea
								class="inp"
								name="diagnoses"
								rows="2"
								placeholder="hipertensão estágio 2, asma leve, lombalgia crônica"
								style="resize:vertical"
								bind:value={diagnoses}></textarea>
						</div>
						<div>
							<label class="lbl">Medicações em uso (separe por vírgula)</label>
							<textarea
								class="inp"
								name="medications"
								rows="2"
								placeholder="losartana 50mg/dia, metformina 850mg 2x/dia"
								style="resize:vertical"
								bind:value={medications}></textarea>
						</div>
						<div>
							<label class="lbl">Limitações físicas / lesões (separe por vírgula)</label>
							<textarea
								class="inp"
								name="limitations"
								rows="2"
								placeholder="dor lombar ao agachar, ombro direito limitado acima de 90°, joelho com menisco operado em 2023"
								style="resize:vertical">{v.limitations ?? ''}</textarea>
							<div class="hint">Articulações, regiões com dor, restrições de amplitude — vai pro contexto da IA na hora de gerar o plano.</div>
						</div>
						<div>
							<label class="lbl">Risco cardiovascular *</label>
							<div
								style="border:1px solid {RISK_META[cvRisk.level].color};background:{RISK_META[cvRisk.level].bg};border-radius:var(--r-2);padding:14px 16px"
							>
								<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
									<span style="font:600 13px var(--font-sans);color:{RISK_META[cvRisk.level].color}">
										Calculado: {RISK_META[cvRisk.level].label}
									</span>
									<span style="font:var(--label-mono);color:var(--ink-2)">confiança {cvRisk.confidence}</span>
								</div>

								{#if cvRisk.reasons.length > 0}
									<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px">
										{#each cvRisk.reasons as r, i (r + i)}
											<div style="font:var(--body-sm);color:var(--ink-1)">• {r}</div>
										{/each}
									</div>
								{/if}

								{#if cvRisk.factors.length > 0}
									<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
										{#each cvRisk.factors as f (f.code)}
											<span style="display:inline-flex;padding:3px 9px;border-radius:var(--r-pill);font:500 11px var(--font-sans);background:var(--bg-3);color:var(--ink-1);border:1px solid var(--ink-line-2)">
												{f.label}{f.detail ? ' · ' + f.detail : ''}
											</span>
										{/each}
									</div>
								{/if}

								<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
									<span style="font:var(--body-sm);color:var(--ink-2)">Confirmar ou ajustar:</span>
									<select
										class="inp"
										name="cardiovascularRisk"
										required
										bind:value={selectedRisk}
										onchange={() => (riskTouched = true)}
										style="width:auto;flex:1;min-width:130px"
									>
										<option value="baixo">Baixo</option>
										<option value="moderado">Moderado</option>
										<option value="alto">Alto</option>
										<option value="muito_alto">Muito alto</option>
									</select>
									{#if riskTouched && selectedRisk !== cvRisk.level}
										<button
											type="button"
											onclick={() => {
												riskTouched = false;
												selectedRisk = cvRisk.level;
											}}
											style="all:unset;cursor:pointer;font:var(--body-sm);color:var(--accent)"
										>
											usar cálculo
										</button>
									{/if}
								</div>
								<div style="margin-top:8px;font:var(--body-sm);color:var(--ink-2)">
									Estimado dos dados clínicos. PA e PAR-Q entram na avaliação física e refinam a
									classificação na ficha.
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Preferências de treino -->
				<div class="card" style="padding:24px;margin-bottom:16px">
					<Eyebrow>Preferências de treino</Eyebrow>

					<div style="margin-top:14px">
						<label class="lbl">Objetivos (selecione 1+)</label>
						<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
							{#each GOALS as g (g.id)}
								<button
									type="button"
									onclick={() => toggleGoal(g.id)}
									style="all:unset;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border-radius:var(--r-pill);background:{goals.includes(g.id)
										? 'var(--accent-wash)'
										: 'var(--bg-3)'};border:1px solid {goals.includes(g.id)
										? 'var(--accent)'
										: 'var(--ink-line-2)'};color:{goals.includes(g.id)
										? 'var(--accent-2)'
										: 'var(--ink-1)'};font:500 12px var(--font-sans);cursor:pointer;transition:all 140ms var(--ease)"
								>
									{goals.includes(g.id) ? '✓' : '+'} {g.label}
								</button>
							{/each}
						</div>
						{#each goals as g (g)}<input type="hidden" name="goals" value={g} />{/each}
					</div>

					<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px">
						<div>
							<label class="lbl">Sessões / semana *</label>
							<input class="inp" name="weeklySessions" type="number" min="1" max="7" required value={v.weeklySessions ?? 3} />
						</div>
						<div>
							<label class="lbl">Min / sessão *</label>
							<input class="inp" name="minutesPerSession" type="number" min="15" max="180" required value={v.minutesPerSession ?? 60} />
						</div>
					</div>

					<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
						<div>
							<label class="lbl">Experiência *</label>
							<select class="inp" name="experienceLevel" required>
								<option value="iniciante" selected={!v.experienceLevel || v.experienceLevel === 'iniciante'}>Iniciante</option>
								<option value="intermediario" selected={v.experienceLevel === 'intermediario'}>Intermediário</option>
								<option value="avancado" selected={v.experienceLevel === 'avancado'}>Avançado</option>
							</select>
						</div>
						<div>
							<label class="lbl">Dificuldade dos exercícios *</label>
							<select class="inp" name="prescribedDifficulty" required>
								<option value="pequena" selected={v.prescribedDifficulty === 'pequena'}>Pequena</option>
								<option value="media" selected={!v.prescribedDifficulty || v.prescribedDifficulty === 'media'}>Média</option>
								<option value="alta" selected={v.prescribedDifficulty === 'alta'}>Alta</option>
							</select>
						</div>
						<div>
							<label class="lbl">Estrutura do treino</label>
							<select class="inp" name="trainingSplit">
								<option value="auto" selected={!v.trainingSplit || v.trainingSplit === 'auto'}>Automática (IA decide pela frequência)</option>
								<option value="full_body" selected={v.trainingSplit === 'full_body'}>Full-body (todos os grupos em cada sessão)</option>
								<option value="upper_lower" selected={v.trainingSplit === 'upper_lower'}>Upper/Lower (alterna superior e inferior)</option>
								<option value="push_pull_legs" selected={v.trainingSplit === 'push_pull_legs'}>Push/Pull/Legs</option>
							</select>
						</div>
					</div>
					<p style="font:var(--body-sm);color:var(--ink-2);margin:8px 0 0">
						Dificuldade controla a complexidade técnica dos exercícios. Estrutura define a divisão muscular semanal — "automática" deixa a IA escolher: full-body pra 1-3x/sem, upper/lower pra 4x, push/pull/legs pra 5-6x.
					</p>
				</div>
			{/if}

			<div style="display:flex;justify-content:space-between;gap:8px;padding-top:16px;border-top:1px solid var(--ink-line)">
				<Button variant="secondary" onclick={() => goto('/alunos')}>Cancelar</Button>
				<Button type="submit" disabled={submitting} size="lg">
					{#if submitting}
						Salvando…
					{:else if mode === 'link'}
						Criar e gerar link →
					{:else}
						Cadastrar aluno →
					{/if}
				</Button>
			</div>
		</form>
	{/if}
</div>

<style>
	.lbl {
		display: block;
		font: var(--label-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-2);
		margin-bottom: 6px;
	}
	.inp {
		width: 100%;
		box-sizing: border-box;
		height: 40px;
		padding: 0 12px;
		background: var(--bg-3);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		color: var(--ink-0);
		font: 400 14px var(--font-sans);
		font-variant-numeric: tabular-nums;
		outline: none;
		transition: border-color 140ms var(--ease);
	}
	textarea.inp {
		min-height: 60px;
		padding: 10px 12px;
		height: auto;
		line-height: 1.5;
	}
	.inp:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-wash);
	}
	.mode-btn {
		all: unset;
		box-sizing: border-box;
		cursor: pointer;
		padding: 14px 16px;
		border-radius: var(--r-2);
		background: var(--bg-2);
		border: 1px solid var(--ink-line-2);
		transition: all 140ms var(--ease);
	}
	.mode-btn.active {
		background: var(--accent-wash);
		border-color: var(--accent);
	}
</style>
