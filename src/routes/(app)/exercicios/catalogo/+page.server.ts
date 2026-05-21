import { error } from '@sveltejs/kit';
import { searchExerciseCatalog, getCatalogFacets } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 48;

export const load: PageServerLoad = async ({ parent, url }) => {
	const { professional } = await parent();
	if (!professional) error(401, 'não autenticado');

	const query = url.searchParams.get('q') ?? undefined;
	const bodyPart = url.searchParams.get('bp') ?? undefined;
	const equipment = url.searchParams.get('eq') ?? undefined;
	const difficulty = url.searchParams.get('diff') ?? undefined;
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));

	const [{ items, total }, facets] = await Promise.all([
		searchExerciseCatalog({
			query,
			bodyPart,
			equipment,
			difficulty,
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE
		}),
		getCatalogFacets()
	]);

	return {
		items,
		total,
		facets,
		page,
		pageSize: PAGE_SIZE,
		filters: { query: query ?? '', bodyPart: bodyPart ?? '', equipment: equipment ?? '', difficulty: difficulty ?? '' }
	};
};
