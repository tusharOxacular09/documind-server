import { Types } from "mongoose";

import { HttpError } from "../../utils/http-error";
import { DocumentChunkModel } from "../document/document-chunk.model";
import { DocumentModel } from "../document/document.model";
import { ChatModel } from "./chat.model";
import { composeGroundedAssistantReply } from "./rag/response-composer";
import { retrieveRankedCitations, type CitationDto } from "./rag/retrieval.service";

type MessageDto = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  citations: CitationDto[];
  feedback: "none" | "up" | "down";
};

type ChatSummaryDto = {
  id: string;
  title: string;
  lastMessageAt: string;
  messageCount: number;
  lastMessagePreview: string;
};

type SuggestionDto = {
  text: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const ensureObjectId = (id: string, message: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(id)) {
    throw new HttpError(message, 400);
  }
  return new Types.ObjectId(id);
};

const toMessageDto = (message: {
  _id: Types.ObjectId;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  citations: { documentId?: Types.ObjectId; documentName: string; snippet: string }[];
  feedback: "none" | "up" | "down";
}): MessageDto => ({
  id: message._id.toString(),
  role: message.role,
  content: message.content,
  createdAt: message.createdAt.toISOString(),
  citations: message.citations.map((citation) => ({
    documentId: citation.documentId?.toString(),
    documentName: citation.documentName,
    snippet: citation.snippet,
  })),
  feedback: message.feedback,
});

const inferTitle = (question: string): string => {
  const clean = question.trim().replace(/\s+/g, " ");
  return clean.length <= 60 ? clean : `${clean.slice(0, 57)}...`;
};

const parseAskPayload = (
  payload: unknown
): { message: string; chatId?: string; documentIds?: string[] } => {
  if (!isRecord(payload)) {
    throw new HttpError("Invalid request payload", 400);
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const chatId = typeof payload.chatId === "string" ? payload.chatId.trim() : undefined;
  const documentIds = Array.isArray(payload.documentIds)
    ? payload.documentIds.filter((id): id is string => typeof id === "string")
    : undefined;

  if (!message) {
    throw new HttpError("Message is required", 400);
  }

  return { message, chatId, documentIds };
};

const parseFeedbackPayload = (payload: unknown): { feedback: "up" | "down" | "none" } => {
  if (!isRecord(payload)) {
    throw new HttpError("Invalid request payload", 400);
  }
  const feedback = typeof payload.feedback === "string" ? payload.feedback : "";
  if (feedback !== "up" && feedback !== "down" && feedback !== "none") {
    throw new HttpError("Feedback must be one of: up, down, none", 400);
  }
  return { feedback };
};

const getQuerySuggestions = async (userId: string): Promise<{ suggestions: SuggestionDto[] }> => {
  const ownerId = ensureObjectId(userId, "Invalid user identifier");

  const readyDocs = await DocumentModel.find({ userId: ownerId, status: "ready" }).select("name").limit(8).lean();
  const chunks = await DocumentChunkModel.find({ userId: ownerId }).select("content").limit(20).lean();
  const chats = await ChatModel.find({ userId: ownerId }).select("messages.content").limit(6).lean();

  const docSuggestions = readyDocs.map((doc) => `Summarize ${doc.name}`);
  const chunkHints = chunks
    .map((chunk) => chunk.content.split(/[.?!]/)[0]?.trim())
    .filter((s): s is string => Boolean(s) && s.length > 20)
    .slice(0, 4)
    .map((line) => `Explain: ${line.slice(0, 70)}`);
  const priorQuestions = chats
    .flatMap((chat) => chat.messages)
    .map((m) => m.content)
    .filter((content) => content.endsWith("?"))
    .slice(-4);

  const unique = new Set<string>([
    ...docSuggestions,
    ...chunkHints,
    ...priorQuestions,
    "What are the key takeaways across my documents?",
    "Which documents mention action items?",
  ]);

  return { suggestions: [...unique].slice(0, 8).map((text) => ({ text })) };
};

const listChats = async (userId: string): Promise<{ chats: ChatSummaryDto[] }> => {
  const ownerId = ensureObjectId(userId, "Invalid user identifier");

  const chats = await ChatModel.find({ userId: ownerId }).sort({ lastMessageAt: -1 }).lean();
  return {
    chats: chats.map((chat) => ({
      id: chat._id.toString(),
      title: chat.title,
      lastMessageAt: chat.lastMessageAt.toISOString(),
      messageCount: chat.messages.length,
      lastMessagePreview: chat.messages.length
        ? chat.messages[chat.messages.length - 1].content.slice(0, 120)
        : "",
    })),
  };
};

const getChatById = async (userId: string, chatId: string): Promise<{
  chat: { id: string; title: string; lastMessageAt: string; messages: MessageDto[] };
}> => {
  const ownerId = ensureObjectId(userId, "Invalid user identifier");
  const chatObjectId = ensureObjectId(chatId, "Invalid chat identifier");

  const chat = await ChatModel.findOne({ _id: chatObjectId, userId: ownerId }).lean();
  if (!chat) {
    throw new HttpError("Chat not found", 404);
  }

  return {
    chat: {
      id: chat._id.toString(),
      title: chat.title,
      lastMessageAt: chat.lastMessageAt.toISOString(),
      messages: chat.messages.map(toMessageDto),
    },
  };
};

const askQuestion = async (userId: string, payload: unknown): Promise<{
  chat: { id: string; title: string; lastMessageAt: string };
  userMessage: MessageDto;
  assistantMessage: MessageDto;
}> => {
  const ownerId = ensureObjectId(userId, "Invalid user identifier");
  const { message, chatId, documentIds } = parseAskPayload(payload);

  let chat = null;
  if (chatId) {
    const chatObjectId = ensureObjectId(chatId, "Invalid chat identifier");
    chat = await ChatModel.findOne({ _id: chatObjectId, userId: ownerId });
    if (!chat) {
      throw new HttpError("Chat not found", 404);
    }
  }

  const selectedDocumentIds = (documentIds ?? []).filter((id) => Types.ObjectId.isValid(id));

  const citations = await retrieveRankedCitations(ownerId, message, selectedDocumentIds);
  const assistantContent = composeGroundedAssistantReply(message, citations);

  if (!chat) {
    chat = await ChatModel.create({
      userId: ownerId,
      title: inferTitle(message),
      lastMessageAt: new Date(),
      messages: [],
    });
  }

  chat.messages.push({
    _id: new Types.ObjectId(),
    role: "user",
    content: message,
    citations: [],
    feedback: "none",
    createdAt: new Date(),
  });
  chat.messages.push({
    _id: new Types.ObjectId(),
    role: "assistant",
    content: assistantContent,
    citations: citations.map((citation) => ({
      documentId: citation.documentId ? new Types.ObjectId(citation.documentId) : undefined,
      documentName: citation.documentName,
      snippet: citation.snippet,
    })),
    feedback: "none",
    createdAt: new Date(),
  });
  chat.lastMessageAt = new Date();

  await chat.save();

  const savedMessages = chat.messages.slice(-2);
  const userMessage = savedMessages[0];
  const assistantMessage = savedMessages[1];

  return {
    chat: {
      id: chat._id.toString(),
      title: chat.title,
      lastMessageAt: chat.lastMessageAt.toISOString(),
    },
    userMessage: toMessageDto({
      _id: userMessage._id,
      role: userMessage.role,
      content: userMessage.content,
      createdAt: userMessage.createdAt,
      citations: userMessage.citations.map((c) => ({
        documentId: c.documentId,
        documentName: c.documentName,
        snippet: c.snippet,
      })),
      feedback: userMessage.feedback,
    }),
    assistantMessage: toMessageDto({
      _id: assistantMessage._id,
      role: assistantMessage.role,
      content: assistantMessage.content,
      createdAt: assistantMessage.createdAt,
      citations: assistantMessage.citations.map((c) => ({
        documentId: c.documentId,
        documentName: c.documentName,
        snippet: c.snippet,
      })),
      feedback: assistantMessage.feedback,
    }),
  };
};

const setMessageFeedback = async (
  userId: string,
  chatId: string,
  messageId: string,
  payload: unknown
): Promise<{ chatId: string; messageId: string; feedback: "up" | "down" | "none" }> => {
  const ownerId = ensureObjectId(userId, "Invalid user identifier");
  const chatObjectId = ensureObjectId(chatId, "Invalid chat identifier");
  const messageObjectId = ensureObjectId(messageId, "Invalid message identifier");
  const { feedback } = parseFeedbackPayload(payload);

  const chat = await ChatModel.findOne({ _id: chatObjectId, userId: ownerId });
  if (!chat) {
    throw new HttpError("Chat not found", 404);
  }

  const message = chat.messages.find((m) => m._id.toString() === messageObjectId.toString());
  if (!message) {
    throw new HttpError("Message not found", 404);
  }
  if (message.role !== "assistant") {
    throw new HttpError("Feedback can only be set for assistant messages", 400);
  }

  message.feedback = feedback;
  await chat.save();

  return { chatId, messageId, feedback };
};

export const chatService = {
  listChats,
  getChatById,
  askQuestion,
  setMessageFeedback,
  getQuerySuggestions,
};
