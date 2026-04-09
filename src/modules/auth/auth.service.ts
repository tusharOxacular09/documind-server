import { rm } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { Types } from "mongoose";

import { HttpError } from "../../utils/http-error";
import { ChatModel } from "../chat/chat.model";
import { DocumentChunkModel } from "../document/document-chunk.model";
import { DocumentModel } from "../document/document.model";
import { resolvePathInsideUploads } from "../document/uploads-path";
import { UserModel } from "../user/user.model";
import { env } from "../../config/env";
import { emailService } from "./email.service";
import { jwtUtils } from "./jwt.utils";

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const SALT_ROUNDS = 10;
const TOKEN_TTL_MS = 1000 * 60 * 30;

type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type SafeUser = {
  id: string;
  name: string;
  email: string;
};

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const toSafeUser = (user: { _id: Types.ObjectId; name: string; email: string }): SafeUser => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
});

const validateRegisterInput = (input: RegisterInput): void => {
  if (!input.name?.trim()) {
    throw new HttpError("Name is required", 400);
  }
  if (!input.email?.trim()) {
    throw new HttpError("Email is required", 400);
  }
  if (!EMAIL_REGEX.test(input.email.trim())) {
    throw new HttpError("Invalid email format", 400);
  }
  if (!input.password || input.password.length < 6) {
    throw new HttpError("Password must be at least 6 characters", 400);
  }
};

const validateLoginInput = (input: LoginInput): void => {
  if (!input.email?.trim() || !input.password) {
    throw new HttpError("Email and password are required", 400);
  }
};

const parseRegisterInput = (input: unknown): RegisterInput => {
  if (!isRecord(input)) {
    throw new HttpError("Invalid request payload", 400);
  }

  return {
    name: typeof input.name === "string" ? input.name : "",
    email: typeof input.email === "string" ? input.email : "",
    password: typeof input.password === "string" ? input.password : "",
  };
};

const parseLoginInput = (input: unknown): LoginInput => {
  if (!isRecord(input)) {
    throw new HttpError("Invalid request payload", 400);
  }

  return {
    email: typeof input.email === "string" ? input.email : "",
    password: typeof input.password === "string" ? input.password : "",
  };
};

const toAuthResponse = (user: { _id: Types.ObjectId; name: string; email: string }): AuthResponse => ({
  accessToken: jwtUtils.signAccessToken({ userId: user._id.toString() }),
  refreshToken: jwtUtils.signRefreshToken(user._id.toString()),
  user: toSafeUser(user),
});

const hashToken = (raw: string): string => createHash("sha256").update(raw).digest("hex");

const createRawToken = (): string => randomBytes(32).toString("hex");

const logActionLink = (kind: "verify-email" | "reset-password", email: string, token: string): void => {
  const url =
    kind === "verify-email"
      ? `${env.appBaseUrl}/verify-email?token=${encodeURIComponent(token)}`
      : `${env.appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  console.info(`[auth:${kind}] ${email} -> ${url}`);
};

const register = async (payload: unknown): Promise<AuthResponse> => {
  const input = parseRegisterInput(payload);
  validateRegisterInput(input);

  const email = normalizeEmail(input.email);
  const existingUser = await UserModel.findOne({ email }).lean();
  if (existingUser) {
    throw new HttpError("Email already in use", 409);
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await UserModel.create({
    name: input.name.trim(),
    email,
    password: passwordHash,
    emailVerified: false,
  });

  const verifyToken = createRawToken();
  user.emailVerificationTokenHash = hashToken(verifyToken);
  user.emailVerificationExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await user.save();
  await emailService.sendVerificationEmail(user.email, verifyToken);
  logActionLink("verify-email", user.email, verifyToken);

  return toAuthResponse(user);
};

const login = async (payload: unknown): Promise<AuthResponse> => {
  const input = parseLoginInput(payload);
  validateLoginInput(input);

  const email = normalizeEmail(input.email);
  const user = await UserModel.findOne({ email });

  if (!user) {
    throw new HttpError("Invalid credentials", 401);
  }

  const passwordMatches = await bcrypt.compare(input.password, user.password);
  if (!passwordMatches) {
    throw new HttpError("Invalid credentials", 401);
  }
  if (!user.emailVerified) {
    throw new HttpError("Please verify your email before logging in", 403);
  }

  return toAuthResponse(user);
};

const refreshAccessToken = async (refreshToken: string): Promise<{ accessToken: string }> => {
  if (!refreshToken?.trim()) {
    throw new HttpError("Refresh token is required", 400);
  }

  let decodedUserId = "";
  try {
    const decoded = jwtUtils.verifyRefreshToken(refreshToken);
    decodedUserId = decoded.userId;
  } catch {
    throw new HttpError("Invalid refresh token", 401);
  }

  const user = await UserModel.findById(decodedUserId).select("_id").lean();
  if (!user) {
    throw new HttpError("User not found", 404);
  }

  return { accessToken: jwtUtils.signAccessToken({ userId: user._id.toString() }) };
};

const getCurrentUser = async (userId: string): Promise<SafeUser> => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new HttpError("Invalid user identifier", 400);
  }

  const user = await UserModel.findById(userId).select("name email").lean();
  if (!user) {
    throw new HttpError("User not found", 404);
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
};

const updateProfile = async (userId: string, payload: unknown): Promise<SafeUser> => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new HttpError("Invalid user identifier", 400);
  }
  if (!isRecord(payload)) {
    throw new HttpError("Invalid request payload", 400);
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";

  if (!name || !email) {
    throw new HttpError("Name and email are required", 400);
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError("Invalid email format", 400);
  }

  const duplicateUser = await UserModel.findOne({
    email,
    _id: { $ne: new Types.ObjectId(userId) },
  })
    .select("_id")
    .lean();
  if (duplicateUser) {
    throw new HttpError("Email already in use", 409);
  }

  const updatedUser = await UserModel.findByIdAndUpdate(
    userId,
    { name, email },
    { new: true, runValidators: true }
  )
    .select("name email")
    .lean();

  if (!updatedUser) {
    throw new HttpError("User not found", 404);
  }

  return {
    id: updatedUser._id.toString(),
    name: updatedUser.name,
    email: updatedUser.email,
  };
};

const parseDeleteAccountPayload = (payload: unknown): { password: string } => {
  if (!isRecord(payload)) {
    throw new HttpError("Invalid request payload", 400);
  }
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!password) {
    throw new HttpError("Password is required", 400);
  }
  return { password };
};

const parseEmailPayload = (payload: unknown): { email: string } => {
  if (!isRecord(payload)) {
    throw new HttpError("Invalid request payload", 400);
  }
  const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
  if (!EMAIL_REGEX.test(email)) {
    throw new HttpError("Invalid email format", 400);
  }
  return { email };
};

const parseTokenPayload = (payload: unknown): { token: string } => {
  if (!isRecord(payload)) {
    throw new HttpError("Invalid request payload", 400);
  }
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (!token) {
    throw new HttpError("Token is required", 400);
  }
  return { token };
};

const parsePasswordResetPayload = (payload: unknown): { token: string; newPassword: string } => {
  if (!isRecord(payload)) {
    throw new HttpError("Invalid request payload", 400);
  }
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
  if (!token) {
    throw new HttpError("Token is required", 400);
  }
  if (newPassword.length < 6) {
    throw new HttpError("New password must be at least 6 characters", 400);
  }
  return { token, newPassword };
};

const requestEmailVerification = async (payload: unknown): Promise<{ requested: true }> => {
  const { email } = parseEmailPayload(payload);
  const user = await UserModel.findOne({ email });
  if (!user || user.emailVerified) {
    return { requested: true };
  }

  const token = createRawToken();
  user.emailVerificationTokenHash = hashToken(token);
  user.emailVerificationExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await user.save();
  await emailService.sendVerificationEmail(user.email, token);
  logActionLink("verify-email", user.email, token);
  return { requested: true };
};

const confirmEmailVerification = async (payload: unknown): Promise<{ verified: true }> => {
  const { token } = parseTokenPayload(payload);
  const tokenHash = hashToken(token);
  const user = await UserModel.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationExpiresAt: { $gt: new Date() },
  });
  if (!user) {
    throw new HttpError("Invalid or expired token", 400);
  }

  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  await user.save();
  return { verified: true };
};

const requestPasswordReset = async (payload: unknown): Promise<{ requested: true }> => {
  const { email } = parseEmailPayload(payload);
  const user = await UserModel.findOne({ email });
  if (!user) return { requested: true };

  const token = createRawToken();
  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await user.save();
  await emailService.sendPasswordResetEmail(user.email, token);
  logActionLink("reset-password", user.email, token);
  return { requested: true };
};

const resetPassword = async (payload: unknown): Promise<{ reset: true }> => {
  const { token, newPassword } = parsePasswordResetPayload(payload);
  const tokenHash = hashToken(token);
  const user = await UserModel.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  });
  if (!user) {
    throw new HttpError("Invalid or expired token", 400);
  }

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();
  return { reset: true };
};

const deleteAccount = async (userId: string, payload: unknown): Promise<{ deleted: true }> => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new HttpError("Invalid user identifier", 400);
  }
  const ownerId = new Types.ObjectId(userId);
  const { password } = parseDeleteAccountPayload(payload);

  const user = await UserModel.findById(ownerId).select("password");
  if (!user) {
    throw new HttpError("User not found", 404);
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    throw new HttpError("Invalid credentials", 401);
  }

  const docs = await DocumentModel.find({ userId: ownerId }).select("storagePath").lean();
  for (const doc of docs) {
    if (doc.storagePath) {
      const trustedPath = resolvePathInsideUploads(doc.storagePath);
      if (trustedPath) {
        await rm(trustedPath, { force: true });
      }
    }
  }

  await DocumentChunkModel.deleteMany({ userId: ownerId });
  await ChatModel.deleteMany({ userId: ownerId });
  await DocumentModel.deleteMany({ userId: ownerId });

  const uploadsDir = path.resolve(process.cwd(), "uploads", ownerId.toString());
  await rm(uploadsDir, { recursive: true, force: true });

  await UserModel.findByIdAndDelete(ownerId);

  return { deleted: true };
};

export const authService = {
  register,
  login,
  refreshAccessToken,
  getCurrentUser,
  updateProfile,
  deleteAccount,
  requestEmailVerification,
  confirmEmailVerification,
  requestPasswordReset,
  resetPassword,
};
