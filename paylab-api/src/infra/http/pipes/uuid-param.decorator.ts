import { Param, ParseUUIDPipe } from '@nestjs/common'

/**
 * `@UuidParam('orderId')` — like `@Param('orderId')` but rejects anything that
 * isn't a UUID with a 400 before the handler runs. Every domain entity id in
 * this codebase is `@default(uuid())` (see prisma/schema.prisma), so route
 * params named `<entity>Id` are always UUIDs. Slug params (`storeSlug`,
 * `productSlug`, …) must keep using plain `@Param`.
 */
export function UuidParam(name: string): ParameterDecorator {
	return Param(name, new ParseUUIDPipe())
}
