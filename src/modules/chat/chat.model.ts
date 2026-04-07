import { Schema, Types, model } from "mongoose";

export interface CitationEntity {
  documentId?: Types.ObjectId;
  documentName: string;
  snippet: string;
}

export interface ChatMessageEntity {
  _id: Types.ObjectId;
  role: "user" | "assistant";
  content: string;
  citations: CitationEntity[];
  feedback: "none" | "up" | "down";
  createdAt: Date;
}

export interface ChatEntity {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  lastMessageAt: Date;
  messages: ChatMessageEntity[];
  createdAt: Date;
  updatedAt: Date;
}

const citationSchema = new Schema<CitationEntity>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: "Document", required: false },
    documentName: { type: String, required: true },
    snippet: { type: String, required: true },
  },
  { _id: false }
);

const chatMessageSchema = new Schema<ChatMessageEntity>(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, trim: true },
    citations: { type: [citationSchema], default: [] },
    feedback: { type: String, enum: ["none", "up", "down"], default: "none" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const chatSchema = new Schema<ChatEntity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    messages: { type: [chatMessageSchema], default: [] },
  },
  { timestamps: true }
);

chatSchema.index({ userId: 1, lastMessageAt: -1 });

export const ChatModel = model<ChatEntity>("Chat", chatSchema);
