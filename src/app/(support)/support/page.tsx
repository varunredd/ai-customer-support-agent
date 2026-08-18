"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ContextPanel } from "@/components/chat/ContextPanel";
import { AgentActivityLog } from "@/components/chat/AgentActivityLog";
import styles from "./page.module.css";

export default function SupportPage() {
  const [messages, setMessages] = useState([
    {
      role: "customer" as const,
      content: "Hi, I received my order yesterday but the headphones aren't what I expected. Can I get a refund?",
      timestamp: "4:12 PM",
    },
    {
      role: "agent" as const,
      content: "I can check that for you. Let me review your order and refund eligibility.",
      timestamp: "4:12 PM",
    },
  ]);

  const handleSend = (content: string) => {
    const now = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    setMessages((prev) => [...prev, { role: "customer", content, timestamp: now }]);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: "I'm still a demo shell right now, but in Phase 2 I'll look up this order and run the refund policy engine for you.",
          timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        },
      ]);
    }, 900);
  };

  return (
    <div className={styles.layout}>
      <div className={styles.chatArea}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Customer Support</h1>
              <div className={styles.status}>
                <span className={styles.statusDot} />
                <span className={styles.statusText}>Online</span>
              </div>
            </div>
            <p className={styles.session}>Live session · Maya Patel · Order ord_demo_approve</p>
          </div>
          <Link href="/admin" className={styles.adminLink}>
            <LayoutDashboard size={15} />
            Admin
          </Link>
        </header>

        <main className={styles.chatHistory}>
          <div className={styles.chatFeed}>
            {messages.map((msg, i) => (
              <ChatMessage key={`${msg.role}-${i}`} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
            ))}
            <AgentActivityLog activity="Checking order ord_demo_approve against refund policy…" />
          </div>
        </main>

        <div className={styles.composerArea}>
          <div className={styles.composerInner}>
            <ChatComposer onSend={handleSend} />
            <p className={styles.hint}>The agent can look up customers and orders, but refund decisions always come from the policy engine.</p>
          </div>
        </div>
      </div>

      <aside className={styles.contextArea}>
        <ContextPanel customerId="cus_001" orderId="ord_demo_approve" />
      </aside>
    </div>
  );
}
