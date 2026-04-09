import mongoose from "mongoose";

import { UserModel } from "../modules/user/user.model";

export const connectDatabase = async (uri: string, dbName: string): Promise<void> => {
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(uri, { dbName });
  await UserModel.createCollection();
  await UserModel.syncIndexes();
};
