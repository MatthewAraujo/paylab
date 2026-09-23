import {
	CatalogBrandStatus,
	CatalogCategoryStatus,
	CatalogProductStatus,
	CatalogVariantStatus,
	InventoryMovementType,
	Prisma,
	PrismaClient,
} from '@prisma/client'

const prisma = new PrismaClient()

type Db = PrismaClient | Prisma.TransactionClient

const STORE_SLUG = 'quintal-agro-pet'

type CategoryTree = {
	name: string
	slug: string
	imageUrl: string
	children: Array<{ name: string; slug: string; imageUrl: string }>
}

/**
 * Creates a root category plus its children in one call. Categories share a
 * single slug namespace per store (`@@unique([storeId, slug])`), so every
 * node here needs a globally unique slug within the department.
 */
async function createCategoryTree(db: Db, storeId: string, tree: CategoryTree) {
	const root = await db.category.create({
		data: {
			storeId,
			name: tree.name,
			slug: tree.slug,
			imageUrl: tree.imageUrl,
			status: CatalogCategoryStatus.ACTIVE,
		},
	})

	const children = await Promise.all(
		tree.children.map((child) =>
			db.category.create({
				data: {
					storeId,
					parentCategoryId: root.id,
					name: child.name,
					slug: child.slug,
					imageUrl: child.imageUrl,
					status: CatalogCategoryStatus.ACTIVE,
				},
			}),
		),
	)

	return { root, children }
}

/**
 * Featured categories share a single ordered position sequence per store
 * (there is no per-department "segment") — pass every department's category
 * ids together so positions stay unique.
 */
async function featureCategories(db: Db, storeId: string, categoryIds: string[]) {
	for (const [position, categoryId] of categoryIds.entries()) {
		await db.merchandisingFeaturedCategory.create({
			data: { storeId, categoryId, position },
		})
	}
}

type SeedProductInput = {
	brandId: string
	categoryId: string
	name: string
	slug: string
	description: string
	imageUrl: string
	variantName: string
	sku: string
	priceCents: number
	costCents: number
	stock: number
}

async function createProduct(db: Db, storeId: string, input: SeedProductInput) {
	const attachment = await db.attachment.create({
		data: {
			storeId,
			title: `${input.slug}.png`,
			url: input.imageUrl,
		},
	})

	const product = await db.product.create({
		data: {
			storeId,
			brandId: input.brandId,
			primaryCategoryId: input.categoryId,
			name: input.name,
			slug: input.slug,
			description: input.description,
			status: CatalogProductStatus.ACTIVE,
			publishedAt: new Date(),
			categories: {
				create: [{ storeId, categoryId: input.categoryId }],
			},
			images: {
				create: [
					{
						storeId,
						attachmentId: attachment.id,
						url: input.imageUrl,
						altText: input.name,
						position: 0,
						isPrimary: true,
					},
				],
			},
		},
	})

	const variant = await db.productVariant.create({
		data: {
			storeId,
			productId: product.id,
			name: input.variantName,
			sku: input.sku,
			status: CatalogVariantStatus.ACTIVE,
			priceCents: input.priceCents,
			costCents: input.costCents,
		},
	})

	const inventoryItem = await db.inventoryItem.create({
		data: {
			storeId,
			variantId: variant.id,
			availableQuantity: input.stock,
		},
	})

	await db.inventoryMovement.create({
		data: {
			storeId,
			inventoryItemId: inventoryItem.id,
			variantId: variant.id,
			type: InventoryMovementType.INBOUND,
			quantityDelta: input.stock,
			balanceAfter: input.stock,
			note: 'Initial seed stock',
		},
	})

	return product
}

/**
 * All-or-nothing: a single interactive transaction, so a mid-catalog failure
 * (a bad image URL, a duplicate slug, the process getting killed) can never
 * leave a store with only some of its brands/categories/products — which is
 * exactly the state a prior non-transactional run left production in after
 * failing partway through (see the "store exists but is otherwise empty"
 * case in `main`).
 */
async function seedCatalog(storeId: string) {
	await prisma.$transaction(async (tx) => {
		const premierPet = await tx.brand.create({
			data: {
				storeId,
				name: 'Premier Pet',
				slug: 'premier-pet',
				status: CatalogBrandStatus.ACTIVE,
			},
		})

		const granPlus = await tx.brand.create({
			data: { storeId, name: 'GranPlus', slug: 'granplus', status: CatalogBrandStatus.ACTIVE },
		})

		const fazendaViva = await tx.brand.create({
			data: {
				storeId,
				name: 'Fazenda Viva',
				slug: 'fazenda-viva',
				status: CatalogBrandStatus.ACTIVE,
			},
		})

		// Category taxonomy: each department is a root category shown in the
		// header nav, with children carrying the images the home page renders
		// as clickable cards under "Ver tudo".
		const dogs = await createCategoryTree(tx, storeId, {
			name: 'Cachorros',
			slug: 'caes',
			imageUrl: '/brand/dog.png',
			children: [
				{ name: 'Ração', slug: 'caes-racoes', imageUrl: '/brand/dog.png' },
				{ name: 'Petiscos', slug: 'caes-petiscos', imageUrl: '/brand/dog.png' },
				{ name: 'Acessórios', slug: 'caes-acessorios', imageUrl: '/brand/dog.png' },
			],
		})

		const cats = await createCategoryTree(tx, storeId, {
			name: 'Gatos',
			slug: 'gatos',
			imageUrl: '/brand/cat.png',
			children: [
				{ name: 'Ração', slug: 'gatos-racoes', imageUrl: '/brand/cat.png' },
				{ name: 'Higiene', slug: 'gatos-higiene', imageUrl: '/brand/cat.png' },
				{ name: 'Brinquedos e arranhadores', slug: 'gatos-brinquedos', imageUrl: '/brand/cat.png' },
			],
		})

		await createCategoryTree(tx, storeId, {
			name: 'Acessórios',
			slug: 'acessorios',
			imageUrl: '/brand/accesories.png',
			children: [
				{ name: 'Passeio', slug: 'acessorios-passeio', imageUrl: '/brand/accesories.png' },
				{ name: 'Casa e descanso', slug: 'acessorios-casa', imageUrl: '/brand/accesories.png' },
			],
		})

		const agro = await createCategoryTree(tx, storeId, {
			name: 'Agro',
			slug: 'agro-pet',
			imageUrl: '/brand/agro.png',
			children: [
				{ name: 'Ração', slug: 'agro-nutricao', imageUrl: '/brand/agro.png' },
				{ name: 'Limpeza e manejo', slug: 'agro-limpeza', imageUrl: '/brand/agro.png' },
				{ name: 'Acessórios', slug: 'agro-equipamentos', imageUrl: '/brand/agro.png' },
			],
		})

		await featureCategories(tx, storeId, [
			...dogs.children.map((category) => category.id),
			...cats.children.map((category) => category.id),
			...agro.children.map((category) => category.id),
		])

		const dogFood = await createProduct(tx, storeId, {
			brandId: premierPet.id,
			categoryId: dogs.children[0].id,
			name: 'Racao Premium Caes Adultos',
			slug: 'racao-premium-caes-adultos',
			description: 'Nutrição completa para cães adultos, com proteína de alta digestibilidade.',
			imageUrl: '/brand/dog.png',
			variantName: '15kg',
			sku: 'RACAO-PREMIUM-15KG',
			priceCents: 21990,
			costCents: 18000,
			stock: 24,
		})

		const catFood = await createProduct(tx, storeId, {
			brandId: granPlus.id,
			categoryId: cats.children[0].id,
			name: 'Racao GranPlus Gatos Salmao',
			slug: 'racao-granplus-gatos-salmao',
			description: 'Fórmula com salmão para gatos adultos, cuidando de pelagem e digestão.',
			imageUrl: '/brand/cat.png',
			variantName: '3kg',
			sku: 'GRANPLUS-SALMAO-3KG',
			priceCents: 8990,
			costCents: 6800,
			stock: 40,
		})

		const agroSupplement = await createProduct(tx, storeId, {
			brandId: fazendaViva.id,
			categoryId: agro.children[0].id,
			name: 'Suplemento Mineral para Gado 20kg',
			slug: 'suplemento-mineral-gado-20kg',
			description: 'Suplementação mineral completa para bovinos a pasto.',
			imageUrl: '/brand/agro.png',
			variantName: '20kg',
			sku: 'FAZENDA-VIVA-MINERAL-20KG',
			priceCents: 15990,
			costCents: 11000,
			stock: 15,
		})

		for (const [position, product] of [dogFood, catFood, agroSupplement].entries()) {
			await tx.merchandisingFeaturedProduct.create({
				data: { storeId, productId: product.id, position },
			})
		}
	})
}

async function main() {
	// Guarded independently from catalog seeding below, rather than bailing
	// out the whole script the moment *anything* pre-exists. That's what
	// production actually needed: a prior run had already created the store,
	// then died before seeding the catalog (the Better Auth tables didn't
	// exist yet) — a single top-level "does the store exist?" guard would
	// have skipped catalog seeding forever and left that broken state in
	// place.
	//
	// Admin/owner provisioning is intentionally not this script's job — use
	// `npm run store-owner:create -- <email> <storeSlug>`, which goes through
	// the real Better Auth signup API and emails a "set your password" link,
	// instead of a raw-SQL user with a seed-generated password.
	const store = await prisma.store.upsert({
		where: { slug: STORE_SLUG },
		update: {},
		create: {
			name: 'Quintal Agro Pet',
			slug: STORE_SLUG,
			timezone: 'America/Sao_Paulo',
		},
	})

	const existingBrand = await prisma.brand.findFirst({ where: { storeId: store.id } })

	if (existingBrand) {
		console.log(`Store "${STORE_SLUG}" already has catalog data — skipping catalog seed.`)
		return
	}

	await seedCatalog(store.id)

	console.log(
		`Quintal Agro Pet catalog seed completed. Provision an admin with: npm run store-owner:create -- <email> ${STORE_SLUG}`,
	)
}

main()
	.catch(async (error) => {
		console.error(error)
		process.exitCode = 1
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
