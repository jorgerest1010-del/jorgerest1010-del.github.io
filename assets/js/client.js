window.addEventListener("DOMContentLoaded", () => {
  const common = window.JMCommon;
  const service = window.JMDataService;

  const ui = {
    clientLoginScreen: document.getElementById("clientLoginScreen"),
    clientApp: document.getElementById("clientApp"),
    singleLoginBtn: document.getElementById("singleLoginBtn"),
    clientLoginMsg: document.getElementById("clientLoginMsg"),
    currentClientLabel: document.getElementById("currentClientLabel"),
    clientCommunityName: document.getElementById("clientCommunityName"),
    clientLogoutBtn: document.getElementById("clientLogoutBtn"),
    clientEmptyState: document.getElementById("clientEmptyState"),
    cClientName: document.getElementById("cClientName"),
    cBalance: document.getElementById("cBalance"),
    cMonthlyFee: document.getElementById("cMonthlyFee"),
    cNextDue: document.getElementById("cNextDue"),
    cTotalPaid: document.getElementById("cTotalPaid"),
    clientPaymentsBody: document.getElementById("clientPaymentsBody"),
    clientEventsBody: document.getElementById("clientEventsBody")
  };

  let currentUser = null;
  let currentSettings = null;

  function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
  }

  function roleLabel(role) {
    const normalized = normalizeRole(role);
    if (normalized === "superadmin" || normalized === "fabricante") {
      return "Fabricante";
    }
    if (normalized === "admin") {
      return "Administrador";
    }
    if (normalized === "cliente" || normalized === "copropietario") {
      return "Copropietario";
    }
    return normalized || "Usuario";
  }

  function canUseClientPortal(role) {
    const normalized = normalizeRole(role);
    return ["cliente", "copropietario", "admin", "superadmin", "fabricante"].includes(normalized);
  }

  function formatMoney(value) {
    const currency = (currentSettings && currentSettings.currency) || "USD";
    return common.formatCurrency(value, currency);
  }

  function paintMode(status) {
    if (!status) {
      return;
    }
  }

  function showLogin(msg, type = "ok") {
    ui.clientLoginScreen.classList.remove("hidden");
    ui.clientApp.classList.add("hidden");
    common.setMessage(ui.clientLoginMsg, msg || "", type);
  }

  function showApp() {
    ui.clientLoginScreen.classList.add("hidden");
    ui.clientApp.classList.remove("hidden");
  }

  function renderEvents(events) {
    if (!Array.isArray(events) || events.length === 0) {
      ui.clientEventsBody.innerHTML = '<tr><td colspan="4">Sin eventos publicados.</td></tr>';
      return;
    }
    ui.clientEventsBody.innerHTML = events
      .map((event) => `
        <tr>
          <td>${common.escapeHTML(common.formatDate(event.event_date))}</td>
          <td>${common.escapeHTML(event.event_time || "-")}</td>
          <td>${common.escapeHTML(event.title || "-")}</td>
          <td>${common.escapeHTML(event.event_type || "-")}</td>
        </tr>
      `)
      .join("");
  }

  function renderPayments(payments) {
    if (!Array.isArray(payments) || payments.length === 0) {
      ui.clientPaymentsBody.innerHTML = '<tr><td colspan="5">Sin pagos registrados.</td></tr>';
      return;
    }
    ui.clientPaymentsBody.innerHTML = payments
      .map((payment) => `
        <tr>
          <td>${common.escapeHTML(common.formatDate(payment.payment_date))}</td>
          <td>${common.escapeHTML(formatMoney(payment.amount || 0))}</td>
          <td>${common.escapeHTML(payment.payment_method || "-")}</td>
          <td>${common.escapeHTML(payment.reference_number || "-")}</td>
          <td>${common.escapeHTML(payment.notes || payment.status || "-")}</td>
        </tr>
      `)
      .join("");
  }

  function renderClientSummary(client, payments, canManageAll) {
    if (!client && !canManageAll) {
      ui.clientEmptyState.classList.remove("hidden");
      ui.cClientName.textContent = "-";
      ui.cBalance.textContent = formatMoney(0);
      ui.cMonthlyFee.textContent = formatMoney(0);
      ui.cNextDue.textContent = "-";
      ui.cTotalPaid.textContent = formatMoney(0);
      return;
    }

    ui.clientEmptyState.classList.add("hidden");
    if (canManageAll) {
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      ui.cClientName.textContent = "Vista global (administrador)";
      ui.cBalance.textContent = "-";
      ui.cMonthlyFee.textContent = "-";
      ui.cNextDue.textContent = "-";
      ui.cTotalPaid.textContent = formatMoney(totalPaid);
      return;
    }

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    ui.cClientName.textContent = client.full_name || "-";
    ui.cBalance.textContent = formatMoney(client.balance || 0);
    ui.cMonthlyFee.textContent = formatMoney(client.monthly_fee || 0);
    ui.cNextDue.textContent = common.formatDate(client.next_due_date);
    ui.cTotalPaid.textContent = formatMoney(totalPaid);
  }

  async function refreshPortal() {
    const data = await service.getClientPortalData(currentUser);
    currentSettings = data.settings || {};
    ui.clientCommunityName.textContent = currentSettings.community_name || "Portal de cliente";
    ui.currentClientLabel.textContent = `${currentUser.full_name} (${roleLabel(currentUser.role)})`;
    renderClientSummary(data.client, data.payments || [], Boolean(data.canManageAll));
    renderPayments(data.payments || []);
    renderEvents(data.events || []);
  }

  function buildSingleLoginUrl() {
    const params = new URLSearchParams(window.location.search);
    const user = common.normalizeUsername(params.get("user"));
    const adminUrl = new URL("admin.html", window.location.href);
    if (user) {
      adminUrl.searchParams.set("user", user);
    }
    return adminUrl.toString();
  }

  function prepareSingleLogin() {
    if (ui.singleLoginBtn) {
      ui.singleLoginBtn.href = buildSingleLoginUrl();
    }
  }

  function bindEvents() {

    ui.clientLogoutBtn.addEventListener("click", () => {
      service.logout();
      currentUser = null;
      showLogin("Sesión cerrada correctamente.");
    });
  }

  async function boot() {
    bindEvents();
    prepareSingleLogin();

    const status = await service.init();
    paintMode(status);

    currentUser = await service.getCurrentUser();
    if (!currentUser) {
      showLogin("Debes iniciar sesión en el acceso unificado para entrar al portal.");
      return;
    }
    if (!canUseClientPortal(currentUser.role)) {
      service.logout();
      currentUser = null;
      showLogin("Tu rol no tiene acceso a este portal.", "error");
      return;
    }
    showApp();
    await refreshPortal();
  }

  boot().catch((error) => {
    showLogin(error.message || "Error inicializando portal.", "error");
  });
});
