import axios from 'axios';

const KAKAO_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY as string;

export interface Coordinates {
    lat: number;
    lng: number;
}

// ... (KakaoAddressResponse, DestinationSuccess, DestinationFail 등 기존 타입은 유지) ...
interface KakaoAddressResponse {
    documents: Array<{ address: { region_1depth_name: string; region_2depth_name: string; } }>;
}

export interface DestinationSuccess {
    isValid: true;
    region1: string;
    region2: string;
    lat: number;
    lng: number;
    distance?: number; // 거리 정보 추가
}

export interface DestinationFail { isValid: false; }
export type DestinationResult = DestinationSuccess | DestinationFail;

// [신규] 위경도 간의 실제 거리(km)를 구하는 Haversine 공식
export function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // 지구 반지름 (km)
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * 1. 랜덤 좌표 생성 (origin이 있으면 해당 위치 주변으로 범위 축소)
 */
function getRandomCoordinates(origin?: Coordinates, maxRadiusKm?: number): Coordinates {
    let MIN_LAT = 33.1, MAX_LAT = 38.6, MIN_LNG = 124.6, MAX_LNG = 131.9;

    // 현재 위치가 있다면, maxRadiusKm 반경만큼만 바운딩 박스 축소 (위도 1도는 약 111km)
    if (origin && maxRadiusKm) {
        const offsetLat = maxRadiusKm / 111;
        const offsetLng = maxRadiusKm / (111 * Math.cos(origin.lat * (Math.PI / 180)));
        
        MIN_LAT = origin.lat - offsetLat;
        MAX_LAT = origin.lat + offsetLat;
        MIN_LNG = origin.lng - offsetLng;
        MAX_LNG = origin.lng + offsetLng;
    }

    const lat = Math.random() * (MAX_LAT - MIN_LAT) + MIN_LAT;
    const lng = Math.random() * (MAX_LNG - MIN_LNG) + MIN_LNG;

    return { lat, lng };
}

/**
 * 2. 카카오 API로 육지 여부 확인
 */
/**
 * 2. 카카오 API로 육지 여부 확인 및 행정구역 중심 좌표 추출
 */
async function checkValidLocation(lat: number, lng: number): Promise<DestinationResult> {
    const geoUrl = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`;
    
    try {
        // 1. 랜덤 좌표로 행정구역(시/도, 시/군/구) 알아내기
        const geoResponse = await axios.get(geoUrl, {
            headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` }
        });
        
        const documents = geoResponse.data.documents;
        
        if (documents && documents.length > 0) {
            const region1 = documents[0].address.region_1depth_name;
            const region2 = documents[0].address.region_2depth_name;
            
            // 2. 알아낸 행정구역 이름(예: "강원특별자치도 강릉시")으로 주소 검색 API 호출
            const addressUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(region1 + ' ' + region2)}`;
            const addressResponse = await axios.get(addressUrl, {
                headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` }
            });
            
            let centerLat = lat;
            let centerLng = lng;
            
            // 3. 해당 행정구역의 중심(대표) 좌표가 있다면 그 좌표로 덮어쓰기
            if (addressResponse.data.documents && addressResponse.data.documents.length > 0) {
                centerLat = parseFloat(addressResponse.data.documents[0].y);
                centerLng = parseFloat(addressResponse.data.documents[0].x);
            }
            
            return {
                isValid: true,
                region1,
                region2,
                lat: centerLat, // 랜덤 좌표가 아닌 중심 좌표 반환
                lng: centerLng
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
export async function getValidDestination(origin?: Coordinates, maxRadiusKm: number = 100): Promise<DestinationSuccess> {
    const maxRetries = 50; // 해안가 등에서 바다가 많이 잡힐 수 있으므로 재시도 횟수 증가
    let attempts = 0;

    while (attempts < maxRetries) {
        attempts++;
        const { lat, lng } = getRandomCoordinates(origin, maxRadiusKm);
        
        // origin이 있다면, 생성된 좌표가 실제 원형 반경(maxRadiusKm) 내에 있는지 확인
        if (origin) {
            const distance = getDistance(origin.lat, origin.lng, lat, lng);
            if (distance > maxRadiusKm) continue; // 반경을 벗어나면 카카오 API 호출 없이 바로 재시도
        }
        
        const result = await checkValidLocation(lat, lng);
        
        if (result.isValid) {
            if (origin) {
                result.distance = getDistance(origin.lat, origin.lng, lat, lng);
            }
            return result; 
        }
    }
    throw new Error("조건에 맞는 육지를 찾지 못했습니다. 다시 시도해주세요!");
}