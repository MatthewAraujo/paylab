type Json = Record<string, any>

/**
 * Checks a real JSON body against its documented OpenAPI schema: every key it has is documented,
 * every required key is present, nullable values may be null, and nested objects, arrays and
 * `$ref` / `allOf` are followed. Free-form maps (`additionalProperties`) are not inspected.
 */
export function bodyMatchesSchema(
	document: Json,
	body: unknown,
	schema: Json | undefined,
	where: string,
): string[] {
	if (!schema) return [`${where}: no schema`]

	const resolve = (candidate: Json): Json => {
		if (candidate.$ref) {
			const name = (candidate.$ref as string).replace('#/components/schemas/', '')
			return resolve(document.components.schemas[name])
		}
		if (candidate.allOf?.length === 1) {
			return { ...resolve(candidate.allOf[0]), nullable: candidate.nullable }
		}
		return candidate
	}
	const resolved = resolve(schema)

	if (body === null) {
		return resolved.nullable ? [] : [`${where}: null but not nullable`]
	}
	if (resolved.type === 'array') {
		return (body as unknown[]).flatMap((item, i) =>
			bodyMatchesSchema(document, item, resolved.items, `${where}[${i}]`),
		)
	}
	if (resolved.type !== 'object' || typeof body !== 'object') {
		return []
	}
	// A free-form object (a map, or `unknown`) has no keys to check.
	if (!resolved.properties) {
		return []
	}

	const documented = Object.keys(resolved.properties ?? {})
	const problems: string[] = []
	for (const key of Object.keys(body as object)) {
		if (!documented.includes(key)) problems.push(`${where}.${key}: not documented`)
	}
	for (const key of resolved.required ?? []) {
		if (!(key in (body as object))) problems.push(`${where}.${key}: required but missing`)
	}
	for (const [key, value] of Object.entries(body as object)) {
		if (resolved.properties?.[key]) {
			problems.push(
				...bodyMatchesSchema(document, value, resolved.properties[key], `${where}.${key}`),
			)
		}
	}
	return problems
}

export function responseSchema(document: Json, path: string, status = '200'): Json | undefined {
	return document.paths[path]?.get?.responses?.[status]?.content?.['application/json']?.schema
}
