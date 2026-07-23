<script lang="ts">
	import { Button, Eyebrow, BrandMark } from '$lib/components/ui';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { slide } from 'svelte/transition';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	// ?mode=signup abre direto na aba de cadastro (CTAs "Criar conta" da landing).
	let mode = $state<'login' | 'signup'>(
		page.url.searchParams.get('mode') === 'signup' ? 'signup' : 'login'
	);
	let email = $state(form?.email ?? '');
	let pass = $state('');
	let name = $state('');
	let cref = $state('');
	let acceptedTerms = $state(false);
	let focused = $state<string | null>(null);
	let submitting = $state(false);

	// Deep link preservado pelo authGuard — repassado via hidden input
	// (action="?/{mode}" descarta a query da URL no POST).
	const next = $derived(page.url.searchParams.get('next') ?? '');
	// Banner pós-redefinição de senha (/recuperar/redefinir → /login?reset=ok)
	const resetOk = $derived(page.url.searchParams.get('reset') === 'ok');

	// Fallback do signup (conta criada, auto-login falhou): volta pra aba
	// Entrar com o email preenchido.
	$effect(() => {
		if ((form as any)?.success) {
			mode = 'login';
			if ((form as any)?.email) email = (form as any).email;
		}
	});

	// Propostas de valor reais — sem métricas fabricadas (risco CDC/CONFEF
	// exibir números de usuários/aderência que não temos como comprovar).
	const stats = [
		{ num: '1.324', lbl: 'exercícios com vídeo demonstrativo' },
		{ num: '2.040', lbl: 'trechos de diretrizes ACSM/AHA indexados' },
		{ num: '23', lbl: 'regras de validação clínica automática' }
	];

	function fieldStyle(key: string) {
		const isFocused = focused === key;
		return `width:100%;height:44px;box-sizing:border-box;background:var(--bg-2);border:1px solid ${isFocused ? 'var(--accent)' : 'var(--ink-line-2)'};border-radius:var(--r-2);padding:0 14px;font:400 14px var(--font-sans);color:var(--ink-0);outline:none;transition:all 140ms var(--ease);${isFocused ? 'box-shadow:0 0 0 3px var(--accent-wash)' : ''}`;
	}
</script>

<svelte:head>
	<title>Entrar · PreceptorFISIC</title>
</svelte:head>

<div class="login-grid">
	<!-- Esquerda — marca + ambient -->
	<div class="login-left">
		<div class="login-glow login-glow--top"></div>
		<div class="login-glow login-glow--bottom"></div>

		<div class="enter" style="--d:0;display:flex;align-items:center;gap:12px;position:relative">
			<BrandMark size={34} />
			<div style="font:500 18px var(--font-sans);letter-spacing:-0.02em">Preceptor<span style="font-weight:700">FISIC</span></div>
		</div>

		<div style="flex:1;display:flex;align-items:center;position:relative">
			<div style="max-width:460px">
				<div class="eyebrow enter" style="--d:1;margin-bottom:18px">◆ Plataforma para profissionais</div>
				<h1 class="login-h1 enter" style="--d:2">
					Prescreva treinos<br />
					com <span class="login-accent">rigor clínico.</span>
				</h1>
				<p class="enter" style="--d:3;font:400 16px/1.5 var(--font-sans);color:var(--ink-1);margin-top:24px;max-width:420px">
					Plataforma para personal trainers, fisioterapeutas e clínicas que prescrevem exercícios para populações especiais.
				</p>

				<div style="margin-top:36px;display:flex;flex-direction:column;gap:14px">
					{#each stats as s, i (s.lbl)}
						<div
							class="enter"
							style="--d:{4 + i};display:flex;align-items:baseline;gap:14px;padding:12px 0;{i ? 'border-top:1px solid var(--ink-line)' : ''}"
						>
							<span class="num" style="font:var(--num-md);color:var(--ink-0);min-width:80px">{s.num}</span>
							<span style="font:400 14px/1.45 var(--font-sans);color:var(--ink-1)">{s.lbl}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="eyebrow" style="position:relative">v3.2.1 · Conformidade LGPD</div>
	</div>

	<!-- Direita — formulário -->
	<div class="login-right">
		<div class="login-card enter" style="--d:2;width:100%;max-width:380px">
			<div class="login-tabs" class:signup={mode === 'signup'}>
				<span class="login-tabs__pill" aria-hidden="true"></span>
				<button class:on={mode === 'login'} onclick={() => (mode = 'login')}>Entrar</button>
				<button class:on={mode === 'signup'} onclick={() => (mode = 'signup')}>Criar conta</button>
			</div>

			{#key mode}
				<div class="mode-swap">
					<h2 style="font:500 28px var(--font-sans);letter-spacing:-0.02em;margin:0 0 8px">
						{mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
					</h2>
					<p style="font:var(--body);color:var(--ink-2);margin:0 0 28px">
						{mode === 'login' ? 'Acesse sua área de profissional' : 'Crie sua conta de profissional'}
					</p>
				</div>
			{/key}

			<form
				method="POST"
				action="?/{mode}"
				style="display:flex;flex-direction:column;gap:14px"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update({ reset: false });
						submitting = false;
					};
				}}
			>
				{#if next}
					<input type="hidden" name="next" value={next} />
				{/if}
				{#if mode === 'signup'}
					<div transition:slide={{ duration: 240 }}>
						<div class="eyebrow" style="margin-bottom:6px">Nome completo</div>
						<input
							name="name"
							type="text"
							autocomplete="name"
							bind:value={name}
							placeholder="Matheus Castro"
							onfocus={() => (focused = 'name')}
							onblur={() => (focused = null)}
							style={fieldStyle('name')}
						/>
					</div>
				{/if}
				<div>
					<div class="eyebrow" style="margin-bottom:6px">E-mail profissional</div>
					<input
						name="email"
						type="email"
						autocomplete="email"
						bind:value={email}
						onfocus={() => (focused = 'email')}
						onblur={() => (focused = null)}
						style={fieldStyle('email')}
					/>
				</div>
				{#if mode === 'signup'}
					<div transition:slide={{ duration: 240 }}>
						<div class="eyebrow" style="margin-bottom:6px">Registro profissional</div>
						<input
							name="cref"
							type="text"
							bind:value={cref}
							placeholder="CREF 123456-G · CREFITO 0000"
							onfocus={() => (focused = 'cref')}
							onblur={() => (focused = null)}
							style={fieldStyle('cref')}
						/>
						<div style="font:var(--label-mono);color:var(--ink-3);margin-top:6px">CREF, CREFITO ou CRM</div>
					</div>
				{/if}
				<div>
					<div class="eyebrow" style="margin-bottom:6px">Senha</div>
					<input
						name="password"
						type="password"
						autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
						bind:value={pass}
						onfocus={() => (focused = 'pass')}
						onblur={() => (focused = null)}
						style={fieldStyle('pass')}
					/>
				</div>

				{#if mode === 'signup'}
					<!-- Consent LGPD explícito — obrigatório pra criar conta.
					     Server-side valida `accept_terms` na action signup. -->
					<label class="consent-row" transition:slide={{ duration: 240 }}>
						<input type="checkbox" name="accept_terms" bind:checked={acceptedTerms} required />
						<span>
							Li e concordo com os
							<a href="/legal/termos" target="_blank" rel="noopener">Termos de Uso</a>
							e a
							<a href="/legal/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.
						</span>
					</label>
				{/if}

				{#if resetOk && !form}
					<div
						style="padding:12px 14px;border-radius:var(--r-2);background:var(--success-dim);border:1px solid var(--success);color:var(--success);font:var(--body-sm);line-height:1.5"
					>✓ Senha redefinida — entre com a nova senha.</div>
				{/if}

				{#if form?.error}
					<div
						class="form-error"
						style="padding:10px 12px;border-radius:var(--r-2);background:var(--danger-dim);border:1px solid var(--danger);color:var(--danger);font:var(--body-sm)"
					>{form.error}</div>
				{/if}

				{#if (form as any)?.success && (form as any)?.message}
					<div
						style="padding:12px 14px;border-radius:var(--r-2);background:var(--success-dim);border:1px solid var(--success);color:var(--success);font:var(--body-sm);line-height:1.5"
					>✓ {(form as any).message}</div>
				{/if}

				{#if mode === 'login'}
					<div style="margin-top:-2px;text-align:right">
						<a href="/recuperar" style="font:500 13px var(--font-sans);color:var(--accent-2);text-decoration:none">Esqueci minha senha</a>
					</div>
				{/if}

				<Button
					size="lg"
					type="submit"
					disabled={submitting || (mode === 'signup' && !acceptedTerms)}
					style="width:100%;justify-content:center;margin-top:10px"
				>
					{#if submitting}
						{mode === 'login' ? 'Entrando…' : 'Criando…'}
					{:else}
						{mode === 'login' ? 'Entrar →' : 'Criar conta →'}
					{/if}
				</Button>
			</form>

			<!-- OAuth (Google/Apple) removido: botões eram decorativos, sem provider
			     configurado no Supabase. Reintroduzir só quando o fluxo funcionar. -->

			<div class="login-trust">
				<span style="color:var(--accent)">◆</span>
				<span style="font:var(--body-sm);color:var(--ink-1)">Dados na região BR · Conformidade LGPD</span>
			</div>
		</div>
	</div>
</div>

<style>
	.login-grid {
		width: 100%;
		height: 100vh;
		background: var(--bg-0);
		display: grid;
		grid-template-columns: 1fr 1fr;
		overflow: hidden;
	}
	.login-left {
		position: relative;
		overflow: hidden;
		background: linear-gradient(180deg, var(--bg-1) 0%, var(--bg-0) 100%);
		padding: 48px 56px;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--ink-line);
	}
	/* Entrada em cascata — cada bloco chega 70ms depois do anterior */
	.enter {
		animation: pf-fade-up 480ms var(--ease) backwards;
		animation-delay: calc(var(--d, 0) * 70ms);
	}
	.mode-swap {
		animation: pf-fade-up 240ms var(--ease) backwards;
	}
	.form-error {
		animation: login-shake 360ms var(--ease);
	}
	@keyframes login-shake {
		0%,
		100% {
			transform: translateX(0);
		}
		20% {
			transform: translateX(-5px);
		}
		40% {
			transform: translateX(5px);
		}
		60% {
			transform: translateX(-3px);
		}
		80% {
			transform: translateX(3px);
		}
	}
	.login-glow {
		position: absolute;
		pointer-events: none;
		animation: pf-glow-drift 14s ease-in-out infinite;
	}
	.login-glow--top {
		top: -100px;
		left: -100px;
		width: 480px;
		height: 480px;
		background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
	}
	.login-glow--bottom {
		bottom: -120px;
		right: -80px;
		width: 380px;
		height: 380px;
		background: radial-gradient(circle, rgba(167, 139, 250, 0.08) 0%, transparent 70%);
	}
	.login-h1 {
		font: 500 clamp(44px, 4.4vw, 60px) / 1.02 var(--font-sans);
		margin: 0;
		letter-spacing: -0.035em;
		color: var(--ink-0);
	}
	.login-accent {
		background: linear-gradient(120deg, var(--accent) 0%, var(--accent-2) 50%, #e0d4ff 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		font-style: italic;
		font-weight: 400;
	}
	.login-right {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 48px;
		background: var(--bg-0);
	}
	.login-tabs {
		position: relative;
		display: flex;
		gap: 4px;
		padding: 4px;
		border-radius: var(--r-2);
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		margin-bottom: 32px;
	}
	/* Pill que desliza por baixo dos botões na troca de aba */
	.login-tabs__pill {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 4px;
		width: calc(50% - 6px);
		border-radius: var(--r-1);
		background: var(--bg-4);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
		transition: transform 260ms var(--ease-spring);
	}
	.login-tabs.signup .login-tabs__pill {
		transform: translateX(calc(100% + 4px));
	}
	.login-tabs button {
		flex: 1;
		height: 36px;
		border: 0;
		cursor: pointer;
		border-radius: var(--r-1);
		background: transparent;
		color: var(--ink-2);
		font: 500 13px var(--font-sans);
		transition: color 140ms var(--ease);
		position: relative;
	}
	.login-tabs button.on {
		color: var(--ink-0);
	}
	.consent-row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 12px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-2);
		font: 400 12.5px/1.5 var(--font-sans);
		color: var(--ink-1);
		cursor: pointer;
	}
	.consent-row input {
		margin-top: 2px;
		accent-color: var(--accent);
		flex-shrink: 0;
	}
	.consent-row a {
		color: var(--accent-2);
	}
	.login-trust {
		margin-top: 28px;
		padding: 12px;
		border-radius: var(--r-2);
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		display: flex;
		align-items: center;
		gap: 10px;
	}

	@media (max-width: 900px) {
		.login-grid {
			grid-template-columns: 1fr;
		}
		.login-left {
			display: none;
		}
	}
</style>
