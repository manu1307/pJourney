import axios from "axios";

const KAKAO_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY as string;

export interface Coordinates {
  lat: number;
  lng: number;
}

// ... (KakaoAddressResponse, DestinationSuccess, DestinationFail 등 기존 타입은 유지) ...
interface KakaoAddressResponse {
  documents: Array<{
    address: { region_1depth_name: string; region_2depth_name: string };
  }>;
}

export interface DestinationSuccess {
  isValid: true;
  region1: string;
  region2: string;
  lat: number;
  lng: number;
  distance?: number; // 거리 정보 추가
}

export type Theme =
  | "ALL"
  | "SEA"
  | "CITY"
  | "GANGWON"
  | "CHUNGCHEONG"
  | "JEOLLA"
  | "GYEONGSANG";

export interface DestinationFail {
  isValid: false;
}
export type DestinationResult = DestinationSuccess | DestinationFail;
// 🎯 각 테마/지역별 대략적인 위경도 최소~최대 범위 (바운딩 박스)
const REGION_BOUNDS: Record<
  string,
  { minLat: number; maxLat: number; minLng: number; maxLng: number }
> = {
  CITY: { minLat: 37.0, maxLat: 37.8, minLng: 126.5, maxLng: 127.5 }, // 수도권
  GANGWON: { minLat: 37.1, maxLat: 38.4, minLng: 127.7, maxLng: 129.2 }, // 강원
  CHUNGCHEONG: { minLat: 36.0, maxLat: 37.0, minLng: 126.1, maxLng: 128.0 }, // 충청
  JEOLLA: { minLat: 34.3, maxLat: 36.0, minLng: 126.0, maxLng: 127.7 }, // 전라
  GYEONGSANG: { minLat: 34.5, maxLat: 37.0, minLng: 127.8, maxLng: 129.5 }, // 경상
  ALL: { minLat: 34.3, maxLat: 38.4, minLng: 126.0, maxLng: 129.5 }, // 전국 (남한 기준)
};
// [신규] 위경도 간의 실제 거리(km)를 구하는 Haversine 공식
export function getDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // 지구 반지름 (km)
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 1. 랜덤 좌표 생성 (origin이 있으면 해당 위치 주변으로 범위 축소)
 */
export function getRandomCoordinates(theme: Theme) {
  // 테마에 맞는 바운딩 박스를 가져오고, 없거나 바다(SEA) 테마일 경우 전국 범위 사용
  const bounds = REGION_BOUNDS[theme] || REGION_BOUNDS.ALL;

  const lat = Math.random() * (bounds.maxLat - bounds.minLat) + bounds.minLat;
  const lng = Math.random() * (bounds.maxLng - bounds.minLng) + bounds.minLng;

  return { lat, lng };
}
/**
 * 2. 카카오 API로 육지 여부 확인
 */
/**
 * 2. 카카오 API로 육지 여부 확인 및 행정구역 중심 좌표 추출
 */
async function checkValidLocation(
  lat: number,
  lng: number,
): Promise<DestinationResult> {
  const geoUrl = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`;

  try {
    // 1. 랜덤 좌표로 행정구역(시/도, 시/군/구) 알아내기
    const geoResponse = await axios.get(geoUrl, {
      headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
    });

    const documents = geoResponse.data.documents;

    if (documents && documents.length > 0) {
      const region1 = documents[0].address.region_1depth_name;
      const region2 = documents[0].address.region_2depth_name;

      // 2. 알아낸 행정구역 이름(예: "강원특별자치도 강릉시")으로 주소 검색 API 호출
      const addressUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(region1 + " " + region2)}`;
      const addressResponse = await axios.get(addressUrl, {
        headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
      });

      let centerLat = lat;
      let centerLng = lng;

      // 3. 해당 행정구역의 중심(대표) 좌표가 있다면 그 좌표로 덮어쓰기
      if (
        addressResponse.data.documents &&
        addressResponse.data.documents.length > 0
      ) {
        centerLat = parseFloat(addressResponse.data.documents[0].y);
        centerLng = parseFloat(addressResponse.data.documents[0].x);
      }

      return {
        isValid: true,
        region1,
        region2,
        lat: centerLat, // 랜덤 좌표가 아닌 중심 좌표 반환
        lng: centerLng,
      };
    }

    return { isValid: false };
  } catch (error) {
    console.error("Kakao API 요청 실패:", error);
    throw error;
  }
}

/**
 * 3. Re-roll 메인 로직 (거리 조건 추가)
 */
export async function getValidDestination(
  theme: Theme = "ALL",
): Promise<DestinationSuccess> {
  let targetRegions: string[] = [];

  switch (theme) {
    case "CITY":
      targetRegions = ["서울", "인천", "경기"];
      break;
    case "SEA":
      // 바다 테마는 해안선이 있는 도/시 기준 (필요시 시/군/구 단위로 더 좁혀야 함)
      targetRegions = [
        "부산",
        "울산",
        "강원",
        "경북",
        "경남",
        "전남",
        "전북",
        "제주",
        "충남",
      ];
      break;
    case "GANGWON":
      targetRegions = ["강원"]; // '강원특별자치도' 등 대응
      break;
    case "CHUNGCHEONG":
      targetRegions = ["충남", "충청남도", "충북", "충청북도", "대전", "세종"];
      break;
    case "JEOLLA":
      targetRegions = [
        "전남",
        "전라남도",
        "전북",
        "전라북도",
        "전북특별자치도",
        "광주",
      ];
      break;
    case "GYEONGSANG":
      targetRegions = [
        "경남",
        "경상남도",
        "경북",
        "경상북도",
        "부산",
        "대구",
        "울산",
      ];
      break;
    case "ALL":
    default:
      targetRegions = []; // 전체 허용
      break;
  }

  const MAX_RETRIES = 30; // 섬이나 특정 지역은 바다가 많아 재시도 횟수를 늘려도 좋습니다.
  for (let i = 0; i < MAX_RETRIES; i++) {
    const { lat, lng } = getRandomCoordinates(theme);
    const result = await checkValidLocation(lat, lng);

    if (result.isValid) {
      // 🎯 1. 뽑힌 주소 문자열 조합 (예: "경상북도 문경시")
      const region1 = result.region1 || "";
      const region2 = result.region2 || "";
      const fullName = `${region1} ${region2}`;

      let isMatched = false;

      if (theme === "SEA") {
        // 🎯 2. '바다' 테마는 도(region1)가 아니라, 실제 바다가 있는 시/군/구 단위로 정밀 검사
        const coastalCities = [
          "강릉",
          "속초",
          "양양",
          "동해",
          "삼척",
          "고성", // 강원
          "포항",
          "경주",
          "영덕",
          "울진",
          "울릉", // 경북
          "거제",
          "통영",
          "사천",
          "남해",
          "하동",
          "창원", // 경남
          "여수",
          "순천",
          "광양",
          "고흥",
          "보성",
          "장흥",
          "강진",
          "해남",
          "완도",
          "진도",
          "신안",
          "목포",
          "무안",
          "함평",
          "영광", // 전남
          "군산",
          "부안",
          "고창",
          "김제", // 전북
          "태안",
          "보령",
          "서천",
          "서산",
          "당진",
          "아산", // 충남
          "화성",
          "평택",
          "안산",
          "시흥",
          "김포",
          "강화",
          "옹진", // 경기/인천
          "부산",
          "울산",
          "제주",
          "서귀포", // 광역시 및 자치도 전체 허용
        ];
        // fullName(예: "경상북도 문경시") 안에 바닷가 도시 이름이 포함되어 있는지 확인
        isMatched = coastalCities.some((coast) => fullName.includes(coast));
      } else {
        // 🎯 3. 다른 팔도 테마는 기존처럼 region1(도 단위) 포함 여부만 검사
        isMatched =
          targetRegions.length === 0 ||
          targetRegions.some((target) => region1.includes(target));
      }

      if (isMatched) {
        return result as DestinationSuccess; // 유효한 육지이면서 테마 조건까지 통과!
      }
    }
  }
  throw new Error(
    "해당 조건에 맞는 목적지를 찾지 못했습니다. 다시 시도해주세요.",
  );
}
