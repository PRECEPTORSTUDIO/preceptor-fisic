<script lang="ts">
	import { Button, Chip, Avatar, Eyebrow } from '$lib/components/ui';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const pro = $derived(data.professional);

	type TabId = 'perfil' | 'pratica' | 'equipe' | 'plano' | 'integ' | 'noti';
	let tab = $state<TabId>('perfil');
	let savingProfile = $state(false);

	const TABS: { id: TabId; label: string; icon: string }[] = [
		{ id: 'perfil', label: 'Perfil', icon: '◉' },
		{ id: 'pratica', label: 'Prática clínica', icon: '✚' },
		{ id: 'equipe', label: 'Equipe', icon: '◈' },
		{ id: 'plano', label: 'Plano e cobrança', icon: '◇' },
		{ id: 'integ', label: 'Integrações', icon: '↔' },
		{ id: 'noti', label: 'Notificações', icon: '◑' }
	];

	let twoFa = $state(true);

	const team = [
		{ name: 'Matheus Castro', role: 'Owner · Personal', email: 'matheus@studio.fit', status: 'active' as const },
		{ name: 'Beatriz Almeida', role: 'Personal · CREF 654321', email: 'bia@studio.fit', status: 'active' as const },
		{ name: 'Felipe Tanaka', role: 'Fisioterapeuta · CREFITO 987', email: 'felipe@studio.fit', status: 'invited' as const }
	];

	const integrations = [
		{ name: 'Google Calendar', desc: 'Sincronizar sessões agendadas', on: true, icon: '◫' },
		{ name: 'Apple Health', desc: 'Importar dados biométricos do aluno', on: true, icon: '+' },
		{ name: 'Strava', desc: 'Importar treinos de cardio', on: false, icon: '↗' },
		{ name: 'WhatsApp Business', desc: 'Enviar lembretes e planos via WhatsApp', on: false, icon: '✉' },
		{ name: 'Stripe', desc: 'Cobrança direta de alunos particulares', on: true, icon: '◇' }
	];

	const notifs = [
		['Aluno completou sessão', 'E-mail · push', true],
		['Aluno faltou treino agendado', 'E-mail · push', true],
		['Aderência abaixo de 70%', 'E-mail', true],
		['Avaliação física registrada', 'Push', true],
		['Mensagem nova de aluno', 'Push · WhatsApp', true],
		['Resumo semanal de toda a base', 'E-mail (segunda)', false],
		['Atualizações da plataforma', 'E-mail', false]
	] as [string, string, boolean][];

	let toggles = $state<Record<string, boolean>>(
		Object.fromEntries([...integrations, ...notifs.map(([t, , o]) => ({ name: t, on: o }))].map((it: any) => [it.name, it.on]))
	);
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
							<div>
								<Button variant="secondary" size="sm">Alterar foto</Button>
								<div style="font:var(--label-mono);color:var(--ink-3);margin-top:6px">JPG ou PNG · até 2MB</div>
							</div>
						</div>

						<div style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0;border-top:1px solid var(--ink-line)">
							<label class="lbl">Nome</label>
							<input class="settings-inp" name="name" required value={pro?.name ?? ''} />
						</div>
						<div style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0;border-top:1px solid var(--ink-line)">
							<div>
								<label class="lbl">E-mail</label>
								<div style="font:var(--label-mono);color:var(--ink-3);margin-top:4px">via Supabase Auth</div>
							</div>
							<input class="settings-inp" type="email" disabled value={pro?.email ?? ''} />
						</div>
						<div style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0;border-top:1px solid var(--ink-line)">
							<div>
								<label class="lbl">CREF / CREFITO</label>
								<div style="font:var(--label-mono);color:var(--ink-3);margin-top:4px">Aparece pra alunos</div>
							</div>
							<input class="settings-inp" name="cref" placeholder="CREF 123456-G" value={pro?.cref ?? ''} />
						</div>
						<div style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0;border-top:1px solid var(--ink-line)">
							<label class="lbl">Especialidade</label>
							<select class="settings-inp" name="specialty">
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
					</div>
				</div>

			{:else if tab === 'pratica'}
				<h2 style="font:500 18px var(--font-sans);margin:0 0 14px">Registro profissional</h2>
				<div class="card" style="padding:24px;margin-bottom:28px">
					{@render row('Conselho', undefined, 'select', 'cref')}
					{@render row('Número', 'Validado pelo CONFEF · ✓ ativo', 'text', '123456-G/SP')}
					<div
						style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0;border-top:1px solid var(--ink-line)"
					>
						<div style="font:500 13px var(--font-sans);color:var(--ink-1)">Especialidades</div>
						<div style="display:flex;flex-wrap:wrap;gap:6px">
							<Chip variant="active">Populações especiais</Chip>
							<Chip variant="active">Cardiopatias</Chip>
							<Chip variant="active">Reabilitação</Chip>
							<Chip>+ Adicionar</Chip>
						</div>
					</div>
				</div>

				<h2 style="font:500 18px var(--font-sans);margin:0 0 14px">Local de atendimento</h2>
				<div class="card" style="padding:24px">
					{@render row('Estúdio', undefined, 'text', 'Studio FIT — Vila Mariana')}
					{@render row('Endereço', undefined, 'text', 'Rua Domingos de Morais, 1267 · São Paulo/SP')}
					<div
						style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0;border-top:1px solid var(--ink-line)"
					>
						<div style="font:500 13px var(--font-sans);color:var(--ink-1)">Equipamentos disponíveis</div>
						<div style="display:flex;flex-wrap:wrap;gap:6px">
							{#each ['Rack', 'Halteres', 'Polias', 'Esteira', 'Bike erg', 'Trap-bar', 'Kettlebells', 'TRX'] as e (e)}
								<Chip variant="active">{e}</Chip>
							{/each}
							<Chip>+ Adicionar</Chip>
						</div>
					</div>
				</div>
			{:else if tab === 'equipe'}
				<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
					<h2 style="font:500 18px var(--font-sans);margin:0">Membros da equipe</h2>
					<Button size="sm">+ Convidar</Button>
				</div>
				<div class="card" style="padding:24px">
					{#each team as m, i (m.email)}
						<div
							style="display:grid;grid-template-columns:auto 1fr auto auto;gap:14px;align-items:center;padding:14px 0;{i
								? 'border-top:1px solid var(--ink-line)'
								: ''}"
						>
							<Avatar name={m.name} size={36} />
							<div>
								<div style="font:500 14px var(--font-sans);color:var(--ink-0)">{m.name}</div>
								<div style="font:var(--label-mono);color:var(--ink-2)">{m.role} · {m.email}</div>
							</div>
							<Chip variant={m.status === 'active' ? 'success' : 'warn'}>
								{m.status === 'active' ? '● Ativo' : '○ Convite pendente'}
							</Chip>
							<Button variant="ghost" size="sm">···</Button>
						</div>
					{/each}
				</div>
			{:else if tab === 'plano'}
				<h2 style="font:500 18px var(--font-sans);margin:0 0 14px">Plano atual</h2>
				<div
					class="card"
					style="padding:20px;margin-bottom:28px;background:linear-gradient(180deg, var(--accent-wash) 0%, var(--bg-3) 100%);border:1px solid var(--accent-dim)"
				>
					<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
						<div>
							<div class="eyebrow" style="margin-bottom:6px;color:var(--accent-2)">● Plano Pro · ativo</div>
							<div style="font:500 24px var(--font-sans);color:var(--ink-0);letter-spacing:-0.02em">
								R$ 89<span style="font:var(--label-mono);color:var(--ink-2);margin-left:6px">/ mês</span>
							</div>
							<div style="font:var(--body-sm);color:var(--ink-2);margin-top:6px">Até 50 alunos · próxima cobrança 14 jun 2026</div>
						</div>
						<Button variant="secondary">Mudar plano</Button>
					</div>
					<div
						style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding-top:16px;border-top:1px solid var(--ink-line-2)"
					>
						<div>
							<div class="eyebrow" style="margin-bottom:6px">Alunos ativos</div>
							<div class="num" style="font:var(--num-md);color:var(--ink-0)">23 / 50</div>
						</div>
						<div>
							<div class="eyebrow" style="margin-bottom:6px">Planos prescritos</div>
							<div class="num" style="font:var(--num-md);color:var(--ink-0)">184</div>
						</div>
						<div>
							<div class="eyebrow" style="margin-bottom:6px">Mensagens enviadas</div>
							<div class="num" style="font:var(--num-md);color:var(--ink-0)">1.2k</div>
						</div>
					</div>
				</div>

				<h2 style="font:500 18px var(--font-sans);margin:0 0 14px">Forma de pagamento</h2>
				<div class="card" style="padding:24px;margin-bottom:28px">
					<div style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0">
						<div>
							<div style="font:500 13px var(--font-sans);color:var(--ink-1)">Cartão</div>
							<div style="font:var(--label-mono);color:var(--ink-3);margin-top:4px">Cobrança automática mensal</div>
						</div>
						<div style="display:flex;align-items:center;gap:12px">
							<span class="num" style="font:500 14px var(--font-mono);color:var(--ink-0)">•••• •••• •••• 4242</span>
							<Chip>Visa · Mastercard</Chip>
						</div>
					</div>
				</div>

				<h2 style="font:500 18px var(--font-sans);margin:0 0 14px">Histórico de faturas</h2>
				<div class="card" style="padding:24px">
					{#each ['mai 2026', 'abr 2026', 'mar 2026', 'fev 2026'] as m, i (m)}
						<div
							style="display:grid;grid-template-columns:1fr auto auto auto;gap:16px;align-items:center;padding:12px 0;{i
								? 'border-top:1px solid var(--ink-line)'
								: ''}"
						>
							<span style="font:500 14px var(--font-sans);color:var(--ink-0)">{m}</span>
							<span class="num" style="font:var(--label-mono);color:var(--ink-2)">R$ 89,00</span>
							<Chip variant="success">● Pago</Chip>
							<Button variant="ghost" size="sm">⤓ PDF</Button>
						</div>
					{/each}
				</div>
			{:else if tab === 'integ'}
				<h2 style="font:500 18px var(--font-sans);margin:0 0 14px">Integrações conectadas</h2>
				<div class="card" style="padding:24px">
					{#each integrations as it, i (it.name)}
						<div
							style="display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;padding:16px 0;{i
								? 'border-top:1px solid var(--ink-line)'
								: ''}"
						>
							<div
								style="width:40px;height:40px;border-radius:var(--r-1);background:{toggles[it.name]
									? 'var(--accent-wash)'
									: 'var(--bg-3)'};color:{toggles[it.name]
									? 'var(--accent)'
									: 'var(--ink-2)'};border:1px solid {toggles[it.name]
									? 'var(--accent-dim)'
									: 'var(--ink-line-2)'};display:flex;align-items:center;justify-content:center;font-size:18px"
							>{it.icon}</div>
							<div>
								<div style="font:500 14px var(--font-sans);color:var(--ink-0);margin-bottom:4px">{it.name}</div>
								<div style="font:var(--body-sm);color:var(--ink-2)">{it.desc}</div>
							</div>
							{@render toggle(it.name, toggles[it.name] ?? false, () => (toggles[it.name] = !toggles[it.name]))}
						</div>
					{/each}
				</div>
			{:else}
				<h2 style="font:500 18px var(--font-sans);margin:0 0 14px">O que você quer receber?</h2>
				<div class="card" style="padding:24px">
					{#each notifs as [title, channel], i (title)}
						<div
							style="display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center;padding:14px 0;{i
								? 'border-top:1px solid var(--ink-line)'
								: ''}"
						>
							<div>
								<div style="font:500 14px var(--font-sans);color:var(--ink-0);margin-bottom:4px">{title}</div>
								<div style="font:var(--label-mono);color:var(--ink-3)">{channel}</div>
							</div>
							{@render toggle(title, toggles[title] ?? false, () => (toggles[title] = !toggles[title]))}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

{#snippet section(title: string)}
	<h2 style="font:500 18px var(--font-sans);margin:0 0 14px;letter-spacing:-0.01em">{title}</h2>
{/snippet}

{#snippet row(label: string, hint: string | undefined, kind: 'text' | 'textarea' | 'select', value: string)}
	<div
		style="display:grid;grid-template-columns:180px 1fr;gap:24px;padding:14px 0;border-top:1px solid var(--ink-line)"
	>
		<div>
			<div style="font:500 13px var(--font-sans);color:var(--ink-1)">{label}</div>
			{#if hint}<div style="font:var(--label-mono);color:var(--ink-3);margin-top:4px">{hint}</div>{/if}
		</div>
		<div>
			{#if kind === 'text'}
				<input
					{value}
					style="width:100%;box-sizing:border-box;height:38px;padding:0 12px;background:var(--bg-3);border:1px solid var(--ink-line-2);border-radius:var(--r-1);color:var(--ink-0);font:400 14px var(--font-sans);outline:none"
				/>
			{:else if kind === 'textarea'}
				<textarea
					style="width:100%;box-sizing:border-box;min-height:80px;padding:12px;background:var(--bg-3);border:1px solid var(--ink-line-2);border-radius:var(--r-1);color:var(--ink-0);font:400 14px/1.5 var(--font-sans);outline:none;resize:vertical"
					>{value}</textarea
				>
			{:else}
				<select
					style="width:100%;box-sizing:border-box;height:38px;padding:0 12px;background:var(--bg-3);border:1px solid var(--ink-line-2);border-radius:var(--r-1);color:var(--ink-0);font:400 14px var(--font-sans);outline:none"
				>
					<option value="cref">CREF — Educação Física</option>
					<option value="crefito">CREFITO — Fisioterapia</option>
					<option value="crm">CRM — Medicina</option>
				</select>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet toggle(key: string, on: boolean, onclick: () => void)}
	<button
		{onclick}
		style="width:40px;height:24px;border-radius:99px;border:0;cursor:pointer;background:{on
			? 'var(--accent)'
			: 'var(--bg-4)'};position:relative;transition:background 140ms var(--ease)"
	>
		<div
			style="width:18px;height:18px;border-radius:50%;background:#fafafa;position:absolute;top:3px;left:{on
				? '19px'
				: '3px'};transition:left 140ms var(--ease)"
		></div>
	</button>
{/snippet}

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
