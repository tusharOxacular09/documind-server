import { Model, Schema, model, models } from "mongoose";

export interface User {
  name: string;
  email: string;
  password: string;
  emailVerified: boolean;
  emailVerificationTokenHash?: string;
  emailVerificationExpiresAt?: Date;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
}

type UserModelType = Model<User>;

const userSchema = new Schema<User, UserModelType>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    password: { type: String, required: true, minlength: 6 },
    emailVerified: { type: Boolean, required: true, default: false },
    emailVerificationTokenHash: { type: String, required: false },
    emailVerificationExpiresAt: { type: Date, required: false },
    passwordResetTokenHash: { type: String, required: false },
    passwordResetExpiresAt: { type: Date, required: false },
  },
  {
    timestamps: true,
    strict: true,
    versionKey: false,
  }
);

export const UserModel =
  (models.User as UserModelType) || model<User, UserModelType>("User", userSchema);
