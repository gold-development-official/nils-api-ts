import { DynamicModule, Module } from '@nestjs/common';
import { NilsService } from '..';
import { ConfigOptions } from '../model/config-options';

@Module({})
export class NilsModule {
  static forRoot(options: ConfigOptions): DynamicModule {
    return {
      module: NilsModule,
      providers: [{
          provide: 'CONFIG_OPTIONS',
          useValue: options
        },
        NilsService
      ],
      exports: [NilsService]
    }
  }
}