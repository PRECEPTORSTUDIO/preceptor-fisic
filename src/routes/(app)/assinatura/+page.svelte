<script lang="ts">
	import { Eyebrow, toast } from '$lib/components/ui';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const prof = $derived(data.professional);
	const needsCpf = $derived(!prof.asaasCustomerId);

	let annual = $state(false);
	let cpf = $state('');
	let submitting = $state<string | null>(null);

	const PLANS = [
		{
			base: 'essencial',
			name: 'Essencial',
			monthly: 'R$ 69,90/mês',
			yearly: 'R$ 699,00/ano',
			desc: 'Para o profissional em crescimento.'
		},
		{
			base: 'pro',
			name: 'Pro',
			monthly: 'R$ 149,90/mês',
			yearly: 'R$ 1.498,80/ano',
			desc: 'Para quem vive de prescrição clínica.'
		}
	];

	const STATUS_LABEL: Record<string, string> = {
		trial: 'Período de avaliação',
		active: 'Assinatura ativa',
		past_due: 'Pagamento pendente',
		cancelled: 'Assinatura cancelada',
		inactive: 'Inativa'
	};

	function fmtDate(d: Date | string | null) {
		if (!d) return null;
		return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>Assinatura · PreceptorFISIC</title>
</svelte:head>

<div style="max-width:760px;margin:0 auto;padding:24px 20px 64px">
	<Eyebrow>◆ Plano</Eyebrow>
	<h1 style="font:600 24px var(--font-sans);color:var(--ink-0);margin:6px 0 4px;letter-spacing:-0.02em">
		Assinatura
	</h1>
	<p style="font:var(--body-sm);color:var(--ink-2);margin:0 0 24px">
		Pagamento seguro pelo Asaas, por Pix ou cartão. Ativação automática assim que o pagamento
		confirmar.
	</p>

	<!-- Status atual -->
	<div class="card" style="padding:16px 18px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
		<div>
			<div style="font:600 15px var(--font-sans);color:var(--ink-0)">
				{STATUS_LABEL[prof.subscriptionStatus] ?? prof.subscriptionStatus}
				{#if prof.subscriptionPlan}
					· {prof.subscriptionPlan.charAt(0).toUpperCase() + prof.subscriptionPlan.slice(1)}
				{/if}
			</div>
			{#if prof.subscriptionExpiresAt}
				<div style="font:var(--body-sm);color:var(--ink-2);margin-top:2px">
					Válida até {fmtDate(prof.subscriptionExpiresAt)}
				</div>
			{/if}
		</div>
		<span
			style="width:9px;height:9px;border-radius:50%;background:{prof.subscriptionStatus === 'active'
				? 'var(--success)'
				: prof.subscriptionStatus === 'past_due'
					? 'var(--warning, orange)'
					: 'var(--ink-3)'}"
		></span>
	</div>

	{#if !data.billingEnabled}
		<p style="font:var(--body-sm);color:var(--ink-2)">
			Pagamentos temporariamente indisponíveis. Tente de novo mais tarde.
		</p>
	{:else}
		<!-- Toggle mensal/anual -->
		<div style="display:flex;gap:8px;margin-bottom:14px">
			<button
				type="button"
				class="card"
				style="padding:7px 14px;cursor:pointer;font:500 13px var(--font-sans);color:{annual
					? 'var(--ink-2)'
					: 'var(--ink-0)'};border-color:{annual ? 'var(--ink-line)' : 'var(--accent)'}"
				onclick={() => (annual = false)}
			>
				Mensal
			</button>
			<button
				type="button"
				class="card"
				style="padding:7px 14px;cursor:pointer;font:500 13px var(--font-sans);color:{annual
					? 'var(--ink-0)'
					: 'var(--ink-2)'};border-color:{annual ? 'var(--accent)' : 'var(--ink-line)'}"
				onclick={() => (annual = true)}
			>
				Anual <span style="color:var(--accent)">· 2 meses grátis</span>
			</button>
		</div>

		{#if needsCpf}
			<div class="card" style="padding:14px 18px;margin-bottom:14px">
				<label
					for="cpf"
					style="display:block;font:500 12px var(--font-sans);color:var(--ink-1);margin-bottom:6px"
				>
					CPF ou CNPJ (exigido pelo Asaas pra emitir a cobrança)
				</label>
				<input
					id="cpf"
					name="cpf-visual"
					bind:value={cpf}
					placeholder="000.000.000-00"
					inputmode="numeric"
					autocomplete="off"
					style="width:220px;max-width:100%;background:var(--bg-2);border:1px solid var(--ink-line);border-radius:8px;padding:9px 12px;font:400 14px var(--font-mono);color:var(--ink-0)"
				/>
			</div>
		{/if}

		<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
			{#each PLANS as p (p.base)}
				{@const planKey = `${p.base}_${annual ? 'anual' : 'mensal'}`}
				<form
					method="POST"
					action="?/subscribe"
					class="card"
					style="padding:20px;display:flex;flex-direction:column;gap:8px"
					use:enhance={() => {
						submitting = planKey;
						return async ({ result, update }) => {
							submitting = null;
							if (result.type === 'failure') {
								toast.error(String(result.data?.error ?? 'Não foi possível assinar.'));
							} else if (result.type === 'success') {
								toast.success('Assinatura criada! A fatura chega no seu email em instantes.');
							} else {
								await update();
							}
						};
					}}
				>
					<input type="hidden" name="plan" value={planKey} />
					<input type="hidden" name="cpf" value={cpf} />
					<div style="font:600 17px var(--font-sans);color:var(--ink-0)">{p.name}</div>
					<div style="font:600 22px var(--font-mono);color:var(--accent)">
						{annual ? p.yearly : p.monthly}
					</div>
					<p style="font:var(--body-sm);color:var(--ink-2);margin:0;flex:1">{p.desc}</p>
					<button
						type="submit"
						disabled={submitting !== null}
						style="all:unset;cursor:pointer;text-align:center;padding:10px 0;border-radius:999px;background:var(--accent);color:#0a0a0a;font:600 14px var(--font-sans);opacity:{submitting !== null ? 0.6 : 1}"
					>
						{submitting === planKey ? 'Gerando cobrança…' : `Assinar ${p.name}`}
					</button>
				</form>
			{/each}
		</div>

		<p style="font:var(--body-sm);color:var(--ink-3);margin-top:18px">
			Você será redirecionado para a fatura segura do Asaas. Nenhum dado de cartão passa pelos
			nossos servidores. Precisa do plano Institucional?
			<a href="mailto:castroomath7@gmail.com" style="color:var(--accent)">Fale com o time</a>.
		</p>
	{/if}
</div>
