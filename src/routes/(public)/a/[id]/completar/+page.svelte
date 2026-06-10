<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const student = $derived(data.student);
	const pro = $derived(data.professional);
	const hp = $derived(data.healthProfile);
	const prefs = $derived(data.preferences);

	const GOALS = [
		{ id: 'emagrecimento', label: 'Emagrecimento' },
		{ id: 'hipertrofia', label: 'Hipertrofia' },
		{ id: 'forca', label: 'Força' },
		{ id: 'condicionamento_cardiovascular', label: 'Cardio' },
		{ id: 'qualidade_de_vida', label: 'Saúde geral' },
		{ id: 'reabilitacao', label: 'Reabilitação' },
		{ id: 'performance', label: 'Performance' }
	];

	const initialDiag = ((hp?.diagnoses as { label: string }[] | null) ?? []).map((d) => d.label).join(', ');
	const initialMeds = ((hp?.medications as { name: string }[] | null) ?? []).map((m) => m.name).join(', ');
	const initialLimitations = ((hp?.injuries as { region: string; notes?: string }[] | null) ?? [])
		.map((i) => i.region + (i.notes ? ' · ' + i.notes : ''))
		.join(', ');

	let goals = $state<string[]>(((prefs?.goals as string[] | null) ?? []) as string[]);
	let submitting = $state(false);

	const alreadyDone = $derived(!!student.profileCompletedAt);

	function toggleGoal(g: string) {
		goals = goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g];
	}
</script>

<div class="wrap">
	<header class="hd">
		<div class="eyebrow">Preceptor Fisic</div>
		<h1>Olá, {student.name.split(' ')[0]} 👋</h1>
		<p class="sub">
			{pro.name} começou seu cadastro. Complete seus dados abaixo pra receber treinos sob medida.
		</p>
	</header>

	{#if alreadyDone}
		<div class="note ok">
			Seu cadastro já está completo ✅ — pode atualizar as informações abaixo se quiser.
		</div>
	{/if}

	{#if form?.error}
		<div class="note err">
			<strong>{form.error}</strong>
			{#if (form as any)?.issues}
				<ul>
					{#each (form as any).issues as issue}<li>{issue}</li>{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<section class="card">
			<div class="sec-title">Sobre você</div>
			<div class="grid2">
				<div>
					<label class="lbl">Data de nascimento</label>
					<input class="inp" name="birthDate" type="date" value={student.birthDate ?? ''} />
				</div>
				<div>
					<label class="lbl">Telefone</label>
					<input class="inp" name="phone" placeholder="+55 11 9..." />
				</div>
				<div>
					<label class="lbl">Peso (kg)</label>
					<input class="inp" name="weightKg" type="number" step="0.1" placeholder="70" />
				</div>
				<div>
					<label class="lbl">Altura (cm)</label>
					<input class="inp" name="heightCm" type="number" placeholder="172" />
				</div>
			</div>
		</section>

		<section class="card">
			<div class="sec-title">Saúde</div>
			<label class="lbl">Tem algum diagnóstico? (separe por vírgula)</label>
			<textarea class="inp" name="diagnoses" rows="2" placeholder="hipertensão, asma leve...">{initialDiag}</textarea>
			<label class="lbl" style="margin-top:12px">Usa alguma medicação? (separe por vírgula)</label>
			<textarea class="inp" name="medications" rows="2" placeholder="losartana 50mg...">{initialMeds}</textarea>
			<label class="lbl" style="margin-top:12px">Tem alguma limitação física ou lesão? (separe por vírgula)</label>
			<textarea class="inp" name="limitations" rows="2" placeholder="dor lombar ao agachar, ombro direito limitado...">{initialLimitations}</textarea>
			<label class="lbl" style="margin-top:12px">Risco cardiovascular *</label>
			<select class="inp" name="cardiovascularRisk" required>
				<option value="baixo" selected={!hp?.cardiovascularRisk || hp?.cardiovascularRisk === 'baixo'}>Baixo — sem problemas conhecidos</option>
				<option value="moderado" selected={hp?.cardiovascularRisk === 'moderado'}>Moderado</option>
				<option value="alto" selected={hp?.cardiovascularRisk === 'alto'}>Alto</option>
				<option value="muito_alto" selected={hp?.cardiovascularRisk === 'muito_alto'}>Muito alto</option>
			</select>
			<p class="hint">Na dúvida, deixe "Baixo" — seu treinador revisa depois.</p>
		</section>

		<section class="card">
			<div class="sec-title">Seus objetivos *</div>
			<div class="chips">
				{#each GOALS as g (g.id)}
					<button type="button" class="chip" class:on={goals.includes(g.id)} onclick={() => toggleGoal(g.id)}>
						{goals.includes(g.id) ? '✓' : '+'} {g.label}
					</button>
				{/each}
			</div>
			{#each goals as g (g)}<input type="hidden" name="goals" value={g} />{/each}
		</section>

		<section class="card">
			<div class="sec-title">Preferências de treino</div>
			<div class="grid2">
				<div>
					<label class="lbl">Treinos por semana *</label>
					<input class="inp" name="weeklySessions" type="number" min="1" max="7" required value={prefs?.weeklySessions ?? 3} />
				</div>
				<div>
					<label class="lbl">Minutos por treino *</label>
					<input class="inp" name="minutesPerSession" type="number" min="15" max="180" required value={prefs?.minutesPerSession ?? 60} />
				</div>
			</div>
			<label class="lbl" style="margin-top:12px">Sua experiência com treino *</label>
			<select class="inp" name="experienceLevel" required>
				<option value="iniciante" selected={!prefs?.experienceLevel || prefs?.experienceLevel === 'iniciante'}>Iniciante — pouca ou nenhuma experiência</option>
				<option value="intermediario" selected={prefs?.experienceLevel === 'intermediario'}>Intermediário — treino há alguns meses</option>
				<option value="avancado" selected={prefs?.experienceLevel === 'avancado'}>Avançado — treino consistente há anos</option>
			</select>
			<label class="lbl" style="margin-top:12px">Dificuldade dos exercícios *</label>
			<select class="inp" name="prescribedDifficulty" required>
				<option value="pequena" selected={prefs?.prescribedDifficulty === 'pequena'}>Pequena — exercícios simples e seguros</option>
				<option value="media" selected={!prefs?.prescribedDifficulty || prefs?.prescribedDifficulty === 'media'}>Média — equilíbrio</option>
				<option value="alta" selected={prefs?.prescribedDifficulty === 'alta'}>Alta — exercícios mais desafiadores</option>
			</select>
			<p class="hint">Se você é novo na academia, prefira "Pequena" pra começar sem exercícios complexos.</p>
		</section>

		<!-- Consent LGPD — dados de saúde (art. 11) exigem consentimento explícito
		     do titular. Validado server-side na action. -->
		<label class="consent">
			<input type="checkbox" name="accept_privacy" required />
			<span>
				Autorizo o tratamento dos meus dados de saúde pra prescrição de treinos,
				conforme a <a href="/legal/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.
			</span>
		</label>

		<button class="submit" type="submit" disabled={submitting}>
			{submitting ? 'Salvando…' : 'Concluir cadastro →'}
		</button>
	</form>
</div>

<style>
	.wrap {
		padding: 28px 20px 60px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.consent {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 14px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		font: 400 13px/1.5 var(--font-sans);
		color: var(--ink-1);
		cursor: pointer;
	}
	.consent input {
		margin-top: 2px;
		accent-color: var(--accent);
		flex-shrink: 0;
	}
	.consent a {
		color: var(--accent-2);
	}
	.hd .eyebrow {
		font: var(--label-mono);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--accent-2);
	}
	.hd h1 {
		margin: 8px 0 6px;
		font: 600 24px var(--font-sans);
		letter-spacing: -0.02em;
	}
	.hd .sub {
		margin: 0;
		font: var(--body-sm);
		color: var(--ink-2);
		line-height: 1.5;
	}
	.card {
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
		padding: 18px;
	}
	.sec-title {
		font: 600 15px var(--font-sans);
		margin-bottom: 12px;
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.lbl {
		display: block;
		font: var(--label-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-2);
		margin-bottom: 6px;
	}
	.inp {
		width: 100%;
		box-sizing: border-box;
		min-height: 46px;
		padding: 11px 12px;
		background: var(--bg-3);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		color: var(--ink-0);
		font: 400 15px var(--font-sans);
		outline: none;
	}
	textarea.inp {
		line-height: 1.5;
		resize: vertical;
	}
	.inp:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-wash);
	}
	.hint {
		margin: 8px 0 0;
		font: var(--body-sm);
		color: var(--ink-2);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 38px;
		padding: 0 16px;
		border-radius: var(--r-pill);
		background: var(--bg-3);
		border: 1px solid var(--ink-line-2);
		color: var(--ink-1);
		font: 500 14px var(--font-sans);
	}
	.chip.on {
		background: var(--accent-wash);
		border-color: var(--accent);
		color: var(--accent-2);
	}
	.submit {
		all: unset;
		cursor: pointer;
		text-align: center;
		padding: 16px;
		border-radius: var(--r-3);
		background: var(--accent);
		color: #fff;
		font: 600 16px var(--font-sans);
		margin-top: 4px;
	}
	.submit:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.note {
		padding: 12px 14px;
		border-radius: var(--r-2);
		font: var(--body-sm);
		line-height: 1.5;
	}
	.note.ok {
		background: var(--accent-wash);
		border: 1px solid var(--accent);
		color: var(--ink-1);
	}
	.note.err {
		background: var(--danger-dim);
		border: 1px solid var(--danger);
		color: var(--danger);
	}
	.note ul {
		margin: 6px 0 0;
		padding-left: 18px;
	}
</style>
