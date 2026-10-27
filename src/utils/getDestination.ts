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

export type Theme = 'ALL' | 'SEA' | 'CITY';

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
function getRandomCoordinates(theme: Theme): Coordinates {
    let minLat, maxLat, minLng, maxLng;

    switch (theme) {
        case 'SEA':
            // 0: 동해안, 1: 남해안, 2: 서해안 중 무작위 선택
            const coast = Math.floor(Math.random() * 3);
            if (coast === 0) { 
                // 동해안 (강원~경북~울산 해안선)
                minLat = 35.2; maxLat = 38.5; minLng = 129.1; maxLng = 129.6;
            } else if (coast === 1) { 
                // 남해안 (전남~경남 해안선)
                minLat = 34.2; maxLat = 35.2; minLng = 126.3; maxLng = 129.1;
            } else { 
                // 서해안 (경기~충남~전북 해안선)
                minLat = 34.5; maxLat = 37.8; minLng = 126.0; maxLng = 126.7;
            }
            break;
        case 'CITY': // 수도권
            minLat = 37.1; maxLat = 37.7; minLng = 126.7; maxLng = 127.3; break;
        case 'ALL':
        default: // 전국
            minLat = 33.1; maxLat = 38.6; minLng = 125.0; maxLng = 130.8; break;
    }

    return {
        lat: Math.random() * (maxLat - minLat) + minLat,
        lng: Math.random() * (maxLng - minLng) + minLng
    };
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
export async function getValidDestination(theme: Theme = 'ALL'): Promise<DestinationSuccess> {
    const MAX_RETRIES = 30; // 섬이나 특정 지역은 바다가 많아 재시도 횟수를 늘려도 좋습니다.
    for (let i = 0; i < MAX_RETRIES; i++) {
        const { lat, lng } = getRandomCoordinates(theme);
        const result = await checkValidLocation(lat, lng);
        if (result.isValid) return result as DestinationSuccess;
    }
    throw new Error("유효한 목적지를 찾지 못했습니다. 다시 시도해주세요.");
}