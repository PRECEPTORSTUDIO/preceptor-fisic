<script lang="ts">
	import { Button, Chip, Avatar } from '$lib/components/ui';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const pro = $derived(data.professional);

	// Só abas com conteúdo REAL. As demais (equipe, plano/cobrança,
	// integrações, notificações) eram mockups de protótipo — dados fake de
	// cartão/faturas/integrações "conectadas" não podem ir pro ar. Cada aba
	// volta quando a feature de verdade existir; o roadmap abaixo dá
	// visibilidade honesta do que vem.
	type TabId = 'perfil';
	let tab = $state<TabId>('perfil');
	let savingProfile = $state(false);

	const TABS: { id: TabId; label: string; icon: string }[] = [
		{ id: 'perfil', label: 'Perfil', icon: '◉' }
	];

	const ROADMAP = [
		{ icon: '◈', label: 'Equipe', desc: 'Convide outros profissionais pra mesma conta' },
		{ icon: '◇', label: 'Plano e cobrança', desc: 'Assinatura, faturas e upgrade' },
		{ icon: '↔', label: 'Integrações', desc: 'Google Calendar, WhatsApp, Stripe' },
		{ icon: '◑', label: 'Notificações', desc: 'Alertas de aderência e mensagens' }
	];
</script>

<div class="cfg-page" style="flex:1;overflow-y:auto;background:var(--bg-0)">
	<div class="cfg-pagehead" style="padding:32px 40px;border-bottom:1px solid var(--ink-line)">
		<div class="eyebrow" style="margin-bottom:6px">Configurações</div>
		<h1 style="font:500 32px var(--font-sans);margin:0;letter-spacing:-0.02em">Conta e preferências</h1>
	</div>

	<div class="cfg-grid" style="display:grid;grid-template-columns:240px 1fr;min-height:calc(100vh - 130px)">
		<!-- Sub-nav -->
		<div class="cfg-subnav" style="border-right:1px solid var(--ink-line);padding:20px 12px">
			<div class="cfg-tabs">
				{#each TABS as t (t.id)}
					{@const on = tab === t.id}
					<button
						onclick={() => (tab = t.id)}
						class="cfg-tab"
						class:on
						style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:{on
							? 'var(--bg-3)'
							: 'transparent'};border:0;cursor:pointer;border-radius:var(--r-2);color:{on
							? 'var(--ink-0)'
							: 'var(--ink-1)'};font:500 13px var(--font-sans);text-align:left"
					>
						<span style="width:16px;color:{on ? 'var(--accent)' : 'var(--ink-2)'}">{t.icon}</span>
						{t.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="cfg-content" style="padding:32px 40px 80px;max-width:760px">
			{#if tab === 'perfil'}
				<form
					method="POST"
					action="?/saveProfile"
					use:enhance={() => {
						savingProfile = true;
						return async ({ update }) => {
							await update();
							savingProfile = false;
							await invalidateAll();
						};
					}}
				>
					{#if form?.success}
						<div
							style="padding:10px 14px;margin-bottom:14px;background:var(--success-dim);border:1px solid var(--success);border-radius:var(--r-2);color:var(--success);font:var(--body-sm)"
						>✓ {(form as any).msg ?? 'Salvo.'}</div>
					{/if}
					{#if form?.error}
						<div
							style="padding:10px 14px;margin-bottom:14px;background:var(--danger-dim);border:1px solid var(--danger);border-radius:var(--r-2);color:var(--danger);font:var(--body-sm)"
						>{form.error}</div>
					{/if}

					<h2 style="font:500 18px var(--font-sans);margin:0 0 14px;letter-spacing:-0.01em">Identidade profissional</h2>
					<div class="card" style="padding:24px;margin-bottom:20px">
						<div style="display:flex;align-items:center;gap:18px;margin-bottom:18px">
							<Avatar name={pro?.name ?? 'Profissional'} size={72} />
						</div>

						<div style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0;border-top:1px solid var(--ink-line)">
							<label class="lbl" for="cfg-name">Nome</label>
							<input id="cfg-name" class="settings-inp" name="name" required value={pro?.name ?? ''} />
						</div>
						<div style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0;border-top:1px solid var(--ink-line)">
							<div>
								<label class="lbl" for="cfg-email">E-mail</label>
								<div style="font:var(--label-mono);color:var(--ink-3);margin-top:4px">via Supabase Auth</div>
							</div>
							<input id="cfg-email" class="settings-inp" type="email" disabled value={pro?.email ?? ''} />
						</div>
						<div style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0;border-top:1px solid var(--ink-line)">
							<div>
								<label class="lbl" for="cfg-cref">CREF / CREFITO</label>
								<div style="font:var(--label-mono);color:var(--ink-3);margin-top:4px">Aparece pra alunos</div>
							</div>
							<input id="cfg-cref" class="settings-inp" name="cref" placeholder="CREF 123456-G" value={pro?.cref ?? ''} />
						</div>
						<div style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0;border-top:1px solid var(--ink-line)">
							<label class="lbl" for="cfg-spec">Especialidade</label>
							<select id="cfg-spec" class="settings-inp" name="specialty">
								<option value="prescricao_clinica" selected={pro?.specialty === 'prescricao_clinica'}>Prescrição clínica</option>
								<option value="treinamento_funcional" selected={pro?.specialty === 'treinamento_funcional'}>Treinamento funcional</option>
								<option value="reabilitacao" selected={pro?.specialty === 'reabilitacao'}>Reabilitação</option>
								<option value="musculacao" selected={pro?.specialty === 'musculacao'}>Musculação</option>
								<option value="personal" selected={pro?.specialty === 'personal'}>Personal</option>
								<option value="pilates" selected={pro?.specialty === 'pilates'}>Pilates</option>
								<option value="outro" selected={pro?.specialty === 'outro'}>Outro</option>
							</select>
						</div>

						<div style="display:flex;justify-content:flex-end;padding-top:18px;border-top:1px solid var(--ink-line);margin-top:6px">
							<Button type="submit" disabled={savingProfile}>
								{savingProfile ? 'Salvando…' : 'Salvar perfil'}
							</Button>
						</div>
					</div>
				</form>

				<h2 style="font:500 18px var(--font-sans);margin:0 0 14px;letter-spacing:-0.01em">Senha e segurança</h2>
				<div class="card" style="padding:24px;margin-bottom:28px;opacity:0.7">
					<div style="font:var(--body-sm);color:var(--ink-2)">
						Em breve — gestão de senha, 2FA e sessões ativas.
						Pra trocar a senha agora, use "Esqueci minha senha" na tela de login.
					</div>
				</div>

				<h2 style="font:500 18px var(--font-sans);margin:0 0 14px;letter-spacing:-0.01em">Em desenvolvimento</h2>
				<div class="card" style="padding:24px;opacity:0.75">
					{#each ROADMAP as r, i (r.label)}
						<div
							style="display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:13px 0;{i ? 'border-top:1px solid var(--ink-line)' : ''}"
						>
							<span style="width:20px;color:var(--ink-2)">{r.icon}</span>
							<div>
								<div style="font:500 14px var(--font-sans);color:var(--ink-1)">{r.label}</div>
								<div style="font:var(--body-sm);color:var(--ink-3)">{r.desc}</div>
							</div>
							<Chip>em breve</Chip>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.lbl {
		font: 500 13px var(--font-sans);
		color: var(--ink-1);
	}
	.settings-inp {
		width: 100%;
		box-sizing: border-box;
		height: 38px;
		padding: 0 12px;
		background: var(--bg-3);
		border: 1px solid var(--ink-line-2);
		border-radius: var(--r-1);
		color: var(--ink-0);
		font: 400 14px var(--font-sans);
		outline: none;
	}
	.settings-inp:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-wash);
	}
	.settings-inp:disabled {
		opacity: 0.6;
	}
	.cfg-tabs {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	@media (max-width: 1023px) {
		.cfg-pagehead {
			padding: 16px 16px !important;
		}
		.cfg-pagehead :global(h1) {
			font-size: 22px !important;
		}
		.cfg-grid {
			grid-template-columns: 1fr !important;
			min-height: auto !important;
		}
		.cfg-subnav {
			border-right: 0 !important;
			border-bottom: 1px solid var(--ink-line);
			padding: 12px 8px !important;
			overflow-x: auto;
		}
		.cfg-tabs {
			display: flex !important;
			flex-direction: row !important;
			flex-wrap: nowrap;
			gap: 6px !important;
			min-width: max-content;
		}
		.cfg-tab {
			flex-shrink: 0;
			white-space: nowrap;
		}
		.cfg-content {
			padding: 16px 14px 48px !important;
			max-width: none !important;
		}
		/* Forms: 180px label + 1fr input → label em cima do input */
		.cfg-content :global(div[style*="grid-template-columns:180px 1fr"]) {
			grid-template-columns: 1fr !important;
			gap: 8px !important;
		}
	}
</style>
