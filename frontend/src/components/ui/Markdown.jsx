import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";

/**
 * MermaidDiagram and MarkdownContent, extracted verbatim from App.jsx so the
 * Cheat Sheet Builder's resource library can reuse them without importing App.
 * mermaid.initialize() remains in App.jsx (module entry order is unchanged).
 */

export function MermaidDiagram({ chart }) {
  const containerRef = useRef(null);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      const source = chart?.trim();

      if (!containerRef.current || !source) {
        return;
      }

      setRenderError("");
      containerRef.current.innerHTML = "";

      try {
        await mermaid.parse(source);

        const diagramId = `mermaid-${crypto.randomUUID()}`;
        const { svg } = await mermaid.render(diagramId, source);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (error) {
        console.error("Mermaid render error:", error);

        if (!cancelled) {
          setRenderError(
            error instanceof Error
              ? error.message
              : "The generated diagram contains invalid Mermaid syntax."
          );
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (renderError) {
    return (
      <div className="mermaid-error">
        <p>
          <strong>Diagram could not be rendered.</strong>
        </p>

        <details>
          <summary>Show diagram source</summary>
          <pre>{chart}</pre>
        </details>
      </div>
    );
  }

  return <div ref={containerRef} className="mermaid-diagram" />;
}

export function MarkdownContent({ content, emptyMessage = "No content available." }) {
  if (!content) {
    return <p className="empty-resource-message">{emptyMessage}</p>;
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const languageMatch = /language-(\w+)/.exec(className || "");
            const language = languageMatch?.[1]?.toLowerCase();

            if (language === "mermaid") {
              return (
                <MermaidDiagram
                  chart={String(children).replace(/\n$/, "")}
                />
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
