<script lang="ts">
	import { Button, Eyebrow } from '$lib/components/ui';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let password = $state('');
	let confirm = $state('');
	let submitting = $state(false);

	// O load do server consome o token (?token_hash ou ?code) e cria a sessão
	// de recovery. Se falhou, data.tokenError desabilita o form — sem sessão
	// o updateUser da action falharia de qualquer jeito.
	const disabled = $derived(Boolean(data.tokenError));
</script>

<svelte:head>
	<title>Redefinir senha · Preceptor Fisic</title>
</svelte:head>

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

		<Eyebrow>◆ Defina nova senha</Eyebrow>
		<h1 class="rec-h1">Quase lá.</h1>
		<p class="rec-sub">
			Escolha uma senha forte de pelo menos 8 caracteres. Você usará ela pra entrar a partir de
			agora.
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
			{#if data.tokenError}
				<div class="err-banner">
					⚠ {data.tokenError}
					<a href="/recuperar" style="color:inherit">Solicitar novo link</a>
				</div>
			{:else if form?.error}
				<div class="err-banner">⚠ {form.error}</div>
			{/if}

			<div style="margin-bottom:14px">
				<label class="lbl" for="rd-pass">Nova senha</label>
				<input
					id="rd-pass"
					class="inp"
					type="password"
					name="password"
					bind:value={password}
					required
					minlength="8"
					placeholder="Mínimo 8 caracteres"
					autocomplete="new-password"
					autofocus
					disabled={disabled}
				/>
			</div>

			<div>
				<label class="lbl" for="rd-confirm">Confirme a senha</label>
				<input
					id="rd-confirm"
					class="inp"
					type="password"
					name="confirm"
					bind:value={confirm}
					required
					minlength="8"
					placeholder="Digite de novo"
					autocomplete="new-password"
					disabled={disabled}
				/>
			</div>

			<Button
				type="submit"
				size="lg"
				disabled={submitting || disabled}
				style="width:100%;margin-top:18px;justify-content:center"
			>
				{submitting ? 'Salvando…' : 'Redefinir senha →'}
			</Button>
		</form>
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
		color: var(--on-accent);
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
</style>
