<script lang="ts">
	import { Button, Eyebrow } from '$lib/components/ui';
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let email = $state('');
	let submitting = $state(false);
</script>

<div class="rec-shell">
	<div class="rec-glow"></div>
	<div class="rec-frame">
		<header class="brand">
			<div class="logo">P</div>
			<div>
				<div class="brand-name">Preceptor Fisic</div>
				<div class="brand-sub">PRO · v3.2</div>
			</div>
		</header>

		{#if form?.success}
			<div style="text-align:left">
				<div class="check">✓</div>
				<Eyebrow>◆ Email enviado</Eyebrow>
				<h1 class="rec-h1">Confira sua caixa de entrada.</h1>
				<p class="rec-sub">
					Se houver uma conta vinculada a <strong>{form.email}</strong>, você vai receber um link
					nos próximos minutos pra redefinir a senha.
				</p>
				<p class="rec-sub" style="margin-top:14px">
					Não chegou? Verifique a pasta de spam, ou tente outro email.
				</p>
				<a href="/login" class="btn-link">← Voltar pro login</a>
			</div>
		{:else}
			<Eyebrow>◆ Recuperação de senha</Eyebrow>
			<h1 class="rec-h1">Esqueceu a senha?</h1>
			<p class="rec-sub">
				Digite o email que você usa pra entrar. Vamos enviar um link pra você redefinir a senha.
			</p>

			<form
				method="POST"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
				style="margin-top:24px"
			>
				{#if form?.error}
					<div class="err-banner">⚠ {form.error}</div>
				{/if}

				<label class="lbl" for="rec-email">E-mail profissional</label>
				<input
					id="rec-email"
					class="inp"
					type="email"
					name="email"
					bind:value={email}
					value={form?.email ?? email}
					placeholder="seu@email.com"
					required
					autocomplete="email"
					autofocus
				/>

				<Button type="submit" size="lg" disabled={submitting} style="width:100%;margin-top:18px;justify-content:center">
					{submitting ? 'Enviando…' : 'Enviar link de recuperação →'}
				</Button>

				<a href="/login" class="btn-link" style="margin-top:18px;display:block;text-align:center">
					← Voltar pro login
				</a>
			</form>
		{/if}
	</div>
</div>

<style>
	.rec-shell {
		min-height: 100vh;
		background: var(--bg-0);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 16px;
		position: relative;
		overflow: hidden;
	}
	.rec-glow {
		position: absolute;
		top: -240px;
		left: 50%;
		transform: translateX(-50%);
		width: 760px;
		height: 760px;
		background: radial-gradient(circle, var(--accent-glow) 0%, transparent 65%);
		pointer-events: none;
	}
	.rec-frame {
		width: 100%;
		max-width: 460px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
		padding: 36px 32px;
		position: relative;
		box-shadow: var(--shadow-pop);
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
	.rec-h1 {
		font: 500 28px var(--font-sans);
		margin: 8px 0 8px;
		letter-spacing: -0.022em;
		color: var(--ink-0);
	}
	.rec-sub {
		font: 400 14px/1.55 var(--font-sans);
		color: var(--ink-2);
		margin: 0;
		max-width: 380px;
	}
	.rec-sub strong {
		color: var(--ink-0);
	}
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
	.err-banner {
		padding: 10px 14px;
		margin-bottom: 14px;
		border-radius: var(--r-2);
		background: var(--danger-dim);
		border: 1px solid var(--danger);
		color: var(--danger);
		font: var(--body-sm);
	}
	.btn-link {
		font: 500 13px var(--font-sans);
		color: var(--ink-2);
		text-decoration: none;
		transition: color 140ms var(--ease);
	}
	.btn-link:hover {
		color: var(--ink-0);
	}
	.check {
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
	}
</style>
