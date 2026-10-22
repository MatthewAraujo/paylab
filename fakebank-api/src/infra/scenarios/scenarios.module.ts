import { Module } from '@nestjs/common'
import { ScenarioAttempts } from './scenario-attempts.service'
import { SimulationScenarioRepository } from './simulation-scenario.repository'

/** Simulation Scenarios: registration storage and the attempt decision. */
@Module({
	providers: [SimulationScenarioRepository, ScenarioAttempts],
	exports: [SimulationScenarioRepository, ScenarioAttempts],
})
export class ScenariosModule {}
