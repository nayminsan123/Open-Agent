export type UserRole = "admin" | "user";
export type MessageRole = "user" | "assistant" | "system";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: number;
}

export interface AdminUser extends PublicUser {
  conversationCount: number;
}

export interface UserPreferences {
  defaultModel: string;
  systemPrompt: string;
  temperature: number;
}

export interface Conversation {
  id: string;
  title: string;
  model: string | null;
  systemPrompt: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface ProviderSettingsView {
  baseUrl: string;
  hasApiKey: boolean;
  defaultModel: string;
  allowSignup: boolean;
}

export interface ModelsResponse {
  models: string[];
  error?: string;
}

export type ChatStreamEvent =
  | { type: "conversation"; conversation: Conversation }
  | { type: "delta"; text: string }
  | { type: "done"; message: ChatMessage }
  | { type: "error"; message: string };

export interface ConversationDetail {
  conversation: Conversation;
  messages: ChatMessage[];
}

export interface AuthResponse {
  user: PublicUser;
}
