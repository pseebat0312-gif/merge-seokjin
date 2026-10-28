/* REST-only Supabase adapter; no CDN dependency. Never accepts another player's ID for writes. */
window.Cloud = (() => {
  const cfg = window.GAME_CONFIG;
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseKey);
  const key = 'merge-session:' + cfg.supabaseUrl;
  let session = null, pending = null;
  try { session = JSON.parse(localStorage.getItem(key)); } catch {}
  async function request(path, body, token) {
    const response = await fetch(cfg.supabaseUrl.replace(/\/$/, '') + path, {
      method: 'POST', headers: {'Content-Type':'application/json', apikey:cfg.supabaseKey,
        ...(token ? {Authorization:'Bearer '+token} : {})}, body:JSON.stringify(body), signal:AbortSignal.timeout(12000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || '连接失败');
    return data;
  }
  async function auth() {
    if (!enabled) return;
    if (session?.access_token && session.expires_at > Date.now()/1000 + 90) return session;
    if (pending) return pending;
    pending = (async () => {
      const old = session;
      // Keep an invalid existing identity rather than silently replacing it and losing its record.
      const data = old?.refresh_token
        ? await request('/auth/v1/token?grant_type=refresh_token', {refresh_token:old.refresh_token})
        : await request('/auth/v1/signup', {data:{}});
      if (!data.access_token) throw new Error('请先在 Supabase 开启匿名登录');
      session = {...data, expires_at:Date.now()/1000+data.expires_in};
      localStorage.setItem(key, JSON.stringify(session));
      return session;
    })().finally(()=>pending=null);
    return pending;
  }
  async function rpc(name, body={}) {
    if (!enabled) return null;
    const s = await auth();
    return request('/rest/v1/rpc/'+name,body,s.access_token);
  }
  return {enabled, auth, profile:n=>rpc('merge_profile',{p_name:n}),
    submit:score=>rpc('merge_submit',{p_score:score}), board:()=>rpc('merge_board'),
    get id(){return session?.user?.id;}};
})();
