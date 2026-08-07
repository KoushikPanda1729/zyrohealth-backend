export interface DecodedToken {
  uid: string;
  phone: string;
}

export interface IAuthProvider {
  sendOtp(phone: string): Promise<void>;
  verifyToken(idToken: string): Promise<DecodedToken>;
}
