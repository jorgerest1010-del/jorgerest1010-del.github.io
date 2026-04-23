window.addEventListener("DOMContentLoaded", () => {
  const common = window.JMCommon;
  const service = window.JMDataService;

  const ui = {
    adminLoginScreen: document.getElementById("adminLoginScreen"),
    adminApp: document.getElementById("adminApp"),
    adminLoginForm: document.getElementById("adminLoginForm"),
    adminLoginMsg: document.getElementById("adminLoginMsg"),
    adminUser: document.getElementById("adminUser"),
    adminPass: document.getElementById("adminPass"),
    currentAdminLabel: document.getElementById("currentAdminLabel"),
    accessHint: document.getElementById("accessHint"),
    sidebarCommunityName: document.getElementById("sidebarCommunityName"),
    clientPortalRootLink: document.getElementById("clientPortalRootLink"),
    adminLogoutBtn: document.getElementById("adminLogoutBtn"),
    navUsersBtn: document.getElementById("navUsersBtn"),
    navButtons: Array.from(document.querySelectorAll(".nav-btn[data-section]")),
    sectionPanels: Array.from(document.querySelectorAll(".section-panel")),

    mTotalClients: document.getElementById("mTotalClients"),
    mPaidClients: document.getElementById("mPaidClients"),
    mPendingClients: document.getElementById("mPendingClients"),
    mCollected: document.getElementById("mCollected"),
    mExpenses: document.getElementById("mExpenses"),
    remindersList: document.getElementById("remindersList"),

    clientCreateForm: document.getElementById("clientCreateForm"),
    clientFormMsg: document.getElementById("clientFormMsg"),
    clientsTableBody: document.getElementById("clientsTableBody"),

    paymentCreateForm: document.getElementById("paymentCreateForm"),
    paymentFormMsg: document.getElementById("paymentFormMsg"),
    paymentClientId: document.getElementById("paymentClientId"),
    paymentsTableBody: document.getElementById("paymentsTableBody"),

    expenseCreateForm: document.getElementById("expenseCreateForm"),
    expenseFormMsg: document.getElementById("expenseFormMsg"),
    expensesTableBody: document.getElementById("expensesTableBody"),

    eventCreateForm: document.getElementById("eventCreateForm"),
    eventFormMsg: document.getElementById("eventFormMsg"),
    eventsTableBody: document.getElementById("eventsTableBody"),

    settingsForm: document.getElementById("settingsForm"),
    settingsFormMsg: document.getElementById("settingsFormMsg"),

    settingsCommunityName: document.getElementById("settingsCommunityName"),
    settingsCurrency: document.getElementById("settingsCurrency"),
    settingsPaymentDay: document.getElementById("settingsPaymentDay"),
    settingsReminderDays: document.getElementById("settingsReminderDays"),
    settingsAdvancedKey: document.getElementById("settingsAdvancedKey"),

    reportTotalIncome: document.getElementById("reportTotalIncome"),
    reportTotalExpenses: document.getElementById("reportTotalExpenses"),
    reportNetBalance: document.getElementById("reportNetBalance"),
    reportPendingBalance: document.getElementById("reportPendingBalance"),
    exportPaymentsCsvBtn: document.getElementById("exportPaymentsCsvBtn"),
    exportExpensesCsvBtn: document.getElementById("exportExpensesCsvBtn"),
    exportClientsCsvBtn: document.getElementById("exportClientsCsvBtn"),

    userCreateForm: document.getElementById("userCreateForm"),
    userFormMsg: document.getElementById("userFormMsg"),
    userClientId: document.getElementById("userClientId"),
    usersTableBody: document.getElementById("usersTableBody")
  };

  let currentUser = null;
  let currentSettings = null;
  let currentClients = [];
  let currentUsers = [];
  let currentPayments = [];
  let currentExpenses = [];
  let currentEvents = [];
  let currentAccess = {
    fullAccess: false,
    readOnly: true,
    canManageUsers: false
  };

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

  function resolveAccess(user) {
    const role = normalizeRole(user && user.role);
    const fullAccess = role === "admin" || role === "superadmin" || role === "fabricante";
    const readOnly = role === "cliente" || role === "copropietario";
    return {
      fullAccess,
      readOnly,
      canManageUsers: fullAccess
    };
  }

  function canAccessAdminPanel(user) {
    const access = resolveAccess(user);
    return access.fullAccess || access.readOnly;
  }

  function formatMoney(value) {
    const currency = (currentSettings && currentSettings.currency) || "USD";
    return common.formatCurrency(value, currency);
  }

  function showLogin(msg, type = "ok") {
    ui.adminLoginScreen.classList.remove("hidden");
    ui.adminApp.classList.add("hidden");
    if (msg) {
      common.setMessage(ui.adminLoginMsg, msg, type);
    }
  }

  function showApp() {
    ui.adminLoginScreen.classList.add("hidden");
    ui.adminApp.classList.remove("hidden");
    ui.currentAdminLabel.textContent = `${currentUser.full_name} (${roleLabel(currentUser.role)})`;
  }

  function paintMode(status) {
    if (!status) {
      return;
    }
  }

  function selectSection(section) {
    let targetSection = section;
    if (targetSection === "users" && !currentAccess.canManageUsers) {
      targetSection = "dashboard";
    }
    for (const btn of ui.navButtons) {
      const active = btn.dataset.section === targetSection;
      btn.classList.toggle("active", active);
    }
    for (const panel of ui.sectionPanels) {
      panel.classList.toggle("hidden", panel.id !== `section-${targetSection}`);
    }
  }

  function listToOptions(items, getValue, getLabel, includeDefault = true) {
    const options = [];
    if (includeDefault) {
      options.push('<option value="">Selecciona...</option>');
    }
    for (const item of items) {
      options.push(`<option value="${common.escapeHTML(getValue(item))}">${common.escapeHTML(getLabel(item))}</option>`);
    }
    return options.join("");
  }

  function setFormDisabled(form, disabled) {
    if (!form) {
      return;
    }
    const controls = form.querySelectorAll("input, select, textarea, button");
    controls.forEach((node) => {
      node.disabled = Boolean(disabled);
    });
  }

  function applyRolePermissions() {
    const readOnly = !currentAccess.fullAccess;
    setFormDisabled(ui.clientCreateForm, readOnly);
    setFormDisabled(ui.paymentCreateForm, readOnly);
    setFormDisabled(ui.expenseCreateForm, readOnly);
    setFormDisabled(ui.eventCreateForm, readOnly);
    setFormDisabled(ui.settingsForm, readOnly);
    setFormDisabled(ui.userCreateForm, readOnly);
    if (ui.navUsersBtn) {
      ui.navUsersBtn.classList.toggle("hidden", !currentAccess.canManageUsers);
    }
    if (!currentAccess.canManageUsers) {
      selectSection("dashboard");
    }
    if (ui.accessHint) {
      ui.accessHint.textContent = currentAccess.fullAccess
        ? "Permisos activos: administrador/fabricante (acceso completo)."
        : "Permisos activos: copropietario (solo lectura).";
    }
  }

  function ensureWritePermission(targetMessage) {
    if (currentAccess.fullAccess) {
      return true;
    }
    common.setMessage(targetMessage, "Tu perfil es de solo lectura. Esta acción no está permitida.", "error");
    return false;
  }

  function renderReminders(reminders) {
    if (!Array.isArray(reminders) || reminders.length === 0) {
      ui.remindersList.innerHTML = "<li>Sin recordatorios por ahora.</li>";
      return;
    }
    ui.remindersList.innerHTML = reminders
      .map((r) => `<li class="${r.warn ? "warn" : ""}">${common.escapeHTML(r.text)}</li>`)
      .join("");
  }

  function renderDashboard(data) {
    ui.mTotalClients.textContent = String(data.metrics.total_clients || 0);
    ui.mPaidClients.textContent = String(data.metrics.paid_clients || 0);
    ui.mPendingClients.textContent = String(data.metrics.pending_clients || 0);
    ui.mCollected.textContent = formatMoney(data.metrics.total_collected || 0);
    ui.mExpenses.textContent = formatMoney(data.metrics.total_expenses || 0);
    renderReminders(data.reminders || []);
  }

  function clientNameById(clientId) {
    const found = currentClients.find((c) => c.id === clientId);
    return found ? found.full_name : "-";
  }

  function userNameById(userId) {
    const found = currentUsers.find((u) => u.id === userId);
    return found ? found.full_name : "-";
  }

  function renderClientsTable() {
    if (currentClients.length === 0) {
      ui.clientsTableBody.innerHTML = '<tr><td colspan="7">Sin clientes registrados.</td></tr>';
      return;
    }
    ui.clientsTableBody.innerHTML = currentClients
      .map((client) => {
        const stateClass = Number(client.balance || 0) <= 0 ? "ok" : "warn";
        const portal = service.clientAccessLink(client.owner_username || "");
        return `
          <tr>
            <td>${common.escapeHTML(client.full_name || "-")}</td>
            <td>${common.escapeHTML(client.email || "-")}<br>${common.escapeHTML(client.phone || "-")}</td>
            <td>${common.escapeHTML(client.apartment || "-")} / ${common.escapeHTML(client.building || "-")}</td>
            <td>${common.escapeHTML(formatMoney(client.monthly_fee || 0))}</td>
            <td>${common.escapeHTML(formatMoney(client.balance || 0))}</td>
            <td><span class="status-pill ${stateClass}">${common.escapeHTML(client.payment_status || "-")}</span></td>
            <td><a href="${common.escapeHTML(portal)}" target="_blank" rel="noopener">Abrir</a></td>
          </tr>
        `;
      })
      .join("");
  }

  function renderPaymentsTable() {
    if (currentPayments.length === 0) {
      ui.paymentsTableBody.innerHTML = '<tr><td colspan="6">Sin pagos registrados.</td></tr>';
      return;
    }
    ui.paymentsTableBody.innerHTML = currentPayments
      .map((payment) => `
        <tr>
          <td>${common.escapeHTML(common.formatDate(payment.payment_date))}</td>
          <td>${common.escapeHTML(clientNameById(payment.client_id))}</td>
          <td>${common.escapeHTML(formatMoney(payment.amount || 0))}</td>
          <td>${common.escapeHTML(payment.payment_method || "-")}</td>
          <td>${common.escapeHTML(payment.reference_number || "-")}</td>
          <td>${common.escapeHTML(userNameById(payment.created_by))}</td>
        </tr>
      `)
      .join("");
  }

  function renderExpensesTable() {
    if (currentExpenses.length === 0) {
      ui.expensesTableBody.innerHTML = '<tr><td colspan="5">Sin gastos registrados.</td></tr>';
      return;
    }
    ui.expensesTableBody.innerHTML = currentExpenses
      .map((expense) => `
        <tr>
          <td>${common.escapeHTML(common.formatDate(expense.expense_date))}</td>
          <td>${common.escapeHTML(expense.description || "-")}</td>
          <td>${common.escapeHTML(expense.category || "-")}</td>
          <td>${common.escapeHTML(formatMoney(expense.amount || 0))}</td>
          <td>${common.escapeHTML(expense.payment_method || "-")}</td>
        </tr>
      `)
      .join("");
  }

  function renderEventsTable() {
    if (currentEvents.length === 0) {
      ui.eventsTableBody.innerHTML = '<tr><td colspan="5">Sin eventos registrados.</td></tr>';
      return;
    }
    ui.eventsTableBody.innerHTML = currentEvents
      .map((event) => `
        <tr>
          <td>${common.escapeHTML(common.formatDate(event.event_date))}</td>
          <td>${common.escapeHTML(event.event_time || "-")}</td>
          <td>${common.escapeHTML(event.title || "-")}</td>
          <td>${common.escapeHTML(event.event_type || "-")}</td>
          <td>${common.escapeHTML(event.description || "-")}</td>
        </tr>
      `)
      .join("");
  }

  function renderUsersTable() {
    if (currentUsers.length === 0) {
      ui.usersTableBody.innerHTML = '<tr><td colspan="6">Sin usuarios registrados.</td></tr>';
      return;
    }
    ui.usersTableBody.innerHTML = currentUsers
      .map((user) => {
        const stateClass = user.is_active ? "ok" : "off";
        const btnText = user.is_active ? "Desactivar" : "Activar";
        const actionCell = currentAccess.canManageUsers
          ? `<button class="button" data-toggle-user="${common.escapeHTML(user.id)}" type="button">${btnText}</button>`
          : '<span class="muted">Solo lectura</span>';
        return `
          <tr>
            <td>${common.escapeHTML(user.full_name || "-")}</td>
            <td>${common.escapeHTML(user.username || "-")}</td>
            <td>${common.escapeHTML(user.role || "-")}</td>
            <td>${common.escapeHTML(clientNameById(user.client_id) || "-")}</td>
            <td><span class="status-pill ${stateClass}">${user.is_active ? "Activo" : "Inactivo"}</span></td>
            <td>${actionCell}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderSettings(settings) {
    ui.sidebarCommunityName.textContent = settings.community_name || "Sistema de Alícuotas";
    ui.settingsCommunityName.value = settings.community_name || "";
    ui.settingsCurrency.value = settings.currency || "USD";
    ui.settingsPaymentDay.value = settings.payment_day || 15;
    ui.settingsReminderDays.value = settings.reminder_days || 5;
    ui.settingsAdvancedKey.value = settings.advanced_key || "";
  }

  function renderReportCards() {
    const totalIncome = currentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalExpenses = currentExpenses.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const pending = currentClients.reduce((sum, c) => sum + Math.max(0, Number(c.balance || 0)), 0);
    ui.reportTotalIncome.textContent = formatMoney(totalIncome);
    ui.reportTotalExpenses.textContent = formatMoney(totalExpenses);
    ui.reportNetBalance.textContent = formatMoney(totalIncome - totalExpenses);
    ui.reportPendingBalance.textContent = formatMoney(pending);
  }

  function refreshSelectors() {
    ui.paymentClientId.innerHTML = listToOptions(
      currentClients,
      (c) => c.id,
      (c) => `${c.full_name} (${c.apartment || "-"})`
    );
    ui.userClientId.innerHTML = listToOptions(
      currentClients,
      (c) => c.id,
      (c) => `${c.full_name} (${c.apartment || "-"})`,
      true
    );
  }

  async function refreshAll() {
    const [dashboard, users, clients, payments, expenses, events] = await Promise.all([
      service.getDashboardData(),
      service.listUsers(),
      service.listClients(),
      service.listPayments(),
      service.listExpenses(),
      service.listEvents()
    ]);

    currentSettings = dashboard.settings;
    currentUsers = users;
    currentClients = clients;
    currentPayments = payments;
    currentExpenses = expenses;
    currentEvents = events;

    renderDashboard(dashboard);
    renderSettings(currentSettings);
    refreshSelectors();
    renderClientsTable();
    renderPaymentsTable();
    renderExpensesTable();
    renderEventsTable();
    renderUsersTable();
    renderReportCards();
    applyRolePermissions();

    ui.clientPortalRootLink.href = "cliente.html";
  }

  function exportReports() {
    ui.exportPaymentsCsvBtn.addEventListener("click", () => {
      if (!currentPayments.length) {
        return;
      }
      const rows = currentPayments.map((p) => ({
        fecha: p.payment_date || "",
        cliente: clientNameById(p.client_id),
        monto: Number(p.amount || 0),
        metodo: p.payment_method || "",
        referencia: p.reference_number || "",
        estado: p.status || "",
        registrado_por: userNameById(p.created_by)
      }));
      common.downloadCSV("pagos.csv", rows);
    });

    ui.exportExpensesCsvBtn.addEventListener("click", () => {
      if (!currentExpenses.length) {
        return;
      }
      const rows = currentExpenses.map((e) => ({
        fecha: e.expense_date || "",
        descripcion: e.description || "",
        categoria: e.category || "",
        monto: Number(e.amount || 0),
        metodo: e.payment_method || "",
        referencia: e.reference_number || ""
      }));
      common.downloadCSV("gastos.csv", rows);
    });

    ui.exportClientsCsvBtn.addEventListener("click", () => {
      if (!currentClients.length) {
        return;
      }
      const rows = currentClients.map((c) => ({
        cliente: c.full_name || "",
        correo: c.email || "",
        telefono: c.phone || "",
        apartamento: c.apartment || "",
        edificio: c.building || "",
        cuota_mensual: Number(c.monthly_fee || 0),
        saldo: Number(c.balance || 0),
        proximo_vencimiento: c.next_due_date || "",
        estado_pago: c.payment_status || ""
      }));
      common.downloadCSV("clientes.csv", rows);
    });
  }

  function bindEvents() {
    ui.navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.section === "users" && !currentAccess.canManageUsers) {
          selectSection("dashboard");
          return;
        }
        selectSection(btn.dataset.section);
        const menu = document.querySelector(".nav-dropdown");
        if (menu && menu.open) {
          menu.open = false;
        }
      });
    });
    if (ui.adminLogoutBtn) {
      ui.adminLogoutBtn.addEventListener("click", () => {
        service.logout();
        currentUser = null;
        showLogin("Sesión cerrada correctamente.");
      });
    }

    ui.adminLoginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      common.setMessage(ui.adminLoginMsg, "");
      try {
        const result = await service.login(
          ui.adminUser.value,
          ui.adminPass.value,
          ["admin", "superadmin", "fabricante", "cliente", "copropietario"]
        );
        if (!result.ok) {
          common.setMessage(ui.adminLoginMsg, result.message || "No se pudo iniciar sesión.", "error");
          return;
        }
        currentUser = result.user;
        currentAccess = resolveAccess(currentUser);
        if (!canAccessAdminPanel(currentUser)) {
          service.logout();
          currentUser = null;
          common.setMessage(ui.adminLoginMsg, "Tu rol no tiene acceso a este panel.", "error");
          showLogin();
          return;
        }
        showApp();
        await refreshAll();
        selectSection("dashboard");
      } catch (error) {
        common.setMessage(ui.adminLoginMsg, error.message || "Error en login.", "error");
      }
    });

    ui.clientCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      common.setMessage(ui.clientFormMsg, "");
      if (!ensureWritePermission(ui.clientFormMsg)) {
        return;
      }
      try {
        const payload = {
          full_name: document.getElementById("clientFullName").value,
          email: document.getElementById("clientEmail").value,
          phone: document.getElementById("clientPhone").value,
          apartment: document.getElementById("clientApartment").value,
          building: document.getElementById("clientBuilding").value,
          monthly_fee: document.getElementById("clientMonthlyFee").value,
          balance: document.getElementById("clientBalance").value,
          next_due_date: document.getElementById("clientDueDate").value,
          notes: document.getElementById("clientNotes").value,
          owner_full_name: document.getElementById("ownerFullName").value,
          owner_username: document.getElementById("ownerUsername").value,
          owner_password: document.getElementById("ownerPassword").value
        };
        const created = await service.createClientWithAccount(payload);
        ui.clientCreateForm.reset();
        common.setMessage(ui.clientFormMsg, `Cliente creado. Acceso: ${created.access_link}`);
        await refreshAll();
      } catch (error) {
        common.setMessage(ui.clientFormMsg, error.message || "No se pudo crear cliente.", "error");
      }
    });

    ui.paymentCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      common.setMessage(ui.paymentFormMsg, "");
      if (!ensureWritePermission(ui.paymentFormMsg)) {
        return;
      }
      try {
        await service.createPayment(
          {
            client_id: document.getElementById("paymentClientId").value,
            amount: document.getElementById("paymentAmount").value,
            payment_method: document.getElementById("paymentMethod").value,
            reference_number: document.getElementById("paymentReference").value,
            payment_date: document.getElementById("paymentDate").value,
            notes: document.getElementById("paymentNotes").value
          },
          currentUser
        );
        ui.paymentCreateForm.reset();
        document.getElementById("paymentDate").value = common.todayISO();
        common.setMessage(ui.paymentFormMsg, "Pago registrado correctamente.");
        await refreshAll();
      } catch (error) {
        common.setMessage(ui.paymentFormMsg, error.message || "No se pudo registrar pago.", "error");
      }
    });

    ui.expenseCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      common.setMessage(ui.expenseFormMsg, "");
      if (!ensureWritePermission(ui.expenseFormMsg)) {
        return;
      }
      try {
        await service.createExpense(
          {
            description: document.getElementById("expenseDescription").value,
            amount: document.getElementById("expenseAmount").value,
            category: document.getElementById("expenseCategory").value,
            payment_method: document.getElementById("expenseMethod").value,
            reference_number: document.getElementById("expenseReference").value,
            expense_date: document.getElementById("expenseDate").value,
            notes: document.getElementById("expenseNotes").value
          },
          currentUser
        );
        ui.expenseCreateForm.reset();
        document.getElementById("expenseDate").value = common.todayISO();
        common.setMessage(ui.expenseFormMsg, "Gasto registrado correctamente.");
        await refreshAll();
      } catch (error) {
        common.setMessage(ui.expenseFormMsg, error.message || "No se pudo registrar gasto.", "error");
      }
    });

    ui.eventCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      common.setMessage(ui.eventFormMsg, "");
      if (!ensureWritePermission(ui.eventFormMsg)) {
        return;
      }
      try {
        await service.createEvent({
          title: document.getElementById("eventTitle").value,
          event_date: document.getElementById("eventDate").value,
          event_time: document.getElementById("eventTime").value,
          event_type: document.getElementById("eventType").value,
          color: document.getElementById("eventColor").value,
          description: document.getElementById("eventDescription").value
        });
        ui.eventCreateForm.reset();
        document.getElementById("eventDate").value = common.todayISO();
        common.setMessage(ui.eventFormMsg, "Evento registrado correctamente.");
        await refreshAll();
      } catch (error) {
        common.setMessage(ui.eventFormMsg, error.message || "No se pudo crear evento.", "error");
      }
    });

    ui.settingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      common.setMessage(ui.settingsFormMsg, "");
      if (!ensureWritePermission(ui.settingsFormMsg)) {
        return;
      }
      try {
        currentSettings = await service.saveSettings({
          community_name: ui.settingsCommunityName.value,
          currency: ui.settingsCurrency.value,
          payment_day: Number(ui.settingsPaymentDay.value || 15),
          reminder_days: Number(ui.settingsReminderDays.value || 5),
          advanced_key: ui.settingsAdvancedKey.value
        });
        renderSettings(currentSettings);
        renderReportCards();
        common.setMessage(ui.settingsFormMsg, "Configuración guardada.");
      } catch (error) {
        common.setMessage(ui.settingsFormMsg, error.message || "No se pudo guardar configuración.", "error");
      }
    });

    ui.userCreateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      common.setMessage(ui.userFormMsg, "");
      if (!ensureWritePermission(ui.userFormMsg)) {
        return;
      }
      try {
        await service.createUser({
          username: document.getElementById("userUsername").value,
          password: document.getElementById("userPassword").value,
          full_name: document.getElementById("userFullName").value,
          email: document.getElementById("userEmail").value,
          role: document.getElementById("userRole").value,
          client_id: ui.userClientId.value || null
        });
        ui.userCreateForm.reset();
        common.setMessage(ui.userFormMsg, "Usuario creado correctamente.");
        await refreshAll();
      } catch (error) {
        common.setMessage(ui.userFormMsg, error.message || "No se pudo crear usuario.", "error");
      }
    });

    ui.usersTableBody.addEventListener("click", async (event) => {
      const target = event.target;
      if (!target || !target.dataset || !target.dataset.toggleUser) {
        return;
      }
      if (!currentAccess.canManageUsers) {
        common.setMessage(ui.userFormMsg, "Tu perfil es de solo lectura. Esta acción no está permitida.", "error");
        return;
      }
      try {
        await service.toggleUserActive(target.dataset.toggleUser);
        await refreshAll();
      } catch (error) {
        common.setMessage(ui.userFormMsg, error.message || "No se pudo actualizar estado del usuario.", "error");
      }
    });
  }

  function bootstrapLoginFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const user = common.normalizeUsername(params.get("user"));
    if (!user) {
      return;
    }
    ui.adminUser.value = user;
    ui.adminPass.focus();
  }

  async function boot() {
    bindEvents();
    exportReports();
    bootstrapLoginFromQuery();
    document.getElementById("paymentDate").value = common.todayISO();
    document.getElementById("expenseDate").value = common.todayISO();
    document.getElementById("eventDate").value = common.todayISO();

    const status = await service.init();
    paintMode(status);

    currentUser = await service.getCurrentUser();
    if (!currentUser) {
      showLogin();
      return;
    }
    currentAccess = resolveAccess(currentUser);
    if (!canAccessAdminPanel(currentUser)) {
      service.logout();
      currentUser = null;
      showLogin("Tu rol no tiene acceso a este panel.", "error");
      return;
    }

    showApp();
    await refreshAll();
    selectSection("dashboard");
  }

  boot().catch((error) => {
    showLogin(error.message || "Error inicializando panel.", "error");
  });
});
