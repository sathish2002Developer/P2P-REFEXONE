function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTemplate(template, data = {}, options = {}) {
  if (template == null) return "";

  const { escape = false, missingTokenMode = "keep" } = options;

  return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, token) => {
    const hasValue = Object.prototype.hasOwnProperty.call(data, token);
    const value = hasValue ? data[token] : undefined;

    if (value == null || value === "") {
      if (missingTokenMode === "empty") return "";
      if (missingTokenMode === "error") {
        throw new Error(`Missing template token: ${token}`);
      }
      return match;
    }

    return escape ? escapeHtml(value) : String(value);
  });
}

function findTemplateTokens(template) {
  if (template == null) return [];

  const tokens = new Set();
  const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let match;

  while ((match = regex.exec(String(template))) !== null) {
    tokens.add(match[1]);
  }

  return Array.from(tokens).sort();
}

module.exports = {
  escapeHtml,
  renderTemplate,
  findTemplateTokens
};
