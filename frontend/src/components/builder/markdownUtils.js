/**
 * Shared markdown helpers used by App.jsx (resource generation flows)
 * and the Cheat Sheet Builder (resource library + templates).
 * Extracted verbatim from App.jsx — behaviour is unchanged.
 */

export function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function markdownSectionToHtml(section = "") {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return "<p>No content available.</p>";
  }

  return lines
    .map((line) => {
      if (line.startsWith("### ")) {
        return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      }

      if (line.startsWith("## ")) {
        return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      }

      if (line.startsWith("# ")) {
        return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      }

      if (/^[-*]\s+/.test(line)) {
        return `<p>• ${escapeHtml(line.replace(/^[-*]\s+/, ""))}</p>`;
      }

      if (/^\d+\.\s+/.test(line)) {
        return `<p>${escapeHtml(line)}</p>`;
      }

      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("");
}

export function splitMarkdownSections(markdown = "") {
  const source = markdown.trim();

  if (!source) {
    return [];
  }

  const lines = source.split("\n");
  const sections = [];
  let currentSection = [];

  const pushCurrentSection = () => {
    const content = currentSection.join("\n").trim();

    if (content) {
      sections.push(content);
    }

    currentSection = [];
  };

  for (const line of lines) {
    const isHeading = /^#{1,6}\s+/.test(line);
    const isBullet = /^[-*]\s+/.test(line);
    const isNumberedItem = /^\d+\.\s+/.test(line);

    if (
      currentSection.length > 0 &&
      (isHeading || isBullet || isNumberedItem)
    ) {
      pushCurrentSection();
    }

    currentSection.push(line);
  }

  pushCurrentSection();

  return sections;
}

export function extractMermaidChart(section = "") {
  const match = section.match(
    /```[ \t]*mermaid[ \t]*\r?\n([\s\S]*?)```/i
  );

  if (!match) {
    return null;
  }

  return {
    chart: match[1].trim(),
    remainingText: section.replace(match[0], "").trim(),
  };
}
