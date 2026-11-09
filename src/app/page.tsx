import { redirect } from "next/navigation";
import { ChatApp } from "@/components/chat-app";
import { getCurrentUser } from "@/lib/auth";
import {
  findUserById,
  getConversation,
  getUserPreferences,
  listChatMessages,
  listConversations,
} from "@/lib/db";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const row = findUserById(user.id);
  if (!row) redirect("/login");

  const { c } = await searchParams;
  const requestedId = Array.isArray(c) ? c[0] : c;
  const conversation = requestedId ? getConversation(requestedId, user.id) : null;

  return (
    <ChatApp
      user={user}
      initialConversations={listConversations(user.id)}
      initialPreferences={getUserPreferences(row)}
      initialActiveId={conversation?.id ?? null}
      initialMessages={conversation ? listChatMessages(conversation.id) : []}
      initialActiveModel={conversation?.model ?? null}
    />
  );
}
