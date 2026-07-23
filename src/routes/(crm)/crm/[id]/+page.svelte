<script lang="ts">
	import { Button, Chip, Eyebrow, Avatar, toast } from '$lib/components/ui';
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { LeadStage, LeadSource } from '$lib/server/queries';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const lead = $derived(data.lead);

	const STAGES: { id: LeadStage; label: string; color: string }[] = [
		{ id: 'visitante', label: 'Visitante', color: 'var(--ink-2)' },
		{ id: 'cadastrou', label: 'Cadastrou', color: 'var(--info)' },
		{ id: 'ativou_aluno', label: 'Ativou aluno', color: 'var(--accent-2)' },
		{ id: 'trial', label: 'Trial', color: 'var(--warn)' },
		{ id: 'pagante', label: 'Pagante', color: 'var(--success)' },
		{ id: 'cancelado', label: 'Cancelado', color: 'var(--ink-3)' },
		{ id: 'perdido', label: 'Perdido', color: 'var(--danger)' }
	];
	const SOURCES: { id: LeadSource; label: string }[] = [
		{ id: 'instagram', label: 'Instagram' },
		{ id: 'indicacao', label: 'Indicação' },
		{ id: 'anuncio', label: 'Anúncio' },
		{ id: 'site', label: 'Site' },
		{ id: 'whatsapp', label: 'WhatsApp' },
		{ id: 'outro', label: 'Outro' }
	];

	let saving = $state(false);
	let confirmingDelete = $state(false);

	// wa.me exige formato internacional: número BR local (10-11 dígitos,
	// DDD+número) ganha prefixo 55; já-internacional passa direto.
	function waPhone(phone: string): string {
		const digits = phone.replace(/\D/g, '');
		return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
	}

	// Bind local form state pro stage atual (controla visibilidade do lostReason)
	let stage = $state<LeadStage>(lead.stage);
	$effect(() => {
		stage = lead.stage;
	});

	function fmtDatetimeLocal(d: Date | null | string): string {
		if (!d) return '';
		const date = typeof d === 'string' ? new Date(d) : d;
		const yyyy = date.getFullYear();
		const mm = String(date.getMonth() + 1).padStart(2, '0');
		const dd = String(date.getDate()).padStart(2, '0');
		const hh = String(date.getHours()).padStart(2, '0');
		const mi = String(date.getMinutes()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
	}

	function fmtDate(d: Date | null | string): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('pt-BR', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}

	const stageColor = $derived(STAGES.find((s) => s.id === lead.stage)?.color ?? 'var(--ink-2)');
	const stageLabel = $derived(STAGES.find((s) => s.id === lead.stage)?.label ?? lead.stage);
</script>

<svelte:head>
	<title>{lead.name} · CRM · PreceptorFISIC</title>
</svelte:head>

<div class="page">
	<header class="hdr">
		<button class="back" onclick={() => goto('/crm')} aria-label="Voltar">←</button>
		<div class="hdr-info">
			<Eyebrow>CRM · Lead</Eyebrow>
			<h1 class="h1">{lead.name}</h1>
			<div style="display:flex;align-items:center;gap:8px;margin-top:6px">
				<span class="stage-pill" style="color:{stageColor};border-color:{stageColor}33;background:{stageColor}10">
					● {stageLabel}
				</span>
				<span style="font:var(--label-mono);color:var(--ink-3)">Criado em {fmtDate(lead.createdAt)}</span>
			</div>
		</div>
	</header>

	{#if form?.success && (form as any).action === 'save'}
		<div class="ok">✓ Salvo</div>
	{/if}
	{#if form?.error}
		<div class="err">⚠ {form.error}</div>
	{/if}

	<div class="grid">
		<!-- Form de edição -->
		<form
			method="POST"
			action="?/save"
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					await update();
					saving = false;
					await invalidateAll();
				};
			}}
			class="form card"
		>
			<div class="row">
				<label class="lbl">Nome</label>
				<input name="name" required class="inp" value={lead.name} />
			</div>

			<div class="row two">
				<div>
					<label class="lbl">Telefone</label>
					<input name="phone" class="inp" placeholder="(11) 99999-9999" value={lead.phone ?? ''} />
				</div>
				<div>
					<label class="lbl">E-mail</label>
					<input type="email" name="email" class="inp" value={lead.email ?? ''} />
				</div>
			</div>

			<div class="row two">
				<div>
					<label class="lbl">Fonte</label>
					<select name="source" class="inp" value={lead.source}>
						{#each SOURCES as s (s.id)}
							<option value={s.id}>{s.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="lbl">Estágio</label>
					<select name="stage" class="inp" bind:value={stage}>
						{#each STAGES as s (s.id)}
							<option value={s.id}>{s.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="row">
				<label class="lbl">Próximo follow-up</label>
				<input
					type="datetime-local"
					name="nextFollowUpAt"
					class="inp"
					value={fmtDatetimeLocal(lead.nextFollowUpAt)}
				/>
			</div>

			{#if stage === 'perdido' || stage === 'cancelado'}
				<div class="row">
					<label class="lbl">
						{stage === 'perdido' ? 'Motivo da perda' : 'Motivo do cancelamento'}
					</label>
					<input
						name="lostReason"
						class="inp"
						placeholder="Ex: Preço alto, foi pra concorrente, deixou de usar…"
						value={lead.lostReason ?? ''}
					/>
				</div>
			{/if}

			<div class="row">
				<label class="lbl">Notas</label>
				<textarea name="notes" rows="6" class="inp">{lead.notes ?? ''}</textarea>
			</div>

			<div class="form-actions">
				<Button type="submit" disabled={saving}>
					{saving ? 'Salvando…' : 'Salvar alterações'}
				</Button>
			</div>
		</form>

		<!-- Sidebar com infos rápidas -->
		<aside class="sidebar">
			<div class="card">
				<Eyebrow>Contato rápido</Eyebrow>
				<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
					{#if lead.phone}
						<a
							class="quick-action"
							href="https://wa.me/{waPhone(lead.phone)}"
							target="_blank"
							rel="noopener"
						>
							<span>WhatsApp</span>
							<span class="num">{lead.phone}</span>
						</a>
						<a class="quick-action" href="tel:{lead.phone}">
							<span>Ligar</span>
							<span class="num">{lead.phone}</span>
						</a>
					{/if}
					{#if lead.email}
						<a class="quick-action" href="mailto:{lead.email}">
							<span>E-mail</span>
							<span class="email-val">{lead.email}</span>
						</a>
					{/if}
					{#if !lead.phone && !lead.email}
						<div style="font:var(--body-sm);color:var(--ink-3);text-align:center;padding:14px 0">
							Sem contato cadastrado
						</div>
					{/if}
				</div>
			</div>

			<div class="card">
				<Eyebrow>Timeline</Eyebrow>
				<div style="margin-top:14px;display:flex;flex-direction:column;gap:12px">
					<div class="timeline-item">
						<div class="t-dot" style="background:var(--accent)"></div>
						<div>
							<div style="font:500 13px var(--font-sans);color:var(--ink-0)">Lead criado</div>
							<div style="font:var(--label-mono);color:var(--ink-3);margin-top:2px">
								{fmtDate(lead.createdAt)}
							</div>
						</div>
					</div>
					{#if lead.nextFollowUpAt}
						<div class="timeline-item">
							<div class="t-dot" style="background:var(--warn)"></div>
							<div>
								<div style="font:500 13px var(--font-sans);color:var(--ink-0)">Próximo follow-up</div>
								<div style="font:var(--label-mono);color:var(--warn);margin-top:2px">
									{fmtDate(lead.nextFollowUpAt)}
								</div>
							</div>
						</div>
					{/if}
					{#if lead.subjectProfessionalId}
						<div class="timeline-item">
							<div class="t-dot" style="background:var(--info)"></div>
							<div>
								<div style="font:500 13px var(--font-sans);color:var(--info)">
									Usuário da plataforma
								</div>
								<div style="font:var(--label-mono);color:var(--ink-3);margin-top:2px">
									Cadastro vinculado à plataforma
								</div>
							</div>
						</div>
					{/if}
					{#if lead.stage === 'pagante'}
						<div class="timeline-item">
							<div class="t-dot" style="background:var(--success)"></div>
							<div>
								<div style="font:500 13px var(--font-sans);color:var(--success)">
									Assinatura ativa
								</div>
								<div style="font:var(--label-mono);color:var(--ink-3);margin-top:2px">
									{fmtDate(lead.updatedAt)}
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<div class="card danger-card">
				<Eyebrow>Zona perigosa</Eyebrow>
				<div style="font:var(--body-sm);color:var(--ink-2);margin-top:6px;margin-bottom:12px">
					Remove permanentemente este lead. Não pode ser desfeito.
				</div>
				{#if !confirmingDelete}
					<button type="button" class="del-btn" onclick={() => (confirmingDelete = true)}>
						Excluir lead
					</button>
				{:else}
					<form method="POST" action="?/delete" use:enhance>
						<div style="font:var(--body-sm);color:var(--danger);margin-bottom:10px">
							Confirma a exclusão de "{lead.name}"?
						</div>
						<div style="display:flex;gap:8px">
							<button type="submit" class="del-btn confirm">Sim, excluir</button>
							<button type="button" class="del-btn cancel" onclick={() => (confirmingDelete = false)}>
								Cancelar
							</button>
						</div>
					</form>
				{/if}
			</div>
		</aside>
	</div>
</div>

<style>
	.page {
		padding: 28px 32px 64px;
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.hdr {
		display: flex;
		align-items: center;
		gap: 16px;
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
		flex-shrink: 0;
	}
	.hdr-info {
		flex: 1;
		min-width: 0;
	}
	.h1 {
		margin: 6px 0 0;
		font: 600 24px var(--font-sans);
		letter-spacing: -0.02em;
	}
	.hdr-actions {
		flex-shrink: 0;
	}
	.stage-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 10px;
		border: 1px solid;
		border-radius: var(--r-pill);
		font: var(--label-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 16px;
		align-items: start;
	}
	.card {
		background: var(--bg-2);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-3);
		padding: 22px;
	}
	.form {
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
		min-height: 100px;
		font-family: var(--font-sans);
		line-height: 1.5;
	}
	.form-actions {
		display: flex;
		justify-content: flex-end;
		padding-top: 10px;
		border-top: 1px solid var(--ink-line);
	}

	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.quick-action {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		background: var(--bg-3);
		border: 1px solid var(--ink-line);
		border-radius: var(--r-2);
		color: var(--ink-1);
		font: var(--body-sm);
		text-decoration: none;
		transition: all 140ms var(--ease);
	}
	.quick-action:hover {
		background: var(--bg-4);
		border-color: var(--accent-dim);
		color: var(--accent);
	}
	.quick-action .num,
	.quick-action .email-val {
		font: 500 13px var(--font-mono);
		color: var(--ink-0);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 60%;
	}
	.email-val {
		font-family: var(--font-mono);
	}

	.timeline-item {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.t-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		margin-top: 5px;
		flex-shrink: 0;
	}

	.danger-card {
		border-color: rgba(248, 113, 113, 0.25);
	}
	.del-btn {
		all: unset;
		cursor: pointer;
		padding: 8px 14px;
		background: var(--bg-3);
		border: 1px solid var(--danger);
		color: var(--danger);
		border-radius: var(--r-1);
		font: 500 13px var(--font-sans);
		display: inline-block;
	}
	.del-btn:hover {
		background: var(--danger-dim);
	}
	.del-btn.confirm {
		background: var(--danger);
		color: var(--on-accent);
		border-color: var(--danger);
	}
	.del-btn.cancel {
		background: transparent;
		color: var(--ink-2);
		border-color: var(--ink-line);
	}

	.ok {
		padding: 10px 14px;
		background: var(--success-dim);
		border: 1px solid var(--success);
		border-radius: var(--r-2);
		color: var(--success);
		font: var(--body-sm);
	}
	.err {
		padding: 10px 14px;
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
		.hdr {
			flex-wrap: wrap;
		}
		.hdr-actions {
			width: 100%;
		}
		.hdr-actions :global(.pf-btn),
		.hdr-actions form {
			width: 100%;
		}
		.hdr-actions :global(.pf-btn) {
			width: 100%;
			justify-content: center;
		}
		.grid {
			grid-template-columns: 1fr;
		}
		.row.two {
			grid-template-columns: 1fr;
		}
		.h1 {
			font-size: 20px;
		}
	}
</style>
