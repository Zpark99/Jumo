import { unstable_cache } from "next/cache";

import { INDEX_CACHE_TTL_SEC } from "@/lib/constants";
import { getKisBaseUrl, getKisToken } from "@/lib/kis";

type KisIndexResponse = {
  rt_cd: string;
  output?: {
    bstp_nmix_prpr?: string; // 지수
    bstp_nmix_prdy_vrss?: string; // 전일 대비 (부호 포함)
    bstp_nmix_prdy_ctrt?: string; // 등락률 % (부호 포함)
  };
};

export type DomesticIndex = {
  id: "kospi" | "kosdaq";
  name: string;
  value: number | null; // null = 조회 실패. 목업으로 대체하지 않는다
  change: number | null;
  changePct: number | null;
};

export type DomesticIndicesResponse = {
  indices: DomesticIndex[];
  fetched_at: string;
};

// KIS 업종코드 (FID_COND_MRKT_DIV_CODE=U): 0001 코스피, 1001 코스닥.
// 해외지수·환율은 EGW02004(권한 없음)라 여기서 다루지 않는다 (#120).
const INDICES = [
  { id: "kospi", name: "코스피", code: "0001" },
  { id: "kosdaq", name: "코스닥", code: "1001" },
] as const;

// rate limit 초당 2건(EGW00201). 2건을 동시에 쏘지 않고 간격을 둔다.
const KIS_CALL_GAP_MS = 600;

async function fetchKisIndex(
  code: string,
  token: string
): Promise<KisIndexResponse> {
  const url = new URL(
    `${getKisBaseUrl()}/uapi/domestic-stock/v1/quotations/inquire-index-price`
  );
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "U");
  url.searchParams.set("FID_INPUT_ISCD", code);

  const res = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_APP_KEY!,
      appsecret: process.env.KIS_APP_SECRET!,
      tr_id: "FHPUP02100000",
      custtype: "P",
    },
  });
  return res.json();
}

function emptyIndex(meta: (typeof INDICES)[number]): DomesticIndex {
  return { id: meta.id, name: meta.name, value: null, change: null, changePct: null };
}

// rt_cd=0이어도 output이 비어 오는 경우가 실측됐다(#121과 같은 유형).
// 0 이하·비숫자 지수는 실패로 본다.
function toIndex(
  meta: (typeof INDICES)[number],
  data: KisIndexResponse
): DomesticIndex {
  const value = Number(data.output?.bstp_nmix_prpr);
  if (data.rt_cd !== "0" || !Number.isFinite(value) || value <= 0) {
    return emptyIndex(meta);
  }
  const change = Number(data.output?.bstp_nmix_prdy_vrss);
  const changePct = Number(data.output?.bstp_nmix_prdy_ctrt);
  return {
    id: meta.id,
    name: meta.name,
    value,
    change: Number.isFinite(change) ? change : null,
    changePct: Number.isFinite(changePct) ? changePct : null,
  };
}

// 홈은 비로그인도 열 수 있어 호출 수가 사용자 수에 비례한다. Next 데이터 캐시
// (Vercel에선 인스턴스 간 공유)로 TTL당 KIS 호출을 2건으로 묶는다. 메모리 캐시는
// 서버리스 인스턴스마다 따로라 상한을 보장하지 못하고, DB 캐시(price_quotes)는
// stocks FK 때문에 지수를 넣을 수 없어 쓰지 않았다.
// 실패 결과도 TTL 동안 캐시한다 — 장애 시 매 요청이 KIS를 다시 때리지 않게.
const getDomesticIndices = unstable_cache(
  async (): Promise<DomesticIndicesResponse> => {
    const token = await getKisToken();
    const indices: DomesticIndex[] = [];

    for (const [i, meta] of INDICES.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, KIS_CALL_GAP_MS));
      try {
        indices.push(toIndex(meta, await fetchKisIndex(meta.code, token)));
      } catch {
        indices.push(emptyIndex(meta));
      }
    }

    return { indices, fetched_at: new Date().toISOString() };
  },
  ["domestic-indices"],
  { revalidate: INDEX_CACHE_TTL_SEC }
);

export async function GET() {
  try {
    return Response.json(await getDomesticIndices());
  } catch {
    // 토큰 발급 실패 등. 캐시되지 않으므로 다음 요청에서 재시도된다
    return Response.json({ error: "INDEX_UNAVAILABLE" }, { status: 503 });
  }
}
