import { Schema, Types, model } from "mongoose";

/** Short-lived lookup cache for identical (user, question, document scope) → assistant reply. */

export interface ChatResponseCacheEntity {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  queryKey: string;
  scopeKey: string;
  assistantContent: string;
  citations: {
    documentId?: Types.ObjectId;
    documentName: string;
    snippet: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const citationSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: false },
    documentName: { type: String, required: true },
    snippet: { type: String, required: true },
  },
  { _id: false }
);

const chatResponseCacheSchema = new Schema<ChatResponseCacheEntity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    queryKey: { type: String, required: true },
    scopeKey: { type: String, required: true },
    assistantContent: { type: String, required: true },
    citations: { type: [citationSchema], default: [] },
  },
  { timestamps: true }
);

chatResponseCacheSchema.index({ userId: 1, queryKey: 1, scopeKey: 1 }, { unique: true });

export const ChatResponseCacheModel = model<ChatResponseCacheEntity>(
  "ChatResponseCache",
  chatResponseCacheSchema
);
