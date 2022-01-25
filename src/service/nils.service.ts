import { Inject, Injectable } from '@nestjs/common';
import { NilsServiceOptions } from '../model/nils-service-options';
import { User } from '../model/user';
import { post, put, Response } from 'request';
import { URLSearchParams } from 'url';
import { CostLine } from '../model/cost-line';

@Injectable()
export class NilsService {
  private _configOptions: NilsServiceOptions;

  private _user: User | null = null;
  private _cookie: string | null = null;

  constructor(@Inject('NILS_SERVICE_OPTIONS') options: NilsServiceOptions) {
    this._configOptions = options;
  }

  // Shared - General API
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
          this._configOptions.onError?.apply(this._configOptions, [err]);
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

            if ([401, 403, 500].indexOf(response.statusCode) >= 0) {
              this._user = null;
              if (response.body && response.body.message) {
                reject({
                  status: response.body.status,
                  code: response.body.code,
                  message: response.body.message,
                  detail: response.body.detail,
                  externalServicesErrorMsg: response.body.externalServicesErrorMsg,
                  validationErrors: response.body.validationErrors,
                });
                this._configOptions.onError?.apply(this._configOptions, [response.body]);
                return;
              } else {
                reject('Unknown NILS Error');
                this._configOptions.onError?.apply(this._configOptions, [response.statusMessage]);
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

  public async costLines(jobNo: number, service: string[] = ['RAIL', 'BRGE', 'SHNT', 'TRCK'], costCode: string[] = ['RAIL', 'BRGE', 'SHNT', 'TRCK']): Promise<CostLine[]|null> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    // search data
    let search: {JCL_job_no: number, JCL_service?: string, JCL_cost_code?: string} = {
      JCL_job_no: jobNo
    };
    if (service.length > 0) {
      search.JCL_service = `("${service.join('","')}")`;
    }
    if( costCode.length > 0) {
      search.JCL_cost_code = `("${costCode.join('","')}")`;
    }

    // Form Data
    const formData = new URLSearchParams();
    formData.set('start', '0');
    formData.set('length', '1500');
    formData.set('responseFieldsRequired', 'false');
    formData.set('search[value]', JSON.stringify(search));

    // API call
    return new Promise((resolve, reject) => {
      post(`${this._configOptions.host}/moonshot/as/operationcostline/list-cost-line`, {
        withCredentials: true,
        strictSSL: false,
        body: formData.toString(),
        headers: {
          cookie: this._cookie,
          'Content-Length': formData.toString().length,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }, (err: any, response: Response) => {
        if (err) {
          this._configOptions.onError?.apply(this._configOptions, [err]);
          reject(err);
          return;
        }

        if (!response) {
          reject(`Can not connect to: ${this._configOptions.host}`);
          return;
        }

        // Unauthorized
        if ([401, 403].indexOf(response.statusCode) >= 0) {
          this._user = null;
          this._cookie = null;
        }

        // Server error
        if ([401, 403, 500].indexOf(response.statusCode) >= 0) {
          // Check for custom errors
          if (response.body && response.body.message) {
            this._configOptions.onError?.apply(this._configOptions, [response.body]);
            reject({
              status: response.body.status,
              code: response.body.code,
              message: response.body.message,
              detail: response.body.detail,
              externalServicesErrorMsg: response.body.externalServicesErrorMsg,
              validationErrors: response.body.validationErrors,
            });
            return;
          } else {
            this._configOptions.onError?.apply(this._configOptions, [response.statusMessage]);
            reject('Unknown NILS error');
            return;
          }
        } else {
          try {
            // Parse cost lines
            const body = JSON.parse(response.body);
            if (body.data) {
              resolve(body.data);
              return;
            } else {
              resolve(null);
              return;
            }
          } catch (err: any) {
            this._configOptions.onError?.apply(this._configOptions, [err]);
            reject(err);
            return;
          }
        }
      })
    });
  }

  public async updateTruckingVendorForJob(
    jobRouteActivityNo: string,
    jobActivityServiceNo: number,
    vendorCode: string,
    planned: boolean,
    confirmed: boolean,
    userId: string
  ): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    // API call
   return new Promise((resolve, reject) => {
     put(`${this._configOptions.host}/moonshot/as/op-job/update-trucking-vendor-for-job-route`, {
       withCredentials: true,
       strictSSL: false,
       json: true,
       body: {
         jobRouteActivityNo: jobRouteActivityNo,
         jobActivityServiceNo: jobActivityServiceNo,
         vendorCode: vendorCode,
         planned: planned,
         confirmed: confirmed,
         userId: userId,
       },
       headers: {
         cookie: this._cookie,
       }
     }, (err: any, response: Response) => {
       if (err) {
         this._configOptions.onError?.apply(this._configOptions, [err]);
         reject(err);
         return;
       }

       if (!response) {
         reject(`Can not connect to: ${this._configOptions.host}`);
         return;
       }

       // Unauthorized
       if ([401, 403].indexOf(response.statusCode) >= 0) {
         this._user = null;
         this._cookie = null;
       }

       // Server error
       if ([401, 403, 500].indexOf(response.statusCode) >= 0) {
         // Check for custom errors
         if (response.body && response.body.message) {
           this._configOptions.onError?.apply(this._configOptions, [response.body]);
           reject({
             status: response.body.status,
             code: response.body.code,
             message: response.body.message,
             detail: response.body.detail,
             externalServicesErrorMsg: response.body.externalServicesErrorMsg,
             validationErrors: response.body.validationErrors,
           });
           return;
         } else {
           this._configOptions.onError?.apply(this._configOptions, [response.statusMessage]);
           reject('Unknown NILS error');
           return;
         }
       } else {
         resolve(true);
         return;
       }
     })
   });
  }

  // Truck Planning Tool

  public async tptSyncAllJobs(): Promise<boolean> {
     // First login if needed
     const user: User | null = await this.login().catch((err) => null);
     if (!user) {
       return Promise.reject('Could not retrieve user or login');
     }

     // API call
    return new Promise((resolve, reject) => {
      post(`${this._configOptions.host}/moonshot/as/tpt/syn-all-job`, {
        withCredentials: true,
        strictSSL: false,
        json: true,
        headers: {
          cookie: this._cookie,
        }
      }, (err: any, response: Response) => {
        if (err) {
          this._configOptions.onError?.apply(this._configOptions, [err]);
          reject(err);
          return;
        }

        if (!response) {
          reject(`Can not connect to: ${this._configOptions.host}`);
          return;
        }

        // Unauthorized
        if ([401, 403].indexOf(response.statusCode) >= 0) {
          this._user = null;
          this._cookie = null;
        }

        // Server error
        if ([401, 403, 500].indexOf(response.statusCode) >= 0) {
          // Check for custom errors
          if (response.body && response.body.message) {
            this._configOptions.onError?.apply(this._configOptions, [response.body]);
            reject({
              status: response.body.status,
              code: response.body.code,
              message: response.body.message,
              detail: response.body.detail,
              externalServicesErrorMsg: response.body.externalServicesErrorMsg,
              validationErrors: response.body.validationErrors,
            });
            return;
          } else {
            this._configOptions.onError?.apply(this._configOptions, [response.statusMessage]);
            reject('Unknown NILS error');
            return;
          }
        } else {
          resolve(true);
          return;
        }
      })
    });
  }

  public async tptSyncAllVendors(): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    // API call
   return new Promise((resolve, reject) => {
     post(`${this._configOptions.host}/moonshot/as/tpt/syn-all-vendor`, {
       withCredentials: true,
       strictSSL: false,
       json: true,
       headers: {
         cookie: this._cookie,
       }
     }, (err: any, response: Response) => {
       if (err) {
         this._configOptions.onError?.apply(this._configOptions, [err]);
         reject(err);
         return;
       }

       if (!response) {
         reject(`Can not connect to: ${this._configOptions.host}`);
         return;
       }

       // Unauthorized
       if ([401, 403].indexOf(response.statusCode) >= 0) {
         this._user = null;
         this._cookie = null;
       }

       // Server error
       if ([401, 403, 500].indexOf(response.statusCode) >= 0) {
         // Check for custom errors
         if (response.body && response.body.message) {
           this._configOptions.onError?.apply(this._configOptions, [response.body]);
           reject({
             status: response.body.status,
             code: response.body.code,
             message: response.body.message,
             detail: response.body.detail,
             externalServicesErrorMsg: response.body.externalServicesErrorMsg,
             validationErrors: response.body.validationErrors,
           });
           return;
         } else {
           this._configOptions.onError?.apply(this._configOptions, [response.statusMessage]);
           reject('Unknown NILS error');
           return;
         }
       } else {
         resolve(true);
         return;
       }
     })
   });
  }

  public async tptSyncAllRates(): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    // API call
   return new Promise((resolve, reject) => {
     post(`${this._configOptions.host}/moonshot/as/tpt/syn-all-rate`, {
       withCredentials: true,
       strictSSL: false,
       json: true,
       headers: {
         cookie: this._cookie,
       }
     }, (err: any, response: Response) => {
       if (err) {
         this._configOptions.onError?.apply(this._configOptions, [err]);
         reject(err);
         return;
       }

       if (!response) {
         reject(`Can not connect to: ${this._configOptions.host}`);
         return;
       }

       // Unauthorized
       if ([401, 403].indexOf(response.statusCode) >= 0) {
         this._user = null;
         this._cookie = null;
       }

       // Server error
       if ([401, 403, 500].indexOf(response.statusCode) >= 0) {
         // Check for custom errors
         if (response.body && response.body.message) {
           this._configOptions.onError?.apply(this._configOptions, [response.body]);
           reject({
             status: response.body.status,
             code: response.body.code,
             message: response.body.message,
             detail: response.body.detail,
             externalServicesErrorMsg: response.body.externalServicesErrorMsg,
             validationErrors: response.body.validationErrors,
           });
           return;
         } else {
           this._configOptions.onError?.apply(this._configOptions, [response.statusMessage]);
           reject('Unknown NILS error');
           return;
         }
       } else {
         resolve(true);
         return;
       }
     })
   });
  }
  
  // Tank Allocation Tool
}