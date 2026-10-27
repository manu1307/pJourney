import axios from "axios";

const KAKAO_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY as string;

export interface Place {
  id: string;
  place_name: string;
  distance: string;
  category_group_code: string;
  x: string; // 경도 추가
  y: string; // 위도 추가
}

export async function getNearbyPlaces(
  lat: number,
  lng: number,
  category: "AT4" | "FD6" | "AD5",
): Promise<Place[]> {
  const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${category}&y=${lat}&x=${lng}&radius=10000&sort=distance`;
  const response = await axios.get(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
  });

  return response.data.documents.slice(0, 5).map((doc: any) => ({
    id: doc.id,
    place_name: doc.place_name,
    distance: doc.distance,
    category_group_code: doc.category_group_code,
    x: doc.x,
    y: doc.y,
  }));
}

export async function getNearbyTouristSpots(
  lat: number,
  lng: number,
): Promise<Place[]> {
  // AT4: 관광명소, radius: 10000 (10km 반경)
  const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=AT4&y=${lat}&x=${lng}&radius=10000&sort=distance`;

  try {
    const response = await axios.get(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
    });

    // 상위 3개의 관광지만 추출
    return response.data.documents.slice(0, 3).map((doc: any) => ({
      id: doc.id,
      place_name: doc.place_name,
      distance: doc.distance,
      place_url: doc.place_url,
    }));
  } catch (error) {
    console.error("관광지 검색 실패:", error);
    return []; // 에러 시 빈 배열 반환하여 앱 크래시 방지
  }
}
