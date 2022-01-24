export interface User {
  id: string;
  user_id: string;
  user_roles: string;
  email: string;
  first_name: string;
  full_name: string;
  active: boolean;
  language: string;
  admin: boolean;
  company: string;
  userRoles: string[];
  userCompany: string[];
}