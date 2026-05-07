/**
 * Smoke E2E — caminhos críticos que NÃO podem quebrar.
 *
 * Estes testes assumem que:
 *  - Dev server roda em http://localhost:5173
 *  - .env.local aponta pro Supabase BR com dados reais
 *  - Existe sessão ativa no browser (login feito)
 *
 * Em CI, precisaria de seed do banco + login programático.
 * Por ora, smoke local que valida estrutura básica.
 */
import { test, expect } from '@playwright/test';

test.describe('Smoke — rotas públicas (não logado)', () => {
	test('login page carrega com headline', async ({ page, context }) => {
		await context.clearCookies();
		await page.goto('/login');
		// Aceita ambos: já em /login (sem sessão) ou redirecionado pra /dashboard (com sessão)
		await page.waitForLoadState('networkidle');
		const url = page.url();
		if (url.includes('/login')) {
			await expect(page.getByText(/rigor cl[íi]nico/i)).toBeVisible();
		} else {
			// Já redirecionou pra dashboard — sessão ativa, tudo bem
			expect(url).toContain('/dashboard');
		}
	});

	test('rotas protegidas redirecionam pra login quando sem sessão', async ({ page, context }) => {
		await context.clearCookies();
		await page.goto('/dashboard');
		await expect(page).toHaveURL(/\/login$/);
	});

	test('manifest e sw são servidos', async ({ page }) => {
		const manifest = await page.request.get('/manifest.webmanifest');
		expect(manifest.ok()).toBe(true);
		const m = await manifest.json();
		expect(m.name).toBe('Preceptor Fisic');

		const sw = await page.request.get('/sw.js');
		expect(sw.ok()).toBe(true);
	});
});

test.describe('Smoke — app do aluno (público com magic-link)', () => {
	test('rota /a/[id] com token válido renderiza saudação', async ({ page }) => {
		const studentId = 'dc02543e-b69a-4a91-bed1-220698bf4b14';
		await page.goto(`/a/${studentId}`);
		await page.waitForLoadState('networkidle');
		await expect(page.getByText(/Olá/i)).toBeVisible();
	});

	test('aluno vê tab bar (Hoje · Plano · Histórico)', async ({ page }) => {
		await page.goto('/a/dc02543e-b69a-4a91-bed1-220698bf4b14');
		await expect(page.getByText('Hoje', { exact: true })).toBeVisible();
		await expect(page.getByText('Plano', { exact: true })).toBeVisible();
		await expect(page.getByText('Histórico', { exact: true })).toBeVisible();
	});
});

test.describe('Smoke — PWA', () => {
	test('app.html tem link manifest, apple-touch-icon, e SW registration', async ({ page }) => {
		const r = await page.request.get('/login');
		const html = await r.text();
		expect(html).toContain('manifest.webmanifest');
		expect(html).toContain('apple-touch-icon');
		expect(html).toContain("serviceWorker.register('/sw.js')");
	});
});

test.describe('Smoke — landing page', () => {
	test('landing renderiza hero + CTAs + sections', async ({ page, context }) => {
		await context.clearCookies();
		await page.goto('/');
		await page.waitForLoadState('domcontentloaded');
		// Headline principal
		await expect(page.getByRole('heading', { name: /prescreva treinos/i })).toBeVisible();
		// CTAs principais
		await expect(page.getByRole('link', { name: /começar agora/i }).first()).toBeVisible();
		// Sections
		await expect(page.getByText(/plataforma/i).first()).toBeVisible();
	});

	test('landing tem meta tags Open Graph', async ({ page }) => {
		const r = await page.request.get('/');
		const html = await r.text();
		expect(html).toContain('property="og:type"');
		expect(html).toContain('property="og:image"');
		expect(html).toContain('name="twitter:card"');
	});
});

test.describe('Smoke — SEO', () => {
	test('sitemap.xml é servido com URLs válidas', async ({ page }) => {
		const r = await page.request.get('/sitemap.xml');
		expect(r.ok()).toBe(true);
		expect(r.headers()['content-type']).toContain('xml');
		const xml = await r.text();
		expect(xml).toContain('<urlset');
		expect(xml).toContain('<loc>');
		expect(xml).toContain('/legal/termos');
	});

	test('robots.txt aponta pro sitemap', async ({ page }) => {
		const r = await page.request.get('/robots.txt');
		expect(r.ok()).toBe(true);
		const text = await r.text();
		expect(text).toContain('Sitemap:');
		expect(text).toContain('Disallow: /api/');
	});
});

test.describe('Smoke — legal pages', () => {
	test('termos de uso renderiza', async ({ page, context }) => {
		await context.clearCookies();
		await page.goto('/legal/termos');
		await expect(page.getByRole('heading', { name: /termos de uso/i })).toBeVisible();
		await expect(page.getByText(/CREF\/CREFITO\/CRM/i)).toBeVisible();
	});

	test('privacidade renderiza com referências LGPD', async ({ page, context }) => {
		await context.clearCookies();
		await page.goto('/legal/privacidade');
		await expect(page.getByRole('heading', { name: /privacidade/i })).toBeVisible();
		await expect(page.getByText(/LGPD/i).first()).toBeVisible();
		await expect(page.getByText(/13\.709/)).toBeVisible();
	});
});

test.describe('Smoke — recuperar senha', () => {
	test('rota /recuperar carrega com form', async ({ page, context }) => {
		await context.clearCookies();
		await page.goto('/recuperar');
		await expect(page.getByRole('heading', { name: /esqueceu/i })).toBeVisible();
		await expect(page.getByPlaceholder(/seu@email/i)).toBeVisible();
	});
});
