import type { Tool, ToolUIPart, UIMessage } from "ai";
import ReactMarkdown, { type Components } from "react-markdown";

export type MessagePart = NonNullable<UIMessage["parts"]>[number];

interface ChatMessageProps {
  parts: MessagePart[];
  role: string;
  userName: string;
}

const components: Components = {
  // Override default elements with custom styling
  p: ({ children }) => <p className="mb-4 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal pl-4">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  code: ({ className, children, ...props }) => (
    <code className={`${className ?? ""}`} {...props}>
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-lg bg-gray-700 p-4">
      {children}
    </pre>
  ),
  a: ({ children, ...props }) => (
    <a
      className="text-blue-400 underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
};

const Markdown = ({ children }: { children: string }) => {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
};

// Text Part Component
const TextPart = ({ text }: { text: string }) => {
  return <Markdown>{text}</Markdown>;
};

// Tool Invocation Part Component
const ToolInvocationPart = ({
  toolInvocation,
}: {
  toolInvocation: ToolUIPart;
}) => {
  return (
    <div className="mb-4 rounded-lg bg-gray-700 p-3">
      <div className="mb-2 flex items-center gap-2">
        {toolInvocation.state === "input-streaming" && (
          <span className="text-xs text-yellow-400">Calling...</span>
        )}
        {toolInvocation.state === "input-available" && (
          <span className="text-xs text-blue-400">Called</span>
        )}
        {toolInvocation.state === "output-available" && (
          <span className="text-xs text-green-400">Completed</span>
        )}
      </div>

      {(toolInvocation.state === "input-available" ||
        toolInvocation.state === "input-streaming") && (
        <div className="text-sm text-gray-300">
          <div className="mb-1 font-medium">Arguments:</div>
          <pre className="rounded bg-gray-800 p-2 text-xs">
            {JSON.stringify(toolInvocation.input, null, 2)}
          </pre>
        </div>
      )}

      {toolInvocation.state === "output-available" && (
        <div className="text-sm text-gray-300">
          <div className="mb-1 font-medium">Results:</div>
          <div className="space-y-2">
            {Array.isArray(toolInvocation.output) ? (
              toolInvocation.output.map((item: any, index: number) => (
                <div key={index} className="rounded bg-gray-800 p-2">
                  <div className="font-medium text-blue-400">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {item.title}
                    </a>
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {item.snippet}
                  </div>
                </div>
              ))
            ) : (
              <pre className="rounded bg-gray-800 p-2 text-xs">
                {JSON.stringify(toolInvocation.output, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Message Part Renderer Component
const MessagePartRenderer = ({ part }: { part: MessagePart }) => {
  switch (part.type) {
    case "text":
      return <TextPart key={`text-${Math.random()}`} text={part.text} />;

    case "tool-searchWeb":
      const toolInvocation = part as ToolUIPart;
      return (
        <ToolInvocationPart
          key={toolInvocation.toolCallId}
          toolInvocation={toolInvocation}
        />
      );
      return null;
  }
};

export const ChatMessage = ({ parts, role, userName }: ChatMessageProps) => {
  const isAI = role === "assistant";

  return (
    <div className="mb-6">
      <div
        className={`rounded-lg p-4 ${
          isAI ? "bg-gray-800 text-gray-300" : "bg-gray-900 text-gray-300"
        }`}
      >
        <p className="mb-2 text-sm font-semibold text-gray-400">
          {isAI ? "AI" : userName}
        </p>

        <div className="prose prose-invert max-w-none">
          {parts.map((part, index) => (
            <MessagePartRenderer key={index} part={part} />
          ))}
        </div>
      </div>
    </div>
  );
};
