import bcrypt from "bcryptjs";
import { PASSWORD_HASH_ROUNDS } from "../auth.constants.js";

//************************************************************** */

export async function hashPassword(
  password: string,
): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}

//************************************************************** */

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

//************************************************************** */