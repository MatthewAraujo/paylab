export async function generateUniqueCategorySlug(
	baseSlug: string,
	isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
	let candidate = baseSlug
	let attempt = 1

	while (await isTaken(candidate)) {
		attempt += 1
		candidate = `${baseSlug}-${attempt}`
	}

	return candidate
}
