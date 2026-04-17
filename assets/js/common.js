window.JMCommon = (() => {
  const formatterCache = new Map();

  function getFormatter(currency) {
    const key = currency || "USD";
    if (!formatterCache.has(key)) {
      formatterCache.set(
        key,
        new Intl.NumberFormat("es-EC", {
          style: "currency",
          currency: key
        })
      );
    }
    return formatterCache.get(key);
  }

  function formatCurrency(value, currency) {
    const amount = Number(value || 0);
    return getFormatter(currency).format(Number.isFinite(amount) ? amount : 0);
  }

  function formatDate(dateValue) {
    if (!dateValue) {
      return "-";
    }
    try {
      return new Date(`${dateValue}T00:00:00`).toLocaleDateString("es-EC");
    } catch (_) {
      return String(dateValue);
    }
  }

  function formatDateTime(dateValue) {
    if (!dateValue) {
      return "-";
    }
    try {
      return new Date(dateValue).toLocaleString("es-EC");
    } catch (_) {
      return String(dateValue);
    }
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(dateISO, days) {
    const base = new Date(`${dateISO}T00:00:00`);
    base.setDate(base.getDate() + Number(days || 0));
    return base.toISOString().slice(0, 10);
  }

  function parseNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
  }

  function uid(prefix = "id") {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  }

  function randomHex(bytes = 16) {
    const size = Number(bytes) || 16;
    const array = new Uint8Array(size);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < array.length; i += 1) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function sha256Hex(input) {
    const text = String(input || "");
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function buildPasswordHash(password, salt) {
    return sha256Hex(`${String(password || "")}${String(salt || "")}`);
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setMessage(target, text, type = "ok") {
    if (!target) {
      return;
    }
    if (!text) {
      target.textContent = "";
      target.classList.add("hidden");
      target.classList.remove("ok", "error");
      return;
    }
    target.textContent = text;
    target.classList.remove("hidden", "ok", "error");
    target.classList.add(type === "error" ? "error" : "ok");
  }

  function rootPageUrl(fileName) {
    const url = new URL(fileName, window.location.href);
    return url.toString();
  }

  function buildClientAccessLink(username) {
    const url = new URL("cliente.html", window.location.href);
    url.searchParams.set("user", String(username || "").trim());
    return url.toString();
  }

  function buildAdminAccessLink() {
    return rootPageUrl("admin.html");
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
  }

  function downloadCSV(filename, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return;
    }
    const header = Object.keys(rows[0]);
    const lines = [
      header.join(","),
      ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(","))
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return {
    addDays,
    buildAdminAccessLink,
    buildClientAccessLink,
    buildPasswordHash,
    downloadCSV,
    escapeHTML,
    formatCurrency,
    formatDate,
    formatDateTime,
    normalizeUsername,
    parseNumber,
    randomHex,
    setMessage,
    todayISO,
    uid
  };
})();
