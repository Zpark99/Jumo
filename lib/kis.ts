import { supabaseAdmin } from "@/lib/supabaseAdmin";

export function getKisBaseUrl(): string {
  return process.env.KIS_BASE_URL ?? "https://openapi.koreainvestment.com:9443";
}

// DB(kis_tokens)에 캐시된 토큰을 먼저 조회하고, 없거나 만료 임박(5분 이내,
// get_kis_token RPC 내부 기준)이면 KIS에 재발급받아 저장한다.
// 토큰 값은 어떤 경우에도 로그로 남기지 않는다.
export async function getKisToken(): Promise<string> {
  const { data: cachedToken, error: readError } =
    await supabaseAdmin.rpc("get_kis_token");

  if (readError) {
    console.error("[kis] get_kis_token RPC 실패:", readError.message);
  } else if (cachedToken) {
    return cachedToken as string;
  }

  const baseUrl = getKisBaseUrl();
  const res = await fetch(`${baseUrl}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    }),
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error("KIS token error: " + JSON.stringify(json));
  }

  const accessToken = json.access_token as string;
  const expiresAt = new Date(
    Date.now() + (json.expires_in ?? 86400) * 1000
  ).toISOString();

  const { error: upsertError } = await supabaseAdmin.rpc("upsert_kis_token", {
    p_token: accessToken,
    p_expires_at: expiresAt,
  });
  if (upsertError) {
    console.error("[kis] upsert_kis_token RPC 실패:", upsertError.message);
  }

  return accessToken;
}
