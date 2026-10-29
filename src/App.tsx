import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Map, MapMarker, CustomOverlayMap } from "react-kakao-maps-sdk";
import html2canvas from "html2canvas";
import ReactGA from "react-ga4";
import confetti from "canvas-confetti";
import { getNearbyPlaces, Place } from "./utils/getPlaces"; // getNearbyPlaces로 변경 적용
import {
  getValidDestination,
  DestinationSuccess,
  Theme,
} from "./utils/getDestination";

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY as string;

type Phase =
  | "IDLE"
  | "SEARCHING"
  | "MAP_REVEAL"
  | "AIMING"
  | "THROWN"
  | "RESULT";
type Category = "AT4" | "FD6" | "AD5";

interface HistoryEntry {
  region: string;
  date: string;
}

interface WeatherData {
  temp: number;
  description: string;
  icon: string;
}

function App() {
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [result, setResult] = useState<DestinationSuccess | null>(null);

  // 탭 및 장소 상태
  const [activeTab, setActiveTab] = useState<Category>("AT4");
  // 🎯 MOTEL 카테고리 추가
  const [accomFilter, setAccomFilter] = useState<
    "ALL" | "HOTEL" | "PENSION" | "MOTEL"
  >("ALL");
  const [placesData, setPlacesData] = useState<Record<Category, Place[]>>({
    AT4: [],
    FD6: [],
    AD5: [],
  });
  const [theme, setTheme] = useState<Theme>("ALL");
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // 도감(히스토리) 상태
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const captureRef = useRef<HTMLDivElement>(null);

  const [releasePos, setReleasePos] = useState({ x: 0, y: 0 });
  const [dragAngle, setDragAngle] = useState(0);
  // 초기 로드: 카카오 SDK 및 로컬스토리지 도감 불러오기
  useEffect(() => {
    if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
    // 결과 도감에 저장
    if (result) {
      const newEntry = {
        region: `${result.region1} ${result.region2}`,
        date: new Date().toLocaleDateString(),
      };
      setHistory((prev) => {
        const updated = [newEntry, ...prev].slice(0, 10); // 최신 10개만 슬라이싱
        localStorage.setItem("p_journey_history", JSON.stringify(updated));
        return updated;
      });
    }
  }, []);

  // 애니메이션 및 도감 저장 시퀀스
  useEffect(() => {
    if (phase === "THROWN") {
      // 다트가 꽂힌 후 지도가 이동할 시간을 살짝 주고 결과창(RESULT)으로 전환
      const timer = setTimeout(() => {
        setPhase("RESULT");
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#007BFF", "#FEE500", "#FF5722", "#4CAF50"],
        });

        // 결과 도감에 저장
        if (result) {
          const newEntry = {
            region: `${result.region1} ${result.region2}`,
            date: new Date().toLocaleDateString(),
          };
          setHistory((prev) => {
            const updated = [newEntry, ...prev].slice(0, 10);
            localStorage.setItem("p_journey_history", JSON.stringify(updated));
            return updated;
          });
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [phase, result]);

  const handleThrowDart = async () => {
    setPhase("SEARCHING");
    setResult(null);
    setPlacesData({ AT4: [], FD6: [], AD5: [] });
    setActiveTab("AT4");
    setAccomFilter("ALL"); // 🎯 다트를 새로 던지면 필터 초기화
    setError(null);

    ReactGA.event({ category: "Game", action: "Throw Dart", label: theme });

    try {
      const destination = await getValidDestination(theme);

      // 명소, 맛집, 숙소 데이터 동시 호출
      const [tour, food, hotel] = await Promise.all([
        getNearbyPlaces(destination.lat, destination.lng, "AT4"),
        getNearbyPlaces(destination.lat, destination.lng, "FD6"),
        getNearbyPlaces(destination.lat, destination.lng, "AD5"),
      ]);

      const WEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;
      const weatherRes = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${destination.lat}&lon=${destination.lng}&appid=${WEATHER_API_KEY}&units=metric&lang=kr`,
      );
      const weatherJson = await weatherRes.json();

      setWeather({
        temp: Math.round(weatherJson.main.temp),
        description: weatherJson.weather[0].description,
        icon: weatherJson.weather[0].icon,
      });

      // 🎯 1. 결과 데이터를 먼저 세팅하여 카카오맵 중심 좌표를 목표 지점으로 이동시킵니다.
      setResult(destination);
      setPlacesData({ AT4: tour, FD6: food, AD5: hotel });

      // 🎯 2. 지도가 새로운 지역의 타일을 로딩할 시간(0.4초)을 벌어준 뒤, 다트를 꽂습니다.
      setTimeout(() => {
        setPhase("THROWN");
      }, 400);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      setPhase("IDLE");
    }
  };

  const shareToKakao = async () => {
    if (!captureRef.current || !result) return;
    try {
      const canvas = await html2canvas(captureRef.current, {
        useCORS: true,
        scale: 2,
        backgroundColor: "#ffffff",
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "result.png", { type: "image/png" });
        const uploadRes = await window.Kakao.Share.uploadImage({
          file: [file],
        });

        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: `🎯 이번 주말, ${result.region1} ${result.region2} 어때?`,
            description:
              "계획은 다트가 짤게, 운전은 누가 할래? 내 다트가 꽂힌 곳과 주변 맛집 구경하기",
            imageUrl: uploadRes.infos.original.url,
            link: {
              mobileWebUrl: window.location.href,
              webUrl: window.location.href,
            },
          },
          buttons: [
            {
              title: "나도 운명의 다트 던지기 🎯",
              link: {
                mobileWebUrl: window.location.href,
                webUrl: window.location.href,
              },
            },
          ],
        });
      }, "image/png");
    } catch (err) {
      alert("공유하기에 실패했습니다.");
    }
  };

  const startKakaoNavi = (place: Place) => {
    window.Kakao.Navi.start({
      name: place.place_name,
      x: Number(place.x),
      y: Number(place.y),
      coordType: "wgs84", // WGS84 좌표계 기준
    });
  };

  return (
    <div
      style={{
        textAlign: "center",
        padding: "20px",
        // 🎯 RESULT 상태일 때 하단 고정 버튼 영역(약 150px)만큼 리스트 아래에 빈 공간을 만들어 가림 방지
        paddingBottom: phase === "RESULT" ? "150px" : "20px",
        fontFamily: "sans-serif",
        width: "100%",
        maxWidth: "500px",
        margin: "0 auto",
        boxSizing: "border-box", // 🎯 padding이 width를 초과하지 않도록 설정
      }}
    >
      <motion.h1
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{
          fontSize: "32px",
          fontWeight: "800",
          color: "#1a1a1a",
          letterSpacing: "-1px",
          marginBottom: "20px",
        }}
      >
        🎯 P의 여행
      </motion.h1>

      {/* 랜딩(IDLE) 페이지 및 도감 */}
      {phase === "IDLE" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <motion.div
            animate={{ y: [0, -15, 0] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
            style={{ marginBottom: "20px" }}
          >
            <img
              src="/dart.png"
              alt="다트"
              style={{
                width: "80px",
                filter: "drop-shadow(0px 10px 15px rgba(0,0,0,0.2))",
              }}
            />
          </motion.div>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: "#333",
              marginBottom: "12px",
            }}
          >
            계획 없는 당신을 위한
            <br />
            완벽한 즉흥 여행
          </h2>
          <p
            style={{
              color: "#777",
              fontSize: "15px",
              lineHeight: "1.6",
              marginBottom: "40px",
            }}
          >
            복잡한 계획은 그만!
            <br />
            운명의 다트를 던져 다음 목적지를 결정해보세요.
          </p>
          {/* 팔도 카테고리가 추가된 테마 선택 필터 */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap", // 🎯 버튼이 많아지면 자동으로 줄바꿈 처리
              justifyContent: "center",
              gap: "8px",
              marginBottom: "20px",
              backgroundColor: "#f1f3f5",
              padding: "12px",
              borderRadius: "16px",
              maxWidth: "360px", // 버튼들이 너무 퍼지지 않게 중앙으로 응집
            }}
          >
            {[
              { id: "ALL", label: "🎲 전국" },
              { id: "SEA", label: "🌊 바다" },
              { id: "CITY", label: "🏙️ 수도권" },
              { id: "GANGWON", label: "🌲 강원" },
              { id: "CHUNGCHEONG", label: "🏞️ 충청" },
              { id: "JEOLLA", label: "🌾 전라" },
              { id: "GYEONGSANG", label: "🌅 경상" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id as Theme)}
                style={{
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "13px",
                  transition: "all 0.2s",
                  backgroundColor: theme === t.id ? "#ffffff" : "transparent",
                  color: theme === t.id ? "#007BFF" : "#666",
                  boxShadow:
                    theme === t.id ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <motion.button
            whileHover={{
              scale: 1.05,
              boxShadow: "0px 15px 25px rgba(0, 123, 255, 0.4)",
            }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setPhase("AIMING")}
            style={{
              padding: "18px 0",
              fontSize: "18px",
              cursor: "pointer",
              background: "linear-gradient(135deg, #007BFF 0%, #00C6FF 100%)",
              color: "white",
              border: "none",
              borderRadius: "30px",
              fontWeight: "bold",
              width: "100%",
              maxWidth: "320px",
              boxShadow: "0px 10px 20px rgba(0, 123, 255, 0.3)",
              transition: "all 0.3s ease",
            }}
          >
            운명의 다트 던지기 ✨
          </motion.button>

          {history.length > 0 && (
            <div
              style={{
                marginTop: "50px",
                width: "100%",
                textAlign: "left",
                backgroundColor: "#f8f9fa",
                padding: "20px",
                borderRadius: "16px",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  color: "#333",
                  marginBottom: "15px",
                }}
              >
                🎒 나의 여행 도감 ({history.length})
              </h3>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  overflowX: "auto",
                  paddingBottom: "10px",
                }}
              >
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      flexShrink: 0,
                      backgroundColor: "#fff",
                      padding: "12px 16px",
                      borderRadius: "12px",
                      border: "1px solid #eee",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: "bold",
                        color: "#007BFF",
                      }}
                    >
                      {item.region}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#999",
                        marginTop: "4px",
                      }}
                    >
                      {item.date}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {error && <p style={{ color: "red", marginTop: "20px" }}>🚨 {error}</p>}

      {/* 통합된 지도 및 결과창 영역 (IDLE이 아닐 때 렌더링) */}
      {phase !== "IDLE" && (
        <div
          ref={captureRef}
          style={{
            marginTop: "20px",
            backgroundColor: phase === "RESULT" ? "#ffffff" : "transparent",
            borderRadius: "24px",
            boxShadow:
              phase === "RESULT" ? "0 20px 40px rgba(0,0,0,0.08)" : "none",
            // 🎯 여기를 반드시 동적으로 변경해야 당길 때 다트가 안 잘립니다!
            overflow: phase === "RESULT" ? "hidden" : "visible",
            transition: "all 0.5s ease",
          }}
        >
          {/* 지도 및 다트 애니메이션 영역 */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: phase === "RESULT" ? "300px" : "450px",
              transition: "height 0.5s ease",
            }}
          >
            <Map
              center={
                result
                  ? { lat: result.lat, lng: result.lng }
                  : { lat: 36.3, lng: 127.8 }
              }
              style={{ width: "100%", height: "100%" }}
              // 🎯 수정: RESULT 상태를 기다리지 않고, result 데이터가 들어오면 즉시 레벨 8로 줌인
              level={result ? 8 : 13}
            >
              {(phase === "THROWN" || phase === "RESULT") && result && (
                <>
                  <MapMarker position={{ lat: result.lat, lng: result.lng }} />
                  <CustomOverlayMap
                    position={{ lat: result.lat, lng: result.lng }}
                    zIndex={30}
                  >
                    <motion.div
                      key="falling-dart"
                      initial={
                        phase === "THROWN"
                          ? { y: -600, opacity: 0 } // 하늘 위에서 대기
                          : { y: 0, opacity: 1 }
                      }
                      animate={
                        phase === "THROWN"
                          ? { y: 0, opacity: 1, rotate: [0, -6, 6, -3, 3, 0] } // 떨어져서 꽂힌 후 타격감 진동
                          : {}
                      }
                      transition={{
                        y: { duration: 0.35, ease: "easeOut" },
                        rotate: { delay: 0.35, duration: 0.1, ease: "linear" }, // 꽂힌 직후 진동
                      }}
                      style={{
                        position: "relative",
                        width: "0px",
                        height: "0px",
                        pointerEvents: "none",
                        transformOrigin: "0px 0px", // 회전축을 마커 바닥(0,0)으로 고정
                      }}
                    >
                      <img
                        src="/dart.png"
                        alt="다트"
                        style={{
                          position: "absolute",
                          width: "80px",
                          // 🎯 이제 -238px 같은 억지 계산이 필요 없습니다!
                          // CustomOverlayMap의 (0,0)은 곧 지도의 '마커 끝점'입니다.
                          // 다트 이미지의 왼쪽 아래를 (0,0)에 맞추기만 하면 지역 상관없이 100% 영구 고정됩니다.
                          bottom: "-2px", // 필요 시 -5px ~ 5px 사이로 미세 조절
                          left: "10px", // 기존에 찾으신 최적의 좌우 오프셋
                          filter: "drop-shadow(5px 10px 10px rgba(0,0,0,0.4))",
                        }}
                      />
                    </motion.div>
                  </CustomOverlayMap>
                </>
              )}
            </Map>
            {/* 탐색 중 오버레이 */}
            {phase === "SEARCHING" && (
              <motion.div
                key="shooting-up"
                // 당겼던 위치(releasePos)와 각도를 그대로 물려받아 출발
                initial={{
                  x: releasePos.x,
                  y: releasePos.y,
                  scale: 1,
                  rotate: dragAngle,
                }}
                animate={{
                  x: -releasePos.x * 2,
                  y: -800,
                  scale: 0.5,
                  opacity: 0,
                }} // 화면 밖으로 날려보냄
                transition={{ duration: 0.4, ease: "easeIn" }}
                style={{
                  position: "absolute",
                  bottom: "80px",
                  left: "50%",
                  marginLeft: "-40px",
                  zIndex: 30,
                  pointerEvents: "none",
                  transformOrigin: "bottom left",
                }}
              >
                <img
                  src="/dart.png"
                  alt="다트"
                  style={{
                    width: "80px",
                    filter: "drop-shadow(5px 10px 10px rgba(0,0,0,0.4))",
                  }}
                />
              </motion.div>
            )}
            {/* 2. 당기기 조준 UI (AIMING 상태) */}
            {phase === "AIMING" && (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  position: "absolute",
                  bottom: "30px",
                  left: "0",
                  width: "100%",
                  zIndex: 20,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.9)",
                    padding: "8px 16px",
                    borderRadius: "20px",
                    marginBottom: "15px",
                    fontSize: "14px",
                    fontWeight: "bold",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                  }}
                >
                  👇 다트를 아래로 쭈욱 당겼다 놓으세요!
                </div>
                <motion.div
                  drag
                  dragConstraints={{
                    top: 0,
                    bottom: 180,
                    left: -150,
                    right: 150,
                  }}
                  dragElastic={0.2}
                  onDrag={(event, info) => {
                    const angle =
                      Math.atan2(-info.offset.x, info.offset.y) *
                      (180 / Math.PI);
                    // 🎯 원본(왼쪽 아래) 이미지가 당기는 방향(위쪽)을 보게 하려면 135도 더해줌
                    setDragAngle(angle + 135);
                  }}
                  onDragEnd={(event, info) => {
                    if (info.offset.y > 60) {
                      setReleasePos({ x: info.offset.x, y: info.offset.y });
                      handleThrowDart();
                    } else {
                      setDragAngle(135); // 취소 시 다시 기본 조준(위쪽) 방향으로
                    }
                  }}
                  animate={{ rotate: dragAngle || 135 }}
                  whileTap={{ cursor: "grabbing", scale: 0.95 }}
                  style={{ cursor: "grab", touchAction: "none" }}
                >
                  <img
                    src="/dart.png"
                    alt="다트"
                    draggable={false}
                    style={{
                      width: "80px",
                      filter: "drop-shadow(0 10px 10px rgba(0,0,0,0.3))",
                      pointerEvents: "none",
                      // 🎯 기존 transform: "rotate(135deg)" 삭제 (motion에서 전부 제어)
                    }}
                  />
                </motion.div>
              </motion.div>
            )}
          </div>

          {/* 결과 정보 및 주변 장소 탭 (RESULT 상태) */}
          {phase === "RESULT" && result && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              style={{ padding: "30px" }}
            >
              <span
                style={{
                  backgroundColor: "#e6f2ff",
                  color: "#007BFF",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                당첨 🎉
              </span>
              <h3
                style={{
                  fontSize: "28px",
                  fontWeight: "800",
                  color: "#1a1a1a",
                  margin: "15px 0",
                }}
              >
                {result.region1} {result.region2}
              </h3>
              {weather && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    marginTop: "5px",
                    backgroundColor: "#f1f3f5",
                    padding: "4px 12px",
                    borderRadius: "16px",
                    fontSize: "14px",
                    color: "#333",
                  }}
                >
                  <img
                    src={`https://openweathermap.org/img/wn/${weather.icon}.png`}
                    alt="날씨 아이콘"
                    style={{ width: "24px", height: "24px" }}
                  />
                  <strong>{weather.temp}°C</strong>
                  <span style={{ color: "#666" }}>{weather.description}</span>
                </div>
              )}
              <div style={{ marginTop: "25px", textAlign: "left" }}>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginBottom: "15px",
                    backgroundColor: "#f1f3f5",
                    padding: "6px",
                    borderRadius: "12px",
                  }}
                >
                  {[
                    { id: "AT4", label: "📸 명소" },
                    { id: "FD6", label: "🍽️ 맛집" },
                    { id: "AD5", label: "🛌 숙소" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as Category)}
                      style={{
                        flex: 1,
                        padding: "8px 0",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontWeight: "bold",
                        fontSize: "14px",
                        transition: "all 0.2s",
                        backgroundColor:
                          activeTab === tab.id ? "#ffffff" : "transparent",
                        color: activeTab === tab.id ? "#007BFF" : "#666",
                        boxShadow:
                          activeTab === tab.id
                            ? "0 2px 4px rgba(0,0,0,0.05)"
                            : "none",
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* 탭 리스트 콘텐츠 */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    {/* 🎯 숙소(AD5) 탭일 때만 등장하는 서브 필터 버튼 */}
                    {activeTab === "AD5" && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap", // 버튼이 넘치면 줄바꿈
                          gap: "6px",
                          marginBottom: "5px",
                        }}
                      >
                        {[
                          { id: "ALL", label: "전체" },
                          { id: "HOTEL", label: "🏨 호텔/리조트" },
                          { id: "PENSION", label: "🏕️ 펜션/풀빌라" },
                          { id: "MOTEL", label: "🏩 모텔/게하" }, // 🎯 추가된 버튼
                        ].map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setAccomFilter(f.id as any)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "20px",
                              border:
                                accomFilter === f.id
                                  ? "1px solid #007BFF"
                                  : "1px solid #ddd",
                              backgroundColor:
                                accomFilter === f.id ? "#e6f2ff" : "#fff",
                              color: accomFilter === f.id ? "#007BFF" : "#666",
                              fontSize: "12px",
                              fontWeight: "bold",
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 🎯 필터링 및 리스트 렌더링 즉시 실행 함수 */}
                    {(() => {
                      let displayPlaces = placesData[activeTab];

                      if (activeTab === "AD5") {
                        // 🎯 1차 블랙리스트 원천 차단 로직 삭제: '전체' 탭에서는 모든 숙소가 보입니다.

                        if (accomFilter === "HOTEL") {
                          displayPlaces = displayPlaces.filter((p) => {
                            const cat = p.category_name || "";
                            const name = p.place_name || "";
                            return (
                              cat.includes("호텔") ||
                              cat.includes("리조트") ||
                              cat.includes("콘도") ||
                              name.includes("호텔") ||
                              name.includes("리조트") ||
                              name.includes("스테이") ||
                              name.includes("파크하얏트")
                            );
                          });
                        } else if (accomFilter === "PENSION") {
                          displayPlaces = displayPlaces.filter((p) => {
                            const cat = p.category_name || "";
                            const name = p.place_name || "";
                            return (
                              cat.includes("펜션") ||
                              cat.includes("캠핑") ||
                              name.includes("펜션") ||
                              name.includes("풀빌라") ||
                              name.includes("글램핑")
                            );
                          });
                        } else if (accomFilter === "MOTEL") {
                          // 🎯 새로 추가된 가성비 숙소(모텔, 여관, 게하, 민박) 분류 로직
                          displayPlaces = displayPlaces.filter((p) => {
                            const cat = p.category_name || "";
                            const name = p.place_name || "";
                            return (
                              cat.includes("모텔") ||
                              cat.includes("여관") ||
                              cat.includes("게스트하우스") ||
                              cat.includes("민박") ||
                              name.includes("모텔") ||
                              name.includes("무인텔") ||
                              name.includes("여관") ||
                              name.includes("게스트하우스")
                            );
                          });
                        }
                      }

                      return displayPlaces.length > 0 ? (
                        displayPlaces.map((place) => (
                          <div
                            key={place.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "15px",
                              backgroundColor: "#f8f9fa",
                              borderRadius: "12px",
                              border: "1px solid #eee",
                            }}
                          >
                            <div style={{ textAlign: "left" }}>
                              <a
                                href={`https://place.map.kakao.com/${place.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ textDecoration: "none" }}
                              >
                                <strong
                                  style={{
                                    fontSize: "15px",
                                    color: "#1a1a1a",
                                    display: "block",
                                    marginBottom: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  {place.place_name}{" "}
                                  <span
                                    style={{ fontSize: "12px", color: "#888" }}
                                  >
                                    🔗
                                  </span>
                                </strong>
                              </a>
                              <span
                                style={{
                                  color: "#007BFF",
                                  fontSize: "12px",
                                  fontWeight: "bold",
                                }}
                              >
                                {place.distance}m
                              </span>
                            </div>
                            <button
                              onClick={() => startKakaoNavi(place)}
                              style={{
                                backgroundColor: "#1877F2",
                                color: "white",
                                border: "none",
                                padding: "8px 14px",
                                borderRadius: "8px",
                                fontSize: "13px",
                                fontWeight: "bold",
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                            >
                              🚗 길안내
                            </button>
                          </div>
                        ))
                      ) : (
                        <p
                          style={{
                            textAlign: "center",
                            color: "#999",
                            padding: "20px 0",
                            fontSize: "14px",
                          }}
                        >
                          해당 조건에 맞는 주변 장소가 없습니다.
                        </p>
                      );
                    })()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* 하단 공유 및 다시 던지기 버튼 (고정 바) */}
      {phase === "RESULT" && (
        <motion.div
          // 🎯 핵심 수정: CSS transform 대신 Framer Motion의 초기/애니메이션 값에 x축 -50%를 직접 주입합니다.
          initial={{ opacity: 0, y: 50, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          transition={{ delay: 0.3 }}
          style={{
            position: "fixed",
            bottom: 0,
            left: "50%",
            // transform: "translateX(-50%)", 👈 이 줄은 완전히 삭제하세요!
            width: "100%",
            maxWidth: "500px",
            padding: "16px 20px 24px",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(10px)",
            borderTop: "1px solid #eee",
            boxShadow: "0 -4px 15px rgba(0,0,0,0.05)",
            display: "flex",
            gap: "10px",
            flexDirection: "column",
            zIndex: 100,
            boxSizing: "border-box",
          }}
        >
          <button
            onClick={shareToKakao}
            style={{
              padding: "16px",
              fontSize: "16px",
              backgroundColor: "#FEE500",
              color: "#191919",
              border: "none",
              borderRadius: "16px",
              fontWeight: "bold",
              cursor: "pointer",
              boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
            }}
          >
            💬 카카오톡으로 결과 공유하기
          </button>
          <button
            onClick={() => {
              setPhase("IDLE");
              setResult(null);
            }}
            style={{
              padding: "16px",
              fontSize: "16px",
              backgroundColor: "#ffffff",
              color: "#333",
              border: "1px solid #ddd",
              borderRadius: "16px",
              fontWeight: "bold",
              cursor: "pointer",
              boxShadow: "0 4px 6px rgba(0,0,0,0.02)",
            }}
          >
            🔄 다시 던지기
          </button>
        </motion.div>
      )}
    </div>
  );
}

export default App;
