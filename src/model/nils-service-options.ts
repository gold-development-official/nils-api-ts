export interface NilsServiceOptions {
  email: string;
  password: string;
  host: string;
  onError?: (msg: any) => void;
}