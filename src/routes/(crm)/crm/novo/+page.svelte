<script lang="ts">
	import { Button, Eyebrow } from '$lib/components/ui';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Novo lead · CRM · PreceptorFISIC</title>
</svelte:head>

<div class="page">
	<header class="hdr">
		<button class="back" onclick={() => goto('/crm')} aria-label="Voltar">←</button>
		<div>
			<Eyebrow>CRM · Novo lead</Eyebrow>
			<h1 class="h1">Adicionar lead</h1>
		</div>
	</header>

	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
		class="form"
	>
		{#if form?.error}
			<div class="err">⚠ {form.error}</div>
		{/if}

		<div class="card">
			<div class="row">
				<label class="lbl">Nome <span class="req">*</span></label>
				<input
					name="name"
					required
					class="inp"
					placeholder="Ex: Pedro Henrique"
					value={(form as any)?.values?.name ?? ''}
				/>
			</div>

			<div class="row two">
				<div>
					<label class="lbl">Telefone</label>
					<input
						name="phone"
						class="inp"
						placeholder="(11) 99999-9999"
						value={(form as any)?.values?.phone ?? ''}
					/>
				</div>
				<div>
					<label class="lbl">E-mail</label>
					<input
						type="email"
						name="email"
						class="inp"
						placeholder="pedro@exemplo.com"
						value={(form as any)?.values?.email ?? ''}
					/>
				</div>
			</div>

			<div class="row two">
				<div>
					<label class="lbl">Fonte</label>
					<select name="source" class="inp">
						<option value="instagram">Instagram</option>
						<option value="indicacao">Indicação</option>
						<option value="anuncio">Anúncio</option>
						<option value="site">Site</option>
						<option value="whatsapp">WhatsApp</option>
						<option value="outro" selected>Outro</option>
					</select>
				</div>
				<div>
					<label class="lbl">Estágio</label>
					<select name="stage" class="inp">
						<option value="visitante" selected>Visitante</option>
						<option value="cadastrou">Cadastrou</option>
						<option value="ativou_aluno">Ativou aluno</option>
						<option value="trial">Trial</option>
						<option value="pagante">Pagante</option>
					</select>
				</div>
			</div>

			<div class="row">
				<label class="lbl">Próximo follow-up</label>
				<input type="datetime-local" name="nextFollowUpAt" class="inp" />
				<div class="hint">Quando lembrar de entrar em contato de novo (opcional).</div>
			</div>

			<div class="row">
				<label class="lbl">Notas</label>
				<textarea
					name="notes"
					rows="4"
					class="inp"
					placeholder="Ex: Quer começar segunda. Interessada em musculação 3x/sem. Indicação da Beatriz."
				></textarea>
			</div>
		</div>

		<div class="actions">
			<Button variant="secondary" onclick={() => goto('/crm')}>Cancelar</Button>
			<Button type="submit" disabled={submitting}>
				{submitting ? 'Salvando…' : '+ Criar lead'}
			</Button>
		</div>
	</form>
</div>

<style>
	.page {
		padding: 28px 32px 64px;
		max-width: 720px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.hdr {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.back {
		width: 36px;
		height: 36px;
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-1);
		color: var(--ink-1);
		cursor: pointer;
		font-size: 18px;
	}
	.h1 {
		margin: 6px 0 0;
		font: 600 22px var(--font-sans);
		letter-spacing: -0.02em;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.card {
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
		padding: 22px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.row.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
	}
	.row.two > div {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.lbl {
		font: var(--label-mono);
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.req {
		color: var(--danger);
	}
	.inp {
		width: 100%;
		box-sizing: border-box;
		padding: 10px 14px;
		background: var(--bg-1);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-1);
		color: var(--ink-0);
		font: 400 14px var(--font-sans);
		outline: none;
	}
	.inp:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-wash);
	}
	textarea.inp {
		resize: vertical;
		min-height: 80px;
		font-family: var(--font-sans);
		line-height: 1.5;
	}
	.hint {
		font: var(--label-mono);
		color: var(--ink-3);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
	.err {
		padding: 12px 14px;
		background: var(--danger-dim);
		border: 1px solid var(--danger);
		border-radius: var(--r-2);
		color: var(--danger);
		font: var(--body-sm);
	}
	@media (max-width: 1023px) {
		.page {
			padding: 16px 14px 48px;
		}
		.row.two {
			grid-template-columns: 1fr;
		}
		.actions {
			flex-direction: column-reverse;
		}
		.actions :global(.pf-btn) {
			width: 100%;
			justify-content: center;
		}
	}
</style>
