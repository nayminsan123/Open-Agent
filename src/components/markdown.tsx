"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckIcon, CopyIcon } from "./icons";

function CodeBlock({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-white/10 bg-[#070a09]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
        <span className="font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
          {language || "code"}
        </span>
        <button
          onClick={copy}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
        >
          {copied ? <CheckIcon className="size-3 text-emerald-400" /> : <CopyIcon className="size-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto p-3 font-mono text-[12px] leading-relaxed text-zinc-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const match = /language-([\w+-]+)/.exec(className ?? "");
    const text = String(children ?? "");
    const isBlock = Boolean(match) || text.includes("\n");
    if (!isBlock) {
      return (
        <code className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-emerald-200/90">
          {children}
        </code>
      );
    }
    return <CodeBlock language={match?.[1]} code={text.replace(/\n$/, "")} />;
  },
  p: ({ children }) => <p className="my-2 leading-7 first:mt-0 last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-emerald-300 underline decoration-emerald-400/30 underline-offset-2 hover:decoration-emerald-400"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-zinc-600">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-zinc-600">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  h1: ({ children }) => <h1 className="mt-5 mb-2 text-lg font-semibold text-zinc-100">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-2 text-base font-semibold text-zinc-100">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-1.5 text-sm font-semibold text-zinc-100">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 mb-1.5 text-[13px] font-semibold text-zinc-200">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-emerald-400/40 bg-white/[0.02] py-1 pl-3 text-zinc-400 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-white/10" />,
  strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
  em: ({ children }) => <em className="text-zinc-300 italic">{children}</em>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full border-collapse text-left text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.04] text-zinc-300">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-white/10 px-3 py-2 font-medium whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-white/[0.06] px-3 py-2 align-top">{children}</td>,
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="my-3 max-h-80 rounded-lg border border-white/10" />
  ),
};

export function Markdown({ content }: { content: string }) {
  return (
    <div className="break-words text-[13.5px] text-zinc-300">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
