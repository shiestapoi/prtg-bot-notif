/* eslint-disable @typescript-eslint/no-empty-object-type */
export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthLoginResponse {
  token: string;
  user: AuthUser;
}

export interface AuthAccountUpdateResponse extends AuthLoginResponse {}
