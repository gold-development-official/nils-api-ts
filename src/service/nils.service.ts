import { Inject, Injectable } from '@nestjs/common';
import { ConfigOptions } from '../model/config-options';
import { User } from '../model/user';
import { post, put } from 'request';

@Injectable()
export class NilsService {
  private _configOptions: ConfigOptions;

  private _user: User | null = null;
  private _cookie: string | null = null;

  constructor(@Inject('CONFIG_OPTIONS') options: ConfigOptions) {
    this._configOptions = options;
  }

  public async login(force: boolean = false): Promise<User|null> {
    if (this._user && this._cookie && !force) {
      return this._user;
    }

    return new Promise<User|null>((resolve, reject) => {
      post(`${this._configOptions.host}/moonshot/as/auth/login`, {
        withCredentials: true,
        json: true,
        strictSSL: false,
        body: {
          email: this._configOptions.email,
          password: this._configOptions.password,
        },
      }, (err, response) => {
        if (err) {
          console.error(err);
          reject(err.message);
          return;
        } else {
          if (!response) {
            reject(`Can not connect to: ${this._configOptions.host}`);
            return;
          } else {
            if (response.headers['set-cookie']) {
              this._cookie = response.headers['set-cookie'].join(';');
            } else {
              this._cookie = null;
            }

            if (response.statusCode === 500) {
              this._user = null;
              if (response.body && response.body.message) {
                reject({
                  status: response.body.status,
                  code: response.body.code,
                  message: response.body.message,
                  detail: response.body.detail,
                });
                console.error(response.body);
                return;
              } else {
                reject('Unknown NILS Error');
                console.error(response);
                return;
              }
            } else {
              this._user = response.body;
              resolve(response.body);
              return;
            }
          }
        }
      });
    });
  }
}