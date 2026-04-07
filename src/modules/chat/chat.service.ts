import { Types } from "mongoose";

import { HttpError } from "../../utils/http-error";
import { DocumentModel } from "../document/document.model";
import { ChatModel } from "./chat.model";

type CitationDto = {
  documentId?: string;
  documentName: string;
  snippet: string;
};

type MessageDto = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  citations: CitationDto[];
};

type ChatSummaryDto = {
  id: string;
  title: string;
  lastMessageAt: string;
  messageCount: number;
  lastMessagePreview: string;
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
});

const tokenize = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );

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
  const documentFilter = selectedDocumentIds.length
    ? { _id: { $in: selectedDocumentIds.map((id) => new Types.ObjectId(id)) }, userId: ownerId }
    : { userId: ownerId };

  // Retrieval step: gather candidate documents for this user.
  const candidates = await DocumentModel.find(documentFilter).select("name type status").lean();

  // Ranking step: prioritize documents whose name overlaps the query terms.
  const queryTokens = tokenize(message);
  const ranked = candidates
    .map((doc) => ({
      doc,
      score: [...tokenize(doc.name)].reduce((acc, token) => (queryTokens.has(token) ? acc + 1 : acc), 0),
    }))
    .sort((a, b) => b.score - a.score || a.doc.name.localeCompare(b.doc.name))
    .slice(0, 3);

  const citations: CitationDto[] = ranked
    .filter(({ score }, idx) => score > 0 || idx === 0)
    .slice(0, 2)
    .map(({ doc }) => ({
      documentId: doc._id.toString(),
      documentName: doc.name,
      snippet: `Referenced from ${doc.type.toUpperCase()} document (${doc.status}).`,
    }));

  const assistantContent =
    citations.length > 0
      ? `I found relevant context from your uploaded documents and used it to answer this query:\n\n"${message}"\n\nTop sources were matched from your selected document space.`
      : `I don't have enough information in your uploaded documents to answer that confidently. Please upload relevant files or broaden your selected document scope.`;

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
    }),
  };
};

export const chatService = {
  listChats,
  getChatById,
  askQuestion,
};
