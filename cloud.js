
/* Supabase 云端连接：匿名登录、成绩提交、排行榜 */
window.Cloud = (() => {
  const cfg = window.GAME_CONFIG;
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseKey);
  const key = 'merge-session:' + cfg.supabaseUrl;

  let session = null;
  let pending = null;

  try {
    session = JSON.parse(localStorage.getItem(key));
  } catch {}

  async function request(path, body, token) {
    const response = await fetch(
      cfg.supabaseUrl.replace(/\/$/, '') + path,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.supabaseKey,
          ...(token ? { Authorization: 'Bearer ' + token } : {})
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000)
      }
    );

    // 兼容 Supabase 返回空响应（例如 204）
    const raw = await response.text();
    let data = {};

    if (raw.trim()) {
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          `服务器返回了无法解析的数据（HTTP ${response.status}）`
        );
      }
    }

    if (!response.ok) {
      throw new Error(
        data.msg ||
        data.message ||
        data.error_description ||
        data.error ||
        `请求失败（HTTP ${response.status}）`
      );
    }

    return data;
  }

  async function auth() {
    if (!enabled) return;

    if (
      session?.access_token &&
      session.expires_at > Date.now() / 1000 + 90
    ) {
      return session;
    }

    if (pending) return pending;

    pending = (async () => {
      const old = session;

      const data = old?.refresh_token
        ? await request(
            '/auth/v1/token?grant_type=refresh_token',
            { refresh_token: old.refresh_token }
          )
        : await request(
            '/auth/v1/signup',
            { data: {} }
          );

      if (!data.access_token) {
        throw new Error('请先在 Supabase 开启匿名登录');
      }

      session = {
        ...data,
        expires_at: Date.now() / 1000 + data.expires_in
      };

      localStorage.setItem(key, JSON.stringify(session));

      return session;
    })().finally(() => {
      pending = null;
    });

    return pending;
  }

  async function rpc(name, body = {}) {
    if (!enabled) return null;

    const s = await auth();

    return request(
      '/rest/v1/rpc/' + name,
      body,
      s.access_token
    );
  }

  return {
    enabled,
    auth,

    profile: name =>
      rpc('merge_profile', { p_name: name }),

    submit: score =>
      rpc('merge_submit', { p_score: score }),

    board: () =>
      rpc('merge_board'),

    get id() {
      return session?.user?.id;
    }
  };
})();
