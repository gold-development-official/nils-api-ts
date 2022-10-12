import { Inject, Injectable } from "@nestjs/common";
import { NilsServiceOptions } from "../model/nils-service-options";
import { User } from "../model/user";
import { post, get, put, Response } from "request";
import { URLSearchParams } from "url";
import { CostLine } from "../model/cost-line";
import { Location } from "../model/location";
import { G4Code } from "../model/g4-code";
import { G3Code } from "../model/g3-code";
import { G2Code } from "../model/g2-code";
import { G1Code } from "../model/g1-code";
import { Type } from "../model/type";
import { TypeValue } from "../model/type-value";
import * as crypto from "crypto";
import { Commodity } from "../model/commodity";
import { Activity } from "../model/activity";

@Injectable()
export class NilsService {
  private _configOptions: NilsServiceOptions;

  private _user: User | null = null;
  private _cookie: string | null = null;

  constructor(@Inject("NILS_SERVICE_OPTIONS") options: NilsServiceOptions) {
    this._configOptions = options;
  }

  // Shared - General/Official API
  public async login(force: boolean = false): Promise<User | null> {
    if (this._user && this._cookie && !force) {
      return this._user;
    }

    return new Promise<User | null>((resolve, reject) => {
      const password = this._configOptions.hashedPassword
        ? this._configOptions.hashedPassword
        : this.hashPassword(this._configOptions.rawPassword);
      this._configOptions.hashedPassword = password;

      post(
        `${this._configOptions.host}/moonshot/as/auth/login`,
        {
          withCredentials: true,
          json: true,
          strictSSL: false,
          body: {
            email: this._configOptions.email,
            password: password,
          },
        },
        (err, response) => {
          if (err) {
            this._configOptions.onError?.apply(this._configOptions, [err]);
            reject(err.message);
            return;
          } else {
            if (!response) {
              reject(`Can not connect to: ${this._configOptions.host}`);
              return;
            } else {
              if (response.headers["set-cookie"]) {
                this._cookie = response.headers["set-cookie"].join(";");
              } else {
                this._cookie = null;
              }

              if ([401, 403, 500].indexOf(response.statusCode) >= 0) {
                this._user = null;
                if (response.body && response.body.message) {
                  this._configOptions.onError?.apply(this._configOptions, [
                    response.body,
                  ]);
                  reject(this.rejectError(response.body));
                  return;
                } else {
                  reject("Unknown NILS Error");
                  this._configOptions.onError?.apply(this._configOptions, [
                    response.statusMessage,
                  ]);
                  return;
                }
              } else {
                this._user = response.body;
                resolve(response.body);
                return;
              }
            }
          }
        }
      );
    });
  }

  public async costLines(
    jobNo: number,
    consignmentNo: number = null,
    service: string[] = ["RAIL", "BRGE", "SHNT", "TRCK"],
    costCode: string[] = ["RAIL", "BRGE", "SHNT", "TRCK"],
    start: number = 0,
    size: number = 1500
  ): Promise<CostLine[] | null> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // search data
    let search: {
      JCL_job_no: number;
      JCL_consignment_no?: number;
      JCL_service?: string;
      JCL_cost_code?: string;
    } = {
      JCL_job_no: jobNo,
      JCL_consignment_no: consignmentNo,
    };
    if (service.length > 0) {
      search.JCL_service = `("${service.join('","')}")`;
    }
    if (costCode.length > 0) {
      search.JCL_cost_code = `("${costCode.join('","')}")`;
    }

    // Form Data
    const formData = new URLSearchParams();
    formData.set("start", start.toString());
    formData.set("length", size.toString());
    formData.set("responseFieldsRequired", "true");
    formData.set("search[value]", JSON.stringify(search));

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/operationcostline/list-cost-line`,
        {
          withCredentials: true,
          strictSSL: false,
          body: formData.toString(),
          headers: {
            cookie: this._cookie,
            "Content-Length": formData.toString().length,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
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
        }
      );
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
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      put(
        `${this._configOptions.host}/moonshot/as/op-job/update-trucking-vendor-for-job-route`,
        {
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
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async listLocations(
    start: number = 0,
    length: number = 1500
  ): Promise<{
    recordsTotal: number;
    data: Location[] | null;
    draw: number;
    recordsFiltered: number;
    error: string | null;
    searchQuery: string;
    filterQueries: string[];
    extraQuery: string | null;
  }> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/locations/list-locations`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          form: {
            length: length,
            start: start,
          },
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            try {
              if (response.body && response.body) {
                resolve(response.body);
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
        }
      );
    });
  }

  public async listG4Codes(
    start: number = 0,
    length: number = 1500
  ): Promise<{
    recordsTotal: number;
    data: G4Code[] | null;
    draw: number;
    recordsFiltered: number;
    error: string | null;
    searchQuery: string;
    filterQueries: string[];
    extraQuery: string | null;
  }> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/g4-codes/list-g4-codes`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          form: {
            length: length,
            start: start,
          },
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            try {
              if (response.body && response.body) {
                resolve(response.body);
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
        }
      );
    });
  }

  public async listG3Codes(
    start: number = 0,
    length: number = 1500
  ): Promise<{
    recordsTotal: number;
    data: G3Code[] | null;
    draw: number;
    recordsFiltered: number;
    error: string | null;
    searchQuery: string;
    filterQueries: string[];
    extraQuery: string | null;
  }> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/g3-codes/list-g3-codes`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          form: {
            length: length,
            start: start,
          },
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            try {
              if (response.body && response.body) {
                resolve(response.body);
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
        }
      );
    });
  }

  public async listG2Codes(
    start: number = 0,
    length: number = 1500
  ): Promise<{
    recordsTotal: number;
    data: G2Code[] | null;
    draw: number;
    recordsFiltered: number;
    error: string | null;
    searchQuery: string;
    filterQueries: string[];
    extraQuery: string | null;
  }> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/g2-codes/list-g2-codes`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          form: {
            length: length,
            start: start,
          },
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            try {
              if (response.body && response.body) {
                resolve(response.body);
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
        }
      );
    });
  }

  public async listG1Codes(
    start: number = 0,
    length: number = 1500
  ): Promise<{
    recordsTotal: number;
    data: G1Code[] | null;
    draw: number;
    recordsFiltered: number;
    error: string | null;
    searchQuery: string;
    filterQueries: string[];
    extraQuery: string | null;
  }> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/g1-codes/list-g1-codes`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          form: {
            length: length,
            start: start,
          },
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            try {
              if (response.body && response.body) {
                resolve(response.body);
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
        }
      );
    });
  }

  public async listAllTypes(
    start: number = 0,
    length: number = 500
  ): Promise<{
    data:
      | { type: Type; typeValues: TypeValue[] | null; totalCount: number }[]
      | null;
    draw: number;
    recordsTotal: number;
    recordsFiltered: number;
    error: string | null;
    searchQuery: string | null;
    filterQueries: string[] | null;
    extraQuery: string | null;
  }> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/type/list-all-types`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          form: {
            length: length,
            start: start,
          },
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            try {
              if (response.body && response.body) {
                resolve(response.body);
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
        }
      );
    });
  }

  public async typeByName(typeName: string): Promise<{
    type: Type | null;
    typeValues: TypeValue[] | null;
    totalCount: number;
  }> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      get(
        `${this._configOptions.host}/moonshot/as/type/list-types?typeName=${typeName}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            try {
              if (response.body && response.body) {
                resolve(response.body);
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
        }
      );
    });
  }

  public async listCommodities(
    start: number = 0,
    length: number = 500
  ): Promise<{
    draw: number;
    recordsTotal: number;
    recordsFiltered: number;
    error: string | null;
    searchQuery: string | null;
    filterQueries: string[] | null;
    extraQuery: string | null;
    data: Commodity[] | null;
  }> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/commodities/list-commodities`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          form: {
            length: length,
            start: start,
          },
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            try {
              if (response.body && response.body) {
                resolve(response.body);
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
        }
      );
    });
  }

  public async listActivities(
    start: number = 0,
    length: number = 1500
  ): Promise<{
    draw: number;
    recordsTotal: number;
    recordsFiltered: number;
    error: string | null;
    searchQuery: string | null;
    filterQueries: string[] | null;
    extraQuery: string | null;
    data: Activity[] | null;
  }> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/activities/list-activities`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          form: {
            length: length,
            start: start,
          },
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            try {
              if (response.body && response.body) {
                resolve(response.body);
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
        }
      );
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

  // post
  // https://nils-tst.gentco.com/moonshot/as/rates/get-grouped-rates-by-vendor
  /*
  {
    "serviceCode": "SHNT",
    "unitStatus": "Empty",
    "commodity": "CHEM",
    "costScope": "Order Only",
    "offset": 0,
    "limit": 500,
    "validFrom": 1656453600000,
    "validTo": 1656453600000,
    "timeZoneConversionRequired": true,
    "contractType": "Lane",
    "fromCode": [
        "EUR",
        "EUR-WEST",
        "NL",
        "NLBOT",
        "NLBOTBOAS0"
    ],
    "toCode": [
        "EUR",
        "EUR-WEST",
        "NL",
        "NLMOE",
        "NLMOETECH0"
    ],
    "mid1Code": [],
    "mid2Code": [],
    "mid3Code": [],
    "allowExpiredRates": true
}
   */

  // Truck Planning Tool

  public async tptSyncAllJobs(from?: number, to?: number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    let q = "";
    if (from) {
      q += `${q.length > 0 ? "&" : "?"}fromDate=${from}`;
    }
    if (to) {
      q += `${q.length > 0 ? "&" : "?"}toDate=${from}`;
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tpt/syn-all-job${q}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tptSyncJob(jobNo: string | number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tpt/syn-job?jobNo=${jobNo}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tptSyncAllVendors(from?: number, to?: number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    let q = "";
    if (from) {
      q += `${q.length > 0 ? "&" : "?"}fromDate=${from}`;
    }
    if (to) {
      q += `${q.length > 0 ? "&" : "?"}toDate=${from}`;
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tpt/syn-all-vendor${q}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tptSyncVendor(vendorId: string | number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tpt/syn-vendor?vendorId=${vendorId}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tptSyncAllRates(from?: number, to?: number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    let q = "";
    if (from) {
      q += `${q.length > 0 ? "&" : "?"}fromDate=${from}`;
    }
    if (to) {
      q += `${q.length > 0 ? "&" : "?"}toDate=${from}`;
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tpt/syn-all-rate${q}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tptSyncRate(rateId: string | number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tpt/syn-rate?rateId=${rateId}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tptSyncAllCurrencies(
    from?: number,
    to?: number
  ): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    let q = "";
    if (from) {
      q += `${q.length > 0 ? "&" : "?"}fromDate=${from}`;
    }
    if (to) {
      q += `${q.length > 0 ? "&" : "?"}toDate=${from}`;
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tpt/syn-all-currency${q}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tptSyncCurrency(currencyCode: string): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tpt/syn-currency?currencyCode=${currencyCode}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  // Tank Allocation Tool

  public async tatAllocateTankToJob(
    jobNumber: string | number,
    unitNumber: string,
    mode:
      | "ValidateAllocation"
      | "ValidateReservation"
      | "Allocate"
      | "Reserve"
      | "UnReserve"
      | "Deallocate" = "ValidateAllocation",
    userId: string
  ): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      put(
        `${this._configOptions.host}/moonshot/as/tat/alloc-tank-to-job?jobId=${jobNumber}&unitNumber=${unitNumber}&mode=${mode}&userId=${userId}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tatSyncAllJobOverview(
    from?: number,
    to?: number
  ): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    let q = "";
    if (from) {
      q += `${q.length > 0 ? "&" : "?"}fromDate=${from}`;
    }
    if (to) {
      q += `${q.length > 0 ? "&" : "?"}toDate=${from}`;
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tat/syn-all-job-overview${q}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tatSyncJobOverview(jobNo: string | number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tat/syn-job-overview?jobNo=${jobNo}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tatSyncAllEquipments(
    from?: number,
    to?: number
  ): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    let q = "";
    if (from) {
      q += `${q.length > 0 ? "&" : "?"}fromDate=${from}`;
    }
    if (to) {
      q += `${q.length > 0 ? "&" : "?"}toDate=${from}`;
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tat/syn-all-equipment${q}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tatSyncEquipment(tankId: string): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tat/syn-equipment?tankId=${tankId}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tatSyncAllLabels(from?: number, to?: number): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    let q = "";
    if (from) {
      q += `${q.length > 0 ? "&" : "?"}fromDate=${from}`;
    }
    if (to) {
      q += `${q.length > 0 ? "&" : "?"}toDate=${from}`;
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tat/syn-all-label${q}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tatSyncLabel(labelId: number | string): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tat/syn-label?labelId=${labelId}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tatSyncAllJobServicesRequirements(
    from?: number,
    to?: number
  ): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    let q = "";
    if (from) {
      q += `${q.length > 0 ? "&" : "?"}fromDate=${from}`;
    }
    if (to) {
      q += `${q.length > 0 ? "&" : "?"}toDate=${from}`;
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tat/syn-all-job-services-requirement${q}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tatSyncJobServicessRequirement(
    requirementNo: number | string
  ): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tat/syn-job-services-requirement?jobServiceRequirementNo=${requirementNo}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tatSyncAllLogisticRules(
    from?: number,
    to?: number
  ): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    let q = "";
    if (from) {
      q += `${q.length > 0 ? "&" : "?"}fromDate=${from}`;
    }
    if (to) {
      q += `${q.length > 0 ? "&" : "?"}toDate=${from}`;
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tat/syn-all-logistic-rules${q}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  public async tatSyncLogisticRole(ruleId: number | string): Promise<boolean> {
    // First login if needed
    const user: User | null = await this.login().catch((err) => null);
    if (!user) {
      return Promise.reject("Could not retrieve user or login");
    }

    // API call
    return new Promise((resolve, reject) => {
      post(
        `${this._configOptions.host}/moonshot/as/tat/syn-logistic-rules?logisticRuleId=${ruleId}`,
        {
          withCredentials: true,
          strictSSL: false,
          json: true,
          headers: {
            cookie: this._cookie,
          },
        },
        (err: any, response: Response) => {
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
              this._configOptions.onError?.apply(this._configOptions, [
                response.body,
              ]);
              reject(this.rejectError(response.body));
              return;
            } else {
              this._configOptions.onError?.apply(this._configOptions, [
                response.statusMessage,
              ]);
              reject("Unknown NILS error");
              return;
            }
          } else {
            resolve(true);
            return;
          }
        }
      );
    });
  }

  private hashPassword(rawPassword: string): string {
    const shaSum = crypto.createHash("sha1");
    shaSum.update(rawPassword);
    return shaSum.digest("hex");
  }

  private rejectError(body: any) {
    let status: number = 500;
    let code: any = undefined;
    let message: any = undefined;
    let detail: string | null = body.detail;
    let externalServicesErrorMsg: string | null = null;
    let validationErrors: any[] = null;

    if (body) {
      if (body.status) {
        try {
          status = parseInt(body.status, 10);
        } catch (e) {}
      }

      if (body.code) {
        try {
          code = JSON.parse(body.code);
        } catch (e) {
          if (typeof(body.code) === 'string') {
            code = body.code;
          }
        }
      }

      if (body.message) {
        try {
          message = JSON.parse(body.message);
        } catch (e) {
          if (typeof(body.message) === 'string') {
            message = body.message;
          }
        }
      }

      if (body.externalServicesErrorMsg) {
        try {
          externalServicesErrorMsg = JSON.parse(body.externalServicesErrorMsg);
        } catch (e) {
          if (typeof(body.externalServicesErrorMsg) === 'string') {
            externalServicesErrorMsg = body.externalServicesErrorMsg;
          }
        }
      }

      if (body.validationErrors) {
        try {
          validationErrors = JSON.parse(body.validationErrors);
        } catch (e) {
          if (typeof(body.validationErrors) === 'string') {
            validationErrors = body.validationErrors;
          }
        }
      }
    }

    return {
      status: status,
      code: code,
      message: message,
      detail: detail,
      externalServicesErrorMsg: externalServicesErrorMsg,
      validationErrors: validationErrors,
    };
  }
}
