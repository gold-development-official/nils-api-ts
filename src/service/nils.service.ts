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

  // Shared - General/Official API
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

  public async costLines(jobNo: number, consignmentNo: number = null, service: string[] = ['RAIL', 'BRGE', 'SHNT', 'TRCK'], costCode: string[] = ['RAIL', 'BRGE', 'SHNT', 'TRCK'], start: number = 0, size: number = 1500): Promise<CostLine[]|null> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    // search data
    let search: {JCL_job_no: number, JCL_consignment_no?: number, JCL_service?: string, JCL_cost_code?: string} = {
      JCL_job_no: jobNo,
      JCL_consignment_no: consignmentNo,
    };
    if (service.length > 0) {
      search.JCL_service = `("${service.join('","')}")`;
    }
    if( costCode.length > 0) {
      search.JCL_cost_code = `("${costCode.join('","')}")`;
    }

    // Form Data
    const formData = new URLSearchParams();
    formData.set('start', start.toString());
    formData.set('length', size.toString());
    formData.set('responseFieldsRequired', 'true');
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
        userId: userId
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

  public async tptSyncAllJobs(from?: number, to?: number): Promise<boolean> {
     // First login if needed
     const user: User | null = await this.login().catch((err) => null);
     if (!user) {
       return Promise.reject('Could not retrieve user or login');
     }

     let q = '';
     if (from) {
       q += `${(q.length > 0 ? '&' : '?')}fromDate=${from}`;
     }
     if (to) {
      q += `${(q.length > 0 ? '&' : '?')}toDate=${from}`;
     }

     // API call
    return new Promise((resolve, reject) => {
      post(`${this._configOptions.host}/moonshot/as/tpt/syn-all-job${q}`, {
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

  public async tptSyncJob(jobNo: string|number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    // API call
   return new Promise((resolve, reject) => {
     post(`${this._configOptions.host}/moonshot/as/tpt/syn-job?jobNo=${jobNo}`, {
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

  public async tptSyncAllVendors(from?: number, to?: number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    let q = '';
    if (from) {
      q += `${(q.length > 0 ? '&' : '?')}fromDate=${from}`;
    }
    if (to) {
     q += `${(q.length > 0 ? '&' : '?')}toDate=${from}`;
    }

    // API call
   return new Promise((resolve, reject) => {
     post(`${this._configOptions.host}/moonshot/as/tpt/syn-all-vendor${q}`, {
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

  public async tptSyncVendor(vendorId: string|number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    // API call
   return new Promise((resolve, reject) => {
     post(`${this._configOptions.host}/moonshot/as/tpt/syn-vendor?vendorId=${vendorId}`, {
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

  public async tptSyncAllRates(from?: number, to?: number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    let q = '';
     if (from) {
       q += `${(q.length > 0 ? '&' : '?')}fromDate=${from}`;
     }
     if (to) {
      q += `${(q.length > 0 ? '&' : '?')}toDate=${from}`;
     }

    // API call
   return new Promise((resolve, reject) => {
     post(`${this._configOptions.host}/moonshot/as/tpt/syn-all-rate${q}`, {
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

  public async tptSyncRate(rateId: string|number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    // API call
   return new Promise((resolve, reject) => {
     post(`${this._configOptions.host}/moonshot/as/tpt/syn-rate?rateId=${rateId}`, {
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

  public async tptSyncAllCurrencies(from?: number, to?: number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    let q = '';
     if (from) {
       q += `${(q.length > 0 ? '&' : '?')}fromDate=${from}`;
     }
     if (to) {
      q += `${(q.length > 0 ? '&' : '?')}toDate=${from}`;
     }

    // API call
   return new Promise((resolve, reject) => {
     post(`${this._configOptions.host}/moonshot/as/tpt/syn-all-currency${q}`, {
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

  public async tptSyncCurrency(currencyCode: string): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject('Could not retrieve user or login');
    }

    // API call
   return new Promise((resolve, reject) => {
     post(`${this._configOptions.host}/moonshot/as/tpt/syn-currency?currencyCode=${currencyCode}`, {
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

  // post
  // https://nils.gentco.com/moonshot/as/op-job/list-job-details-for-truckplanning
  // length=100,start=0,responseFieldsRequired=true

  // post
  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/rates/list-rate-for-truckplanning
  // length=25&start=0&responseFieldsRequired=true

  // post
  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/vendor/list-vendor-for-truckplanning
  // length=25&start=0&responseFieldsRequired=true

  // post
  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/currency/list-currencies
  // length=25&start=0


  
  // Tank Allocation Tool

  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/tat/syn-all-job-overview?fromDate=1592265600000&toDate=1592265600000
  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/tat/syn-job-overview?jobNo=6000125

  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/tat/syn-all-job-services-requirement?fromDate=1592265600000&toDate=1592265600000
  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/tat/syn-job-services-requirement?jobServiceRequirementNo=6000125

  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/tat/syn-all-label?fromDate=6000125&toDate=6000125
  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/tat/syn-label?labelId=6000125

  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/tat/syn-all-equipment?fromDate=1592265600000&toDate=1592265600000
  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/tat/syn-equipment?tankId=6000125

  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/tat/syn-all-logistic-rules?fromDate=6000125&toDate=6000125
  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/tat/syn-logistic-rules?logisticRuleId=1

  // https://moonshot-test.vanenburgsoftware.com/moonshot/as/tat/alloc-tank-to-job?jobId=60001144&unitNumber=ZEKU8004300&mode=validateAllocation&userId=RDS_Vanenburg
  /*
  The different modes available are 
  ValidateAllocation - do validation alone for allocation
  ValidateReservation - do validation alone for reservation
  Allocate - do validation for allocation and if no validation error , Tank will be allocated to job
  Reserve - do validation for allocation and if no validation error , Tank will be reserved to job
  UnReserve - UnReserve the tank from a job 
  Deallocate - Deallocate the tank from a job 
  */

}