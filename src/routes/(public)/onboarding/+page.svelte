<script lang="ts">
	import { Button, Eyebrow } from '$lib/components/ui';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Specialty =
		| 'prescricao_clinica'
		| 'treinamento_funcional'
		| 'reabilitacao'
		| 'musculacao'
		| 'personal'
		| 'pilates'
		| 'outro';

	let step = $state<1 | 2 | 3>(1);
	let name = $state(data.suggestedName ?? '');
	let cref = $state('');
	let specialty = $state<Specialty>('prescricao_clinica');
	let submitting = $state(false);

	// Quando action retorna sucesso, avança pra step 3.
	$effect(() => {
		if (form?.success) {
			step = 3;
			submitting = false;
		}
	});

	const SPECIALTIES: { id: Specialty; label: string; sub: string }[] = [
		{ id: 'prescricao_clinica', label: 'Prescrição clínica', sub: 'Pop. especiais, comorbidades' },
		{ id: 'treinamento_funcional', label: 'Funcional', sub: 'Capacidade, movimento' },
		{ id: 'reabilitacao', label: 'Reabilitação', sub: 'Pós-cirúrgico, lesões' },
		{ id: 'musculacao', label: 'Musculação', sub: 'Hipertrofia, força' },
		{ id: 'personal', label: 'Personal', sub: 'Atendimento individual' },
		{ id: 'pilates', label: 'Pilates', sub: 'Solo, aparelho' },
		{ id: 'outro', label: 'Outro', sub: '' }
	];

	const PILLARS = [
		{
			icon: '◐',
			title: 'Cadastre seus alunos',
			desc: 'Histórico clínico, comorbidades, contraindicações — tudo em um lugar.'
		},
		{
			icon: '◇',
			title: 'Gere planos com IA',
			desc: 'Estruturados, com base em ACSM/AHA, validados clinicamente.'
		},
		{
			icon: '◈',
			title: 'App do aluno',
			desc: 'Magic-link no celular. Hoje · Plano · Histórico — sem login, sem fricção.'
		}
	];

	const NEXT_STEPS = [
		{
			href: '/alunos/novo',
			icon: '+',
			title: 'Cadastre seu primeiro aluno',
			desc: 'Comece com 1 — depois adiciona o resto.'
		},
		{
			href: '/exercicios',
			icon: '◇',
			title: 'Explore o catálogo',
			desc: 'Mais de 500 exercícios indexados por grupo muscular.'
		},
		{
			href: '/dashboard',
			icon: '→',
			title: 'Vá pro Dashboard',
			desc: 'Visão geral da sua operação clínica.'
		}
	];

	function back() {
		if (step === 2) step = 1;
	}
</script>

<div class="onb-shell">
	<div class="onb-glow"></div>

	<!-- progress dots (não mostra no step 3) -->
	{#if step < 3}
		<div class="onb-progress">
			<div class="dot" class:on={step >= 1}></div>
			<div class="bar" class:on={step >= 2}></div>
			<div class="dot" class:on={step >= 2}></div>
			<div class="bar" class:on={false}></div>
			<div class="dot"></div>
		</div>
	{/if}

	<div class="onb-frame" class:wide={step === 1 || step === 3}>
		<header class="brand">
			<div class="logo">P</div>
			<div>
				<div class="brand-name">Preceptor Fisic</div>
				<div class="brand-sub">PRO · v3.2</div>
			</div>
		</header>

		<!-- ─────────── STEP 1: Welcome ─────────── -->
		{#if step === 1}
			<div style="margin-bottom:32px">
				<Eyebrow>◆ Bem-vindo a bordo</Eyebrow>
				<h1 class="onb-h1">
					Olá{data.suggestedName ? `, ${data.suggestedName.split(' ')[0]}` : ''}.<br />
					Vamos prescrever<br />
					com<span style="color:var(--accent)"> rigor clínico.</span>
				</h1>
				<p class="onb-sub">
					Você acabou de entrar numa plataforma para profissionais que prescrevem exercícios para
					populações reais — com comorbidades, contraindicações, e ciência por trás.
				</p>
			</div>

			<div class="pillars">
				{#each PILLARS as p (p.title)}
					<div class="pillar">
						<div class="pillar-ico">{p.icon}</div>
						<div>
							<div class="pillar-title">{p.title}</div>
							<div class="pillar-desc">{p.desc}</div>
						</div>
					</div>
				{/each}
			</div>

			<Button
				size="lg"
				onclick={() => (step = 2)}
				style="width:100%;justify-content:center;margin-top:32px"
			>
				Configurar perfil →
			</Button>

			<div class="trust-row">
				<span class="trust-dot" style="background:var(--accent)"></span>
				CONFORMIDADE LGPD · DADOS NA REGIÃO BR · SA-EAST-1
			</div>
		{/if}

		<!-- ─────────── STEP 2: Profile ─────────── -->
		{#if step === 2}
			<div style="margin-bottom:28px">
				<Eyebrow>◆ Passo 2 de 2 · Identidade profissional</Eyebrow>
				<h1 class="onb-h2">Seu perfil em 30 segundos.</h1>
				<p class="onb-sub-sm">
					Esses dados aparecem pros seus alunos. Pode editar depois em Configurações.
				</p>
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
			>
				{#if form?.error}
					<div class="err-banner">
						<span style="color:var(--danger)">⚠</span>
						{form.error}
					</div>
				{/if}

				<div style="margin-bottom:18px">
					<label class="lbl" for="onb-email">E-mail · vinculado à conta</label>
					<input id="onb-email" class="inp" disabled value={data.email} />
				</div>

				<div style="margin-bottom:18px">
					<label class="lbl" for="onb-name">Nome completo *</label>
					<input
						id="onb-name"
						class="inp"
						name="name"
						bind:value={name}
						required
						placeholder="Ex: Matheus da Cunha Castro"
						autocomplete="name"
						autofocus
					/>
				</div>

				<div style="margin-bottom:18px">
					<label class="lbl" for="onb-cref">Registro profissional · opcional</label>
					<input
						id="onb-cref"
						class="inp"
						name="cref"
						bind:value={cref}
						placeholder="Ex: CREF 123456-G/SP"
					/>
					<div class="hint">CREF, CREFITO ou CRM — pode preencher depois</div>
				</div>

				<div style="margin-bottom:24px">
					<label class="lbl" for="onb-spec">Especialidade principal *</label>
					<div class="spec-grid" id="onb-spec">
						{#each SPECIALTIES as s (s.id)}
							{@const on = specialty === s.id}
							<button
								type="button"
								onclick={() => (specialty = s.id)}
								class="spec-btn"
								class:on
							>
								<span class="spec-check">{on ? '✓' : ''}</span>
								<div>
									<div class="spec-name">{s.label}</div>
									{#if s.sub}<div class="spec-sub">{s.sub}</div>{/if}
								</div>
							</button>
						{/each}
					</div>
					<input type="hidden" name="specialty" value={specialty} />
				</div>

				<div class="row-actions">
					<button type="button" class="btn-ghost" onclick={back}>← Voltar</button>
					<Button
						type="submit"
						size="lg"
						disabled={submitting}
						style="flex:1;justify-content:center"
					>
						{submitting ? 'Configurando…' : 'Concluir →'}
					</Button>
				</div>
			</form>
		{/if}

		<!-- ─────────── STEP 3: Done ─────────── -->
		{#if step === 3}
			<div class="done-hero">
				<div class="done-check">✓</div>
				<Eyebrow>◆ Tudo pronto</Eyebrow>
				<h1 class="onb-h1" style="margin-top:8px">
					Bem-vindo, {form?.name?.split(' ')[0] ?? name.split(' ')[0] ?? 'profissional'}.
				</h1>
				<p class="onb-sub">
					Seu perfil tá ativo. Hora de começar — escolha por onde:
				</p>
			</div>

			<div class="next-steps">
				{#each NEXT_STEPS as ns (ns.href)}
					<a href={ns.href} class="next-card">
						<div class="next-ico">{ns.icon}</div>
						<div style="flex:1">
							<div class="next-title">{ns.title}</div>
							<div class="next-desc">{ns.desc}</div>
						</div>
						<div class="next-arrow">→</div>
					</a>
				{/each}
			</div>

			<button
				type="button"
				class="btn-text-only"
				onclick={() => goto('/dashboard')}
				style="margin-top:24px;display:block;width:100%;text-align:center"
			>
				Pular e ir pro Dashboard →
			</button>
		{/if}
	</div>
</div>

<style>
	.onb-shell {
		min-height: 100vh;
		background: var(--bg-0);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 16px;
		position: relative;
		overflow: hidden;
	}
	.onb-glow {
		position: absolute;
		top: -240px;
		left: 50%;
		transform: translateX(-50%);
		width: 760px;
		height: 760px;
		background: radial-gradient(circle, var(--accent-glow) 0%, transparent 65%);
		pointer-events: none;
	}
	.onb-progress {
		position: absolute;
		top: 28px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 6px;
		z-index: 2;
	}
	.onb-progress .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ink-line);
		transition: all 200ms var(--ease);
	}
	.onb-progress .dot.on {
		background: var(--accent);
		box-shadow: 0 0 12px var(--accent-wash);
	}
	.onb-progress .bar {
		width: 28px;
		height: 1.5px;
		background: var(--ink-line);
		transition: all 200ms var(--ease);
	}
	.onb-progress .bar.on {
		background: var(--accent);
	}

	.onb-frame {
		width: 100%;
		max-width: 480px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
		padding: 36px 32px;
		position: relative;
		box-shadow: var(--shadow-pop);
		animation: onb-in 320ms var(--ease) backwards;
	}
	.onb-frame.wide {
		max-width: 540px;
	}
	@keyframes onb-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 28px;
	}
	.logo {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: linear-gradient(135deg, var(--accent), var(--accent-dim));
		display: flex;
		align-items: center;
		justify-content: center;
		font: 700 18px var(--font-sans);
		color: #0a0a0a;
		box-shadow: var(--glow-accent);
	}
	.brand-name {
		font: 600 16px var(--font-sans);
		letter-spacing: -0.015em;
	}
	.brand-sub {
		font: 500 9.5px var(--font-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin-top: 2px;
	}

	.onb-h1 {
		font: 500 36px/1.08 var(--font-sans);
		margin: 8px 0 14px;
		letter-spacing: -0.028em;
		color: var(--ink-0);
	}
	.onb-h2 {
		font: 500 26px var(--font-sans);
		margin: 8px 0 8px;
		letter-spacing: -0.022em;
	}
	.onb-sub {
		font: 400 15px/1.55 var(--font-sans);
		color: var(--ink-2);
		margin: 0;
		max-width: 440px;
	}
	.onb-sub-sm {
		font: var(--body-sm);
		color: var(--ink-2);
		margin: 0;
	}

	/* pillars */
	.pillars {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin-top: 8px;
	}
	.pillar {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		padding: 14px 0;
		border-top: 1px solid var(--ink-line);
	}
	.pillar:first-child {
		border-top: none;
	}
	.pillar-ico {
		font-size: 18px;
		color: var(--accent);
		min-width: 24px;
		padding-top: 1px;
	}
	.pillar-title {
		font: 500 14.5px var(--font-sans);
		color: var(--ink-0);
		margin-bottom: 2px;
	}
	.pillar-desc {
		font: 400 13px/1.5 var(--font-sans);
		color: var(--ink-2);
	}

	/* form */
	.lbl {
		display: block;
		font: var(--label-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-2);
		margin-bottom: 6px;
	}
	.hint {
		font: var(--label-mono);
		color: var(--ink-3);
		margin-top: 6px;
	}
	.inp {
		width: 100%;
		box-sizing: border-box;
		height: 44px;
		padding: 0 14px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		color: var(--ink-0);
		font: 400 14px var(--font-sans);
		outline: none;
		transition: all 140ms var(--ease);
	}
	.inp:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-wash);
	}
	.inp:disabled {
		opacity: 0.6;
	}
	.err-banner {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		margin-bottom: 18px;
		border-radius: var(--r-2);
		background: var(--danger-dim);
		border: 1px solid var(--danger);
		color: var(--danger);
		font: var(--body-sm);
	}
	.spec-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.spec-btn {
		all: unset;
		cursor: pointer;
		min-height: 56px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		background: var(--bg-3);
		color: var(--ink-1);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		transition: all 140ms var(--ease);
	}
	.spec-btn:hover {
		border-color: var(--ink-line);
	}
	.spec-btn.on {
		background: var(--accent-wash);
		color: var(--accent-2);
		border-color: var(--accent);
	}
	.spec-check {
		min-width: 14px;
		font: 500 13px var(--font-sans);
		color: var(--accent);
	}
	.spec-name {
		font: 500 13px var(--font-sans);
		line-height: 1.2;
	}
	.spec-sub {
		font: 400 11px var(--font-sans);
		color: var(--ink-3);
		margin-top: 2px;
	}

	.row-actions {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.btn-ghost {
		all: unset;
		cursor: pointer;
		padding: 0 14px;
		height: 44px;
		display: flex;
		align-items: center;
		font: 500 13px var(--font-sans);
		color: var(--ink-2);
		border-radius: var(--r-2);
		transition: color 140ms var(--ease);
	}
	.btn-ghost:hover {
		color: var(--ink-0);
	}
	.btn-text-only {
		all: unset;
		cursor: pointer;
		font: 500 13px var(--font-sans);
		color: var(--ink-2);
		padding: 8px;
		transition: color 140ms var(--ease);
	}
	.btn-text-only:hover {
		color: var(--ink-0);
	}

	/* step 3 done */
	.done-hero {
		text-align: left;
		margin-bottom: 28px;
	}
	.done-check {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--accent-wash);
		border: 1.5px solid var(--accent);
		color: var(--accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font: 600 24px var(--font-sans);
		margin-bottom: 18px;
		box-shadow: var(--glow-accent);
		animation: pulse 1.6s ease-out;
	}
	@keyframes pulse {
		0% {
			transform: scale(0.6);
			opacity: 0;
		}
		60% {
			transform: scale(1.08);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}
	.next-steps {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.next-card {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		text-decoration: none;
		transition: all 140ms var(--ease);
	}
	.next-card:hover {
		border-color: var(--accent);
		background: var(--bg-3);
	}
	.next-ico {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: var(--accent-wash);
		color: var(--accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font: 600 18px var(--font-sans);
		flex-shrink: 0;
	}
	.next-title {
		font: 500 14px var(--font-sans);
		color: var(--ink-0);
		margin-bottom: 2px;
	}
	.next-desc {
		font: 400 12.5px var(--font-sans);
		color: var(--ink-2);
	}
	.next-arrow {
		font: 500 16px var(--font-sans);
		color: var(--ink-3);
		transition: all 140ms var(--ease);
	}
	.next-card:hover .next-arrow {
		color: var(--accent);
		transform: translateX(2px);
	}

	.trust-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 28px;
		padding-top: 18px;
		border-top: 1px solid var(--ink-line);
		font: var(--label-mono);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.trust-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}

	@media (max-width: 540px) {
		.onb-frame {
			padding: 28px 22px;
		}
		.onb-h1 {
			font-size: 28px;
		}
		.spec-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
