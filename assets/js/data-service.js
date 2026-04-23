window.JMDataService = (() => {
  const cfg = window.JMTECH_CONFIG || {};
  const common = window.JMCommon;

  const LOCAL_DB_KEY = "jmtech_web_db_v1";
  const SESSION_KEY = "jmtech_web_session_v1";
  const SUPABASE_SETTINGS_FALLBACK_KEY = "jmtech_supabase_settings_fallback_v1";

  const DEFAULT_SETTINGS = {
    community_name: cfg.defaultCommunityName || "JM Technology Expert - Sistema de Alícuotas",
    currency: cfg.defaultCurrency || "USD",
    payment_day: Number(cfg.defaultPaymentDay || 15),
    reminder_days: Number(cfg.defaultReminderDays || 5),
    advanced_key: cfg.defaultAdvancedKey || "01081997"
  };
  const DEFAULT_ADMIN_ACCOUNT = {
    username: common.normalizeUsername("Jorge"),
    password: "jorge1997@",
    full_name: "Jorge",
    email: "jorge@jmtech.com",
    role: "superadmin"
  };

  let initialized = false;
  let mode = "supabase";
  let warning = "";
  let supabase = null;
  let localDb = null;
  let settingsTableAvailable = true;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emptyLocalDB() {
    return {
      settings: clone(DEFAULT_SETTINGS),
      users: [],
      clients: [],
      payments: [],
      expenses: [],
      events: []
    };
  }

  function loadLocalDB() {
    try {
      const raw = localStorage.getItem(LOCAL_DB_KEY);
      if (!raw) {
        return emptyLocalDB();
      }
      const parsed = JSON.parse(raw);
      const db = emptyLocalDB();
      db.settings = { ...db.settings, ...(parsed.settings || {}) };
      db.users = Array.isArray(parsed.users) ? parsed.users : [];
      db.clients = Array.isArray(parsed.clients) ? parsed.clients : [];
      db.payments = Array.isArray(parsed.payments) ? parsed.payments : [];
      db.expenses = Array.isArray(parsed.expenses) ? parsed.expenses : [];
      db.events = Array.isArray(parsed.events) ? parsed.events : [];
      return db;
    } catch (_) {
      return emptyLocalDB();
    }
  }

  function saveLocalDB() {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(localDb));
  }

  function loadSupabaseSettingsFallback() {
    try {
      const raw = localStorage.getItem(SUPABASE_SETTINGS_FALLBACK_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed;
    } catch (_) {
      return {};
    }
  }

  function saveSupabaseSettingsFallback(value) {
    try {
      localStorage.setItem(SUPABASE_SETTINGS_FALLBACK_KEY, JSON.stringify(value || {}));
    } catch (_) {
      // no-op
    }
  }

  function isSupabaseConfigured() {
    return Boolean(
      cfg.supabaseUrl &&
      cfg.supabaseAnonKey &&
      window.supabase &&
      typeof window.supabase.createClient === "function"
    );
  }

  function modeLabel() {
    return mode === "supabase" ? "Servicio principal" : "Modo local (respaldo)";
  }

  function getStatus() {
    return {
      mode,
      modeLabel: modeLabel(),
      warning
    };
  }

  async function activateLocalMode(message) {
    mode = "local";
    warning = String(message || "");
    supabase = null;
    localDb = loadLocalDB();
    await ensureLocalSeedData();
  }

  function isMissingSupabaseTableError(message) {
    const text = String(message || "").toLowerCase();
    return text.includes("schema cache") || text.includes("tabla '") || text.includes("does not exist");
  }

  async function init() {
    if (initialized) {
      return getStatus();
    }
    if (!isSupabaseConfigured()) {
      await activateLocalMode("Servicio remoto no configurado. Se activó modo local temporal.");
      initialized = true;
      return getStatus();
    }

    try {
      warning = "";
      supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: false }
      });
      mode = "supabase";
      settingsTableAvailable = true;
      await validateSupabaseTables();
      await ensureSeedData();
      initialized = true;
      return getStatus();
    } catch (error) {
      const detail = error && error.message ? error.message : "error desconocido";
      const recoveryMessage = isMissingSupabaseTableError(detail)
        ? `No se pudo conectar con el servicio remoto: ${detail}. Se activó modo local temporal. Ejecuta supabase-schema.sql y recarga la página.`
        : `No se pudo conectar con el servicio remoto: ${detail}. Se activó modo local temporal.`;
      await activateLocalMode(recoveryMessage);
      initialized = true;
      return getStatus();
    }
  }

  async function validateSupabaseTables() {
    const checks = ["app_users", "clients", "payments", "expenses", "calendar_events"];
    for (const table of checks) {
      const { error } = await supabase.from(table).select("*").limit(1);
      if (error) {
        throw new Error(`tabla '${table}' no disponible (${error.message})`);
      }
    }
    const { error: settingsError } = await supabase.from("app_settings").select("*").limit(1);
    if (settingsError) {
      if (isMissingSupabaseTableError(settingsError.message)) {
        settingsTableAvailable = false;
        warning = "Tabla opcional app_settings no disponible. Se usarán ajustes locales de respaldo.";
        return;
      }
      throw new Error(`tabla 'app_settings' no disponible (${settingsError.message})`);
    }
    settingsTableAvailable = true;
  }

  function sessionData() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.id) {
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function setSession(user) {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        id: user.id,
        role: user.role
      })
    );
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function sanitizeUser(userRow) {
    if (!userRow) {
      return null;
    }
    return {
      id: userRow.id,
      username: userRow.username,
      full_name: userRow.full_name,
      email: userRow.email || "",
      role: userRow.role,
      is_active: Boolean(userRow.is_active),
      client_id: userRow.client_id || null,
      created_at: userRow.created_at || null,
      last_login: userRow.last_login || null
    };
  }

  function isAdminRole(role) {
    const normalized = String(role || "").trim().toLowerCase();
    return normalized === "admin" || normalized === "superadmin" || normalized === "fabricante";
  }

  async function ensureSeedData() {
    await ensureSupabaseSeedData();
  }

  async function ensureLocalSeedData() {
    if (!localDb.settings) {
      localDb.settings = clone(DEFAULT_SETTINGS);
    } else {
      localDb.settings = { ...clone(DEFAULT_SETTINGS), ...localDb.settings };
    }
    if (!Array.isArray(localDb.users)) {
      localDb.users = [];
    }
    let primaryAdmin = localDb.users.find((u) => u.username === DEFAULT_ADMIN_ACCOUNT.username);
    if (!primaryAdmin) {
      primaryAdmin = localDb.users.find((u) => isAdminRole(u.role));
    }
    const salt = common.randomHex(16);
    const password_hash = await common.buildPasswordHash(DEFAULT_ADMIN_ACCOUNT.password, salt);
    if (primaryAdmin) {
      primaryAdmin.username = DEFAULT_ADMIN_ACCOUNT.username;
      primaryAdmin.full_name = DEFAULT_ADMIN_ACCOUNT.full_name;
      primaryAdmin.email = DEFAULT_ADMIN_ACCOUNT.email;
      primaryAdmin.role = DEFAULT_ADMIN_ACCOUNT.role;
      primaryAdmin.is_active = true;
      primaryAdmin.client_id = null;
      primaryAdmin.salt = salt;
      primaryAdmin.password_hash = password_hash;
      if (!primaryAdmin.created_at) {
        primaryAdmin.created_at = new Date().toISOString();
      }
    } else {
      primaryAdmin = {
        id: common.uid("user"),
        username: DEFAULT_ADMIN_ACCOUNT.username,
        full_name: DEFAULT_ADMIN_ACCOUNT.full_name,
        email: DEFAULT_ADMIN_ACCOUNT.email,
        role: DEFAULT_ADMIN_ACCOUNT.role,
        is_active: true,
        salt,
        password_hash,
        client_id: null,
        created_at: new Date().toISOString(),
        last_login: null
      };
      localDb.users.push(primaryAdmin);
    }
    for (const user of localDb.users) {
      if (user.id !== primaryAdmin.id && user.username === "admin" && isAdminRole(user.role)) {
        user.is_active = false;
      }
    }
    saveLocalDB();
  }

  async function ensureSupabaseSeedData() {
    if (settingsTableAvailable) {
    const { data: settingsRow, error: settingsReadErr } = await supabase
      .from("app_settings")
      .select("key,value")
      .eq("key", "portal_settings")
      .maybeSingle();
    if (settingsReadErr) {
      if (isMissingSupabaseTableError(settingsReadErr.message)) {
        settingsTableAvailable = false;
      } else {
        throw new Error(`No se pudo validar configuración inicial (${settingsReadErr.message})`);
      }
    }
    const settingsValue = settingsRow && settingsRow.value ? settingsRow.value : null;
    if (settingsTableAvailable && (!settingsValue || !settingsValue.community_name)) {
      const { error: settingsWriteErr } = await supabase.from("app_settings").upsert(
        {
          key: "portal_settings",
          value: clone(DEFAULT_SETTINGS),
          updated_at: new Date().toISOString()
        },
        { onConflict: "key" }
      );
      if (settingsWriteErr) {
        if (isMissingSupabaseTableError(settingsWriteErr.message)) {
          settingsTableAvailable = false;
        } else {
          throw new Error(`No se pudo guardar configuración inicial (${settingsWriteErr.message})`);
        }
      }
    }
    }
    const { data: preferredRows, error: preferredErr } = await supabase
      .from("app_users")
      .select("id,username,role,created_at")
      .eq("username", DEFAULT_ADMIN_ACCOUNT.username)
      .limit(1);
    if (preferredErr) {
      throw new Error(`No se pudo validar usuario principal (${preferredErr.message})`);
    }
    let targetAdmin = preferredRows && preferredRows.length > 0 ? preferredRows[0] : null;
    if (!targetAdmin) {
      const { data: adminRows, error: adminErr } = await supabase
        .from("app_users")
        .select("id,username,role,created_at")
        .in("role", ["admin", "superadmin"])
        .order("created_at", { ascending: true })
        .limit(1);
      if (adminErr) {
        throw new Error(`No se pudo validar administradores (${adminErr.message})`);
      }
      targetAdmin = adminRows && adminRows.length > 0 ? adminRows[0] : null;
    }
    const salt = common.randomHex(16);
    const password_hash = await common.buildPasswordHash(DEFAULT_ADMIN_ACCOUNT.password, salt);
    const adminPayload = {
      username: DEFAULT_ADMIN_ACCOUNT.username,
      full_name: DEFAULT_ADMIN_ACCOUNT.full_name,
      email: DEFAULT_ADMIN_ACCOUNT.email,
      role: DEFAULT_ADMIN_ACCOUNT.role,
      is_active: true,
      client_id: null,
      salt,
      password_hash
    };
    let activeAdminId = null;
    if (targetAdmin) {
      const { data: updatedAdmin, error: updateAdminErr } = await supabase
        .from("app_users")
        .update(adminPayload)
        .eq("id", targetAdmin.id)
        .select("id")
        .single();
      if (updateAdminErr) {
        throw new Error(`No se pudo actualizar administrador principal (${updateAdminErr.message})`);
      }
      activeAdminId = updatedAdmin.id;
    } else {
      const { data: createdAdmin, error: createAdminErr } = await supabase
        .from("app_users")
        .insert(adminPayload)
        .select("id")
        .single();
      if (createAdminErr) {
        throw new Error(`No se pudo crear administrador principal (${createAdminErr.message})`);
      }
      activeAdminId = createdAdmin.id;
    }
    const { error: deactivateLegacyErr } = await supabase
      .from("app_users")
      .update({ is_active: false })
      .eq("username", "admin")
      .neq("id", activeAdminId);
    if (deactivateLegacyErr) {
      throw new Error(`No se pudo desactivar usuario admin anterior (${deactivateLegacyErr.message})`);
    }
  }

  async function getCurrentUser() {
    await init();
    const session = sessionData();
    if (!session) {
      return null;
    }
    if (mode === "local") {
      const found = localDb.users.find((u) => u.id === session.id && u.is_active);
      if (!found) {
        clearSession();
        return null;
      }
      return sanitizeUser(found);
    }
    const { data, error } = await supabase
      .from("app_users")
      .select("id,username,full_name,email,role,is_active,client_id,created_at,last_login")
      .eq("id", session.id)
      .maybeSingle();
    if (error || !data || !data.is_active) {
      clearSession();
      return null;
    }
    return sanitizeUser(data);
  }

  async function login(username, password, allowedRoles = []) {
    await init();
    const normalized = common.normalizeUsername(username);
    if (!normalized || !password) {
      return { ok: false, message: "Usuario y contraseña son obligatorios." };
    }

    if (mode === "local") {
      const user = localDb.users.find((u) => u.username === normalized);
      if (!user) {
        return { ok: false, message: "Credenciales inválidas." };
      }
      if (!user.is_active) {
        return { ok: false, message: "Usuario desactivado." };
      }
      const hash = await common.buildPasswordHash(password, user.salt);
      if (hash !== user.password_hash) {
        return { ok: false, message: "Credenciales inválidas." };
      }
      if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        return { ok: false, message: "No tienes permisos para este portal." };
      }
      user.last_login = new Date().toISOString();
      saveLocalDB();
      setSession(user);
      return { ok: true, user: sanitizeUser(user) };
    }

    const { data: userRow, error } = await supabase
      .from("app_users")
      .select("id,username,full_name,email,role,is_active,client_id,created_at,last_login,password_hash,salt")
      .eq("username", normalized)
      .maybeSingle();
    if (error || !userRow) {
      return { ok: false, message: "Credenciales inválidas." };
    }
    if (!userRow.is_active) {
      return { ok: false, message: "Usuario desactivado." };
    }
    const hash = await common.buildPasswordHash(password, userRow.salt);
    if (hash !== userRow.password_hash) {
      return { ok: false, message: "Credenciales inválidas." };
    }
    if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(userRow.role)) {
      return { ok: false, message: "No tienes permisos para este portal." };
    }
    const now = new Date().toISOString();
    await supabase.from("app_users").update({ last_login: now }).eq("id", userRow.id);
    setSession(userRow);
    return { ok: true, user: sanitizeUser({ ...userRow, last_login: now }) };
  }

  function logout() {
    clearSession();
  }

  async function getSettings() {
    await init();
    if (mode === "local") {
      return { ...clone(DEFAULT_SETTINGS), ...(localDb.settings || {}) };
    }
    if (!settingsTableAvailable) {
      return { ...clone(DEFAULT_SETTINGS), ...loadSupabaseSettingsFallback() };
    }
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "portal_settings")
      .maybeSingle();
    if (error) {
      if (isMissingSupabaseTableError(error.message)) {
        settingsTableAvailable = false;
        return { ...clone(DEFAULT_SETTINGS), ...loadSupabaseSettingsFallback() };
      }
      throw new Error(`No se pudo leer configuración (${error.message})`);
    }
    return { ...clone(DEFAULT_SETTINGS), ...loadSupabaseSettingsFallback(), ...((data && data.value) || {}) };
  }

  async function saveSettings(patch) {
    await init();
    const current = await getSettings();
    const merged = { ...current, ...(patch || {}) };
    if (mode === "local") {
      localDb.settings = merged;
      saveLocalDB();
      return merged;
    }
    if (!settingsTableAvailable) {
      saveSupabaseSettingsFallback(merged);
      return merged;
    }
    const payload = {
      key: "portal_settings",
      value: merged,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from("app_settings").upsert(payload, { onConflict: "key" });
    if (error) {
      if (isMissingSupabaseTableError(error.message)) {
        settingsTableAvailable = false;
        saveSupabaseSettingsFallback(merged);
        return merged;
      }
      throw new Error(`No se pudo guardar configuración (${error.message})`);
    }
    return merged;
  }

  async function listUsers() {
    await init();
    if (mode === "local") {
      return clone(localDb.users)
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
        .map(sanitizeUser);
    }
    const { data, error } = await supabase
      .from("app_users")
      .select("id,username,full_name,email,role,is_active,client_id,created_at,last_login")
      .order("created_at", { ascending: false });
    if (error) {
      throw new Error(`No se pudieron listar usuarios (${error.message})`);
    }
    return (data || []).map(sanitizeUser);
  }

  async function createUser({ username, password, full_name, email = "", role = "cliente", client_id = null }) {
    await init();
    const normalized = common.normalizeUsername(username);
    const name = String(full_name || "").trim();
    const cleanEmail = String(email || "").trim();
    const cleanRole = String(role || "cliente").trim().toLowerCase();
    if (!normalized || !name || !password) {
      throw new Error("username, password y nombre son obligatorios.");
    }
    if (String(password).length < 4) {
      throw new Error("La contraseña debe tener al menos 4 caracteres.");
    }
    if (!["admin", "superadmin", "cliente"].includes(cleanRole)) {
      throw new Error("Rol inválido.");
    }

    if (mode === "local") {
      if (localDb.users.some((u) => u.username === normalized)) {
        throw new Error("Ese usuario ya existe.");
      }
      const salt = common.randomHex(16);
      const password_hash = await common.buildPasswordHash(password, salt);
      const row = {
        id: common.uid("user"),
        username: normalized,
        full_name: name,
        email: cleanEmail,
        role: cleanRole,
        is_active: true,
        client_id: client_id || null,
        salt,
        password_hash,
        created_at: new Date().toISOString(),
        last_login: null
      };
      localDb.users.push(row);
      saveLocalDB();
      return sanitizeUser(row);
    }

    const { data: alreadyExists } = await supabase
      .from("app_users")
      .select("id")
      .eq("username", normalized)
      .limit(1);
    if (alreadyExists && alreadyExists.length > 0) {
      throw new Error("Ese usuario ya existe.");
    }

    const salt = common.randomHex(16);
    const password_hash = await common.buildPasswordHash(password, salt);
    const payload = {
      username: normalized,
      full_name: name,
      email: cleanEmail,
      role: cleanRole,
      is_active: true,
      client_id: client_id || null,
      salt,
      password_hash
    };
    const { data, error } = await supabase
      .from("app_users")
      .insert(payload)
      .select("id,username,full_name,email,role,is_active,client_id,created_at,last_login")
      .single();
    if (error) {
      throw new Error(`No se pudo crear usuario (${error.message})`);
    }
    return sanitizeUser(data);
  }

  async function toggleUserActive(userId) {
    await init();
    if (!userId) {
      throw new Error("userId es obligatorio.");
    }
    if (mode === "local") {
      const found = localDb.users.find((u) => u.id === userId);
      if (!found) {
        throw new Error("Usuario no encontrado.");
      }
      found.is_active = !found.is_active;
      saveLocalDB();
      return sanitizeUser(found);
    }
    const { data: row, error: rowError } = await supabase
      .from("app_users")
      .select("id,is_active")
      .eq("id", userId)
      .maybeSingle();
    if (rowError || !row) {
      throw new Error("Usuario no encontrado.");
    }
    const { data, error } = await supabase
      .from("app_users")
      .update({ is_active: !row.is_active })
      .eq("id", userId)
      .select("id,username,full_name,email,role,is_active,client_id,created_at,last_login")
      .single();
    if (error) {
      throw new Error(`No se pudo actualizar usuario (${error.message})`);
    }
    return sanitizeUser(data);
  }

  async function listClients() {
    await init();
    if (mode === "local") {
      return clone(localDb.clients).sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));
    }
    const { data, error } = await supabase
      .from("clients")
      .select("id,full_name,email,phone,apartment,building,monthly_fee,balance,next_due_date,status,payment_status,notes,owner_username,created_at,updated_at")
      .order("full_name", { ascending: true });
    if (error) {
      throw new Error(`No se pudieron listar clientes (${error.message})`);
    }
    return data || [];
  }

  async function getClientById(clientId) {
    if (!clientId) {
      return null;
    }
    if (mode === "local") {
      const found = localDb.clients.find((c) => c.id === clientId);
      return found ? clone(found) : null;
    }
    const { data, error } = await supabase
      .from("clients")
      .select("id,full_name,email,phone,apartment,building,monthly_fee,balance,next_due_date,status,payment_status,notes,owner_username,created_at,updated_at")
      .eq("id", clientId)
      .maybeSingle();
    if (error) {
      throw new Error(`No se pudo leer cliente (${error.message})`);
    }
    return data || null;
  }

  function computePaymentStatus(balance, dueDate) {
    const currentBalance = common.parseNumber(balance, 0);
    if (currentBalance <= 0) {
      return "Al Día";
    }
    if (!dueDate) {
      return "Pendiente";
    }
    const today = new Date(`${common.todayISO()}T00:00:00`);
    const due = new Date(`${dueDate}T00:00:00`);
    if (Number.isNaN(due.getTime())) {
      return "Pendiente";
    }
    return due < today ? "Vencido" : "Pendiente";
  }

  async function createClientWithAccount({
    full_name,
    email = "",
    phone = "",
    apartment,
    building = "",
    monthly_fee = 0,
    balance = 0,
    next_due_date,
    notes = "",
    owner_full_name,
    owner_username,
    owner_password
  }) {
    await init();
    const ownerUser = common.normalizeUsername(owner_username);
    const clientName = String(full_name || "").trim();
    const ownerName = String(owner_full_name || "").trim();
    const apartmentName = String(apartment || "").trim();
    if (!clientName || !ownerName || !ownerUser || !owner_password || !apartmentName) {
      throw new Error("Completa cliente, apartamento y credenciales de la cuenta cliente.");
    }

    if (mode === "local") {
      if (localDb.users.some((u) => u.username === ownerUser)) {
        throw new Error("El usuario cliente ya existe.");
      }
      const clientId = common.uid("client");
      const dueDate = next_due_date || common.addDays(common.todayISO(), 30);
      const row = {
        id: clientId,
        full_name: clientName,
        email: String(email || "").trim(),
        phone: String(phone || "").trim(),
        apartment: apartmentName,
        building: String(building || "").trim(),
        monthly_fee: common.parseNumber(monthly_fee, 0),
        balance: common.parseNumber(balance, 0),
        next_due_date: dueDate,
        status: "Activo",
        payment_status: computePaymentStatus(balance, dueDate),
        notes: String(notes || "").trim(),
        owner_username: ownerUser,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      localDb.clients.push(row);
      await createUser({
        username: ownerUser,
        password: owner_password,
        full_name: ownerName,
        email: row.email,
        role: "cliente",
        client_id: clientId
      });
      saveLocalDB();
      return {
        client: clone(row),
        access_link: common.buildClientAccessLink(ownerUser)
      };
    }

    const { data: existingUser } = await supabase
      .from("app_users")
      .select("id")
      .eq("username", ownerUser)
      .limit(1);
    if (existingUser && existingUser.length > 0) {
      throw new Error("El usuario cliente ya existe.");
    }

    const dueDate = next_due_date || common.addDays(common.todayISO(), 30);
    const clientPayload = {
      full_name: clientName,
      email: String(email || "").trim(),
      phone: String(phone || "").trim(),
      apartment: apartmentName,
      building: String(building || "").trim(),
      monthly_fee: common.parseNumber(monthly_fee, 0),
      balance: common.parseNumber(balance, 0),
      next_due_date: dueDate,
      status: "Activo",
      payment_status: computePaymentStatus(balance, dueDate),
      notes: String(notes || "").trim(),
      owner_username: ownerUser,
      updated_at: new Date().toISOString()
    };
    const { data: createdClient, error: clientError } = await supabase
      .from("clients")
      .insert(clientPayload)
      .select("id,full_name,email,phone,apartment,building,monthly_fee,balance,next_due_date,status,payment_status,notes,owner_username,created_at,updated_at")
      .single();
    if (clientError) {
      throw new Error(`No se pudo crear cliente (${clientError.message})`);
    }

    try {
      await createUser({
        username: ownerUser,
        password: owner_password,
        full_name: ownerName,
        email: clientPayload.email,
        role: "cliente",
        client_id: createdClient.id
      });
    } catch (error) {
      await supabase.from("clients").delete().eq("id", createdClient.id);
      throw error;
    }

    return {
      client: createdClient,
      access_link: common.buildClientAccessLink(ownerUser)
    };
  }

  async function updateClientBasic(clientId, patch) {
    if (!clientId) {
      return;
    }
    if (mode === "local") {
      const found = localDb.clients.find((c) => c.id === clientId);
      if (!found) {
        return;
      }
      Object.assign(found, patch, { updated_at: new Date().toISOString() });
      saveLocalDB();
      return;
    }
    const payload = { ...patch, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("clients").update(payload).eq("id", clientId);
    if (error) {
      throw new Error(`No se pudo actualizar cliente (${error.message})`);
    }
  }

  async function listPayments() {
    await init();
    if (mode === "local") {
      return clone(localDb.payments).sort((a, b) => String(b.payment_date || "").localeCompare(String(a.payment_date || "")));
    }
    const { data, error } = await supabase
      .from("payments")
      .select("id,client_id,amount,payment_date,payment_method,reference_number,notes,status,created_by,created_at")
      .order("payment_date", { ascending: false });
    if (error) {
      throw new Error(`No se pudieron listar pagos (${error.message})`);
    }
    return data || [];
  }

  async function createPayment({ client_id, amount, payment_method, reference_number = "", payment_date, notes = "" }, actorUser) {
    await init();
    if (!client_id) {
      throw new Error("Selecciona un cliente.");
    }
    const value = common.parseNumber(amount, 0);
    if (value <= 0) {
      throw new Error("El monto debe ser mayor a 0.");
    }

    const client = await getClientById(client_id);
    if (!client) {
      throw new Error("Cliente no encontrado.");
    }

    const row = {
      id: common.uid("payment"),
      client_id,
      amount: value,
      payment_date: payment_date || common.todayISO(),
      payment_method: String(payment_method || "Transferencia"),
      reference_number: String(reference_number || "").trim(),
      notes: String(notes || "").trim(),
      status: "Confirmado",
      created_by: actorUser ? actorUser.id : null,
      created_at: new Date().toISOString()
    };

    const newBalance = Math.max(0, common.parseNumber(client.balance, 0) - value);
    const nextDue = common.addDays(row.payment_date, 30);
    const paymentStatus = computePaymentStatus(newBalance, nextDue);

    if (mode === "local") {
      localDb.payments.push(row);
      await updateClientBasic(client_id, {
        balance: newBalance,
        payment_status: paymentStatus,
        next_due_date: nextDue
      });
      saveLocalDB();
      return clone(row);
    }

    const { error: paymentError } = await supabase.from("payments").insert({
      client_id: row.client_id,
      amount: row.amount,
      payment_date: row.payment_date,
      payment_method: row.payment_method,
      reference_number: row.reference_number,
      notes: row.notes,
      status: row.status,
      created_by: row.created_by
    });
    if (paymentError) {
      throw new Error(`No se pudo registrar pago (${paymentError.message})`);
    }

    await updateClientBasic(client_id, {
      balance: newBalance,
      payment_status: paymentStatus,
      next_due_date: nextDue
    });
    return row;
  }

  async function listExpenses() {
    await init();
    if (mode === "local") {
      return clone(localDb.expenses).sort((a, b) => String(b.expense_date || "").localeCompare(String(a.expense_date || "")));
    }
    const { data, error } = await supabase
      .from("expenses")
      .select("id,description,amount,expense_date,category,payment_method,reference_number,notes,created_by,created_at")
      .order("expense_date", { ascending: false });
    if (error) {
      throw new Error(`No se pudieron listar gastos (${error.message})`);
    }
    return data || [];
  }

  async function createExpense({ description, amount, category = "General", payment_method = "Transferencia", reference_number = "", expense_date, notes = "" }, actorUser) {
    await init();
    const desc = String(description || "").trim();
    if (!desc) {
      throw new Error("La descripción es obligatoria.");
    }
    const value = common.parseNumber(amount, 0);
    if (value <= 0) {
      throw new Error("El monto del gasto debe ser mayor a 0.");
    }
    const row = {
      id: common.uid("expense"),
      description: desc,
      amount: value,
      expense_date: expense_date || common.todayISO(),
      category: String(category || "General"),
      payment_method: String(payment_method || "Transferencia"),
      reference_number: String(reference_number || "").trim(),
      notes: String(notes || "").trim(),
      created_by: actorUser ? actorUser.id : null,
      created_at: new Date().toISOString()
    };
    if (mode === "local") {
      localDb.expenses.push(row);
      saveLocalDB();
      return clone(row);
    }
    const { error } = await supabase.from("expenses").insert({
      description: row.description,
      amount: row.amount,
      expense_date: row.expense_date,
      category: row.category,
      payment_method: row.payment_method,
      reference_number: row.reference_number,
      notes: row.notes,
      created_by: row.created_by
    });
    if (error) {
      throw new Error(`No se pudo registrar gasto (${error.message})`);
    }
    return row;
  }

  async function listEvents() {
    await init();
    if (mode === "local") {
      return clone(localDb.events).sort((a, b) => String(a.event_date || "").localeCompare(String(b.event_date || "")));
    }
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id,title,description,event_date,event_time,event_type,color,created_at")
      .order("event_date", { ascending: true });
    if (error) {
      throw new Error(`No se pudieron listar eventos (${error.message})`);
    }
    return data || [];
  }

  async function createEvent({ title, description = "", event_date, event_time = "", event_type = "general", color = "#00d4ff" }) {
    await init();
    const eventTitle = String(title || "").trim();
    if (!eventTitle) {
      throw new Error("El título del evento es obligatorio.");
    }
    const row = {
      id: common.uid("event"),
      title: eventTitle,
      description: String(description || "").trim(),
      event_date: event_date || common.todayISO(),
      event_time: String(event_time || ""),
      event_type: String(event_type || "general"),
      color: String(color || "#00d4ff"),
      created_at: new Date().toISOString()
    };
    if (mode === "local") {
      localDb.events.push(row);
      saveLocalDB();
      return clone(row);
    }
    const { error } = await supabase.from("calendar_events").insert({
      title: row.title,
      description: row.description,
      event_date: row.event_date,
      event_time: row.event_time,
      event_type: row.event_type,
      color: row.color
    });
    if (error) {
      throw new Error(`No se pudo crear evento (${error.message})`);
    }
    return row;
  }

  async function getDashboardData() {
    const [clients, payments, expenses, settings] = await Promise.all([
      listClients(),
      listPayments(),
      listExpenses(),
      getSettings()
    ]);

    const paidClients = clients.filter((c) => common.parseNumber(c.balance, 0) <= 0).length;
    const pendingClients = clients.filter((c) => common.parseNumber(c.balance, 0) > 0).length;
    const totalCollected = payments.reduce((sum, p) => sum + common.parseNumber(p.amount, 0), 0);
    const totalExpenses = expenses.reduce((sum, p) => sum + common.parseNumber(p.amount, 0), 0);
    const pendingBalance = clients.reduce((sum, c) => sum + Math.max(0, common.parseNumber(c.balance, 0)), 0);

    const today = new Date(`${common.todayISO()}T00:00:00`);
    const reminderDays = common.parseNumber(settings.reminder_days, cfg.defaultReminderDays || 5);
    const reminders = clients
      .filter((c) => common.parseNumber(c.balance, 0) > 0)
      .map((client) => {
        const dueDate = client.next_due_date;
        if (!dueDate) {
          return {
            client,
            text: `${client.full_name} tiene saldo pendiente sin fecha de vencimiento.`,
            warn: true
          };
        }
        const due = new Date(`${dueDate}T00:00:00`);
        const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
        if (diff < 0) {
          return {
            client,
            text: `${client.full_name} está vencido hace ${Math.abs(diff)} día(s).`,
            warn: true
          };
        }
        if (diff <= reminderDays) {
          return {
            client,
            text: `${client.full_name} vence en ${diff} día(s).`,
            warn: false
          };
        }
        return null;
      })
      .filter(Boolean);

    return {
      clients,
      payments,
      expenses,
      settings,
      metrics: {
        total_clients: clients.length,
        paid_clients: paidClients,
        pending_clients: pendingClients,
        total_collected: totalCollected,
        total_expenses: totalExpenses,
        net_balance: totalCollected - totalExpenses,
        pending_balance: pendingBalance
      },
      reminders
    };
  }

  async function getClientPortalData(user) {
    const [settings, events] = await Promise.all([getSettings(), listEvents()]);
    if (!user) {
      return { settings, client: null, payments: [], events: events.slice(0, 20), canManageAll: false };
    }
    if (isAdminRole(user.role)) {
      const allPayments = await listPayments();
      return {
        settings,
        client: null,
        payments: allPayments.slice(0, 30),
        events: events.slice(0, 20),
        canManageAll: true
      };
    }
    if (!user.client_id) {
      return {
        settings,
        client: null,
        payments: [],
        events: events.slice(0, 20),
        canManageAll: false
      };
    }
    const [client, payments] = await Promise.all([
      getClientById(user.client_id),
      listPayments()
    ]);
    const filteredPayments = payments.filter((p) => p.client_id === user.client_id);
    return {
      settings,
      client,
      payments: filteredPayments,
      events: events.slice(0, 20),
      canManageAll: false
    };
  }

  async function getReportData() {
    const [clients, payments, expenses] = await Promise.all([
      listClients(),
      listPayments(),
      listExpenses()
    ]);
    return { clients, payments, expenses };
  }

  function clientAccessLink(username) {
    return common.buildClientAccessLink(username);
  }

  return {
    clientAccessLink,
    createClientWithAccount,
    createEvent,
    createExpense,
    createPayment,
    createUser,
    getClientPortalData,
    getCurrentUser,
    getDashboardData,
    getReportData,
    getSettings,
    getStatus,
    init,
    isAdminRole,
    listClients,
    listEvents,
    listExpenses,
    listPayments,
    listUsers,
    login,
    logout,
    modeLabel,
    saveSettings,
    toggleUserActive
  };
})();
