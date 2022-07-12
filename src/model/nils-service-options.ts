export interface NilsServiceOptions {
  email: string;
  hashedPassword?: string|null,
  rawPassword?: string|null,
  host: string;
  onError?: (msg: any) => void;
}