import { Schema, Types, model } from "mongoose";

export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";

export interface DocumentEntity {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  type: "pdf" | "docx" | "ppt" | "pptx";
  sizeBytes: number;
  status: DocumentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<DocumentEntity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["pdf", "docx", "ppt", "pptx"], required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["uploaded", "processing", "ready", "failed"], default: "uploaded" },
  },
  { timestamps: true }
);

documentSchema.index({ userId: 1, createdAt: -1 });

export const DocumentModel = model<DocumentEntity>("Document", documentSchema);
