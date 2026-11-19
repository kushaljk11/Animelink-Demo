import { Messages } from "@/components/chat/Messages";

export const metadata = { title: "Messages" };

/** Deep link from chat notifications: /app/chat/<conversationId>. */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Messages activeId={id} />;
}
