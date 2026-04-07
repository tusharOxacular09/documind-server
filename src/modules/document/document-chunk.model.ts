import { Schema, Types, model } from "mongoose";

export interface DocumentChunkEntity {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  documentId: Types.ObjectId;
  index: number;
  content: string;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

const documentChunkSchema = new Schema<DocumentChunkEntity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: true, index: true },
    index: { type: Number, required: true, min: 0 },
    content: { type: String, required: true, trim: true },
    embedding: { type: [Number], required: false, default: undefined },
  },
  { timestamps: true }
);

documentChunkSchema.index({ userId: 1, documentId: 1, index: 1 }, { unique: true });

export const DocumentChunkModel = model<DocumentChunkEntity>("DocumentChunk", documentChunkSchema);
