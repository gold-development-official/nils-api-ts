import { DynamicModule, Module } from '@nestjs/common';
import { NilsService } from '..';
import { NilsServiceOptions } from '../model/nils-service-options';

@Module({})
export class NilsModule {
  static forRoot(options: NilsServiceOptions): DynamicModule {
    return {
      module: NilsModule,
      providers: [{
          provide: 'NILS_SERVICE_OPTIONS',
          useValue: options
        },
        NilsService
      ],
      exports: [NilsService]
    }
  }
}