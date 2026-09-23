import { CepGeocoder } from '@/domain/quintalpet/application/gateways/cep-geocoder'
import { Module } from '@nestjs/common'
import { EnvModule } from '../env/env.module'
import { BrazilianCepGeocoder } from './brazilian-cep-geocoder'

@Module({
	imports: [EnvModule],
	providers: [
		{
			provide: CepGeocoder,
			useClass: BrazilianCepGeocoder,
		},
	],
	exports: [CepGeocoder],
})
export class GeocodingModule {}
