// Google credentials belong in the Supabase provider settings, never in this client.
export async function startGoogleOAuth(client, project, redirectTo, fetchImpl = fetch) {
  const response = await fetchImpl(`${project.url}/auth/v1/settings`, {
    headers: { apikey: project.publishableKey }, signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Không thể kết nối dịch vụ đăng nhập. Vui lòng thử lại.');
  const settings = await response.json();
  if (settings.external?.google !== true) {
    throw new Error('Đăng nhập Google chưa sẵn sàng. Vui lòng dùng email và mật khẩu hoặc thử lại sau.');
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, scopes: 'openid email profile', queryParams: { prompt: 'select_account' } }
  });
  if (error) throw error;
}

export function oauthReturnMessage(href) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const code = hash.get('error_code') || hash.get('error') || url.searchParams.get('error_code') || url.searchParams.get('error');
  if (!code) return '';
  if (code === 'access_denied') return 'Đăng nhập Google đã bị hủy hoặc chưa được cho phép. Bạn có thể thử lại.';
  return 'Không thể hoàn tất đăng nhập Google. Vui lòng thử lại hoặc dùng email và mật khẩu.';
}
