import { AuthenticatedClient, CurrentClient } from '@/infra/auth/authenticated-client'
import { ClientAuthenticated } from '@/infra/auth/client-authenticated.decorator'
import { ErrorEnvelopeResponse } from '@/infra/http/openapi/error-envelope.response'
import { ZodValidationPipe } from '@/infra/http/zod-validation.pipe'
import { RegisterScenarioBody, registerScenarioBody } from '@/infra/scenarios/scenario.schemas'
import { SimulationScenarioRepository } from '@/infra/scenarios/simulation-scenario.repository'
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiCreatedResponse, ApiTags } from '@nestjs/swagger'
import {
	RegisterScenarioRequest,
	ScenarioResponse,
	toScenarioResponse,
} from './scenario.representation'

@ApiTags('lab')
@ClientAuthenticated()
@Controller('__test/scenarios')
export class ScenariosController {
	constructor(private readonly scenarios: SimulationScenarioRepository) {}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	@ApiBody({ type: RegisterScenarioRequest })
	@ApiCreatedResponse({
		description:
			"Registered for this Client's next attempts carrying the External Reference, replacing " +
			'any previous scenario for it.',
		type: ScenarioResponse,
	})
	@ApiBadRequestResponse({
		description: 'Invalid field or combination (VALIDATION_ERROR); nothing is stored.',
		type: ErrorEnvelopeResponse,
	})
	async register(
		@CurrentClient() client: AuthenticatedClient,
		@Body(new ZodValidationPipe(registerScenarioBody)) body: RegisterScenarioBody,
	): Promise<ScenarioResponse> {
		return toScenarioResponse(await this.scenarios.register(client.clientId, body))
	}
}
