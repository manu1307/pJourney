import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Map, MapMarker } from "react-kakao-maps-sdk";
import html2canvas from "html2canvas";
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

function App() {
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [result, setResult] = useState<DestinationSuccess | null>(null);

  // 탭 및 장소 상태
  const [activeTab, setActiveTab] = useState<Category>("AT4");
  const [placesData, setPlacesData] = useState<Record<Category, Place[]>>({
    AT4: [],
    FD6: [],
    AD5: [],
  });
  const [theme, setTheme] = useState<Theme>("ALL");

  // 도감(히스토리) 상태
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const captureRef = useRef<HTMLDivElement>(null);

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
    if (phase === "MAP_REVEAL") {
      const timer = setTimeout(() => setPhase("AIMING"), 500);
      return () => clearTimeout(timer);
    } else if (phase === "AIMING") {
      const timer = setTimeout(() => setPhase("THROWN"), 1500);
      return () => clearTimeout(timer);
    } else if (phase === "THROWN") {
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
            const updated = [newEntry, ...prev];
            localStorage.setItem("p_journey_history", JSON.stringify(updated));
            return updated;
          });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [phase, result]);

  const handleThrowDart = async () => {
    setPhase("SEARCHING");
    setResult(null);
    setPlacesData({ AT4: [], FD6: [], AD5: [] });
    setActiveTab("AT4");
    setError(null);

    try {
      const destination = await getValidDestination(theme);
      setResult(destination);

      // 명소(AT4), 맛집(FD6), 숙소(AD5) 데이터 동시 호출
      const [tour, food, hotel] = await Promise.all([
        getNearbyPlaces(destination.lat, destination.lng, "AT4"),
        getNearbyPlaces(destination.lat, destination.lng, "FD6"),
        getNearbyPlaces(destination.lat, destination.lng, "AD5"),
      ]);

      setPlacesData({ AT4: tour, FD6: food, AD5: hotel });
      setPhase("MAP_REVEAL");
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
            title: "🎯 P의 여행 - 목적지 당첨!",
            description: `이번 여행지는 [${result.region1} ${result.region2}] 입니다!`,
            imageUrl: uploadRes.infos.original.url,
            link: {
              mobileWebUrl: window.location.href,
              webUrl: window.location.href,
            },
          },
          buttons: [
            {
              title: "나도 다트 던지러 가기",
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

  return (
    <div
      style={{
        textAlign: "center",
        padding: "20px",
        fontFamily: "sans-serif",
        width: "100%",
        maxWidth: "500px",
        margin: "0 auto",
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

          {/* 4. IDLE 렌더링 블록 내부, <motion.button>(다트 던지기 버튼) 바로 위에 테마 선택 필터 추가 */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "20px",
              backgroundColor: "#f1f3f5",
              padding: "6px",
              borderRadius: "16px",
            }}
          >
            {[
              { id: "ALL", label: "🎲 전국" },
              { id: "SEA", label: "🌊 바다" },
              { id: "CITY", label: "🏙️ 수도권" },
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
            onClick={handleThrowDart}
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

          {/* 여행 도감 컬렉션 */}
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

      {phase === "SEARCHING" && (
        <div style={{ marginTop: "50px", color: "#666" }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            style={{ fontSize: "50px", marginBottom: "20px" }}
          >
            🧭
          </motion.div>
          <p>운명의 목적지 탐색 중...</p>
        </div>
      )}

      {error && <p style={{ color: "red", marginTop: "20px" }}>🚨 {error}</p>}

      {/* 결과창 영역 */}
      {result && phase !== "IDLE" && phase !== "SEARCHING" && (
        <div
          ref={captureRef}
          style={{
            marginTop: "20px",
            backgroundColor: phase === "RESULT" ? "#ffffff" : "transparent",
            borderRadius: "24px",
            boxShadow:
              phase === "RESULT" ? "0 20px 40px rgba(0,0,0,0.08)" : "none",
            overflow: "hidden",
            transition: "all 0.5s ease",
          }}
        >
          {/* 지도 및 애니메이션 영역 */}
          <div style={{ position: "relative", width: "100%", height: "300px" }}>
            <Map
              center={{ lat: result.lat, lng: result.lng }}
              style={{ width: "100%", height: "100%" }}
              level={phase === "RESULT" ? 8 : 13}
            >
              {(phase === "THROWN" || phase === "RESULT") && (
                <MapMarker position={{ lat: result.lat, lng: result.lng }} />
              )}
            </Map>
            {phase !== "RESULT" && (
              <motion.div
                initial={{ x: 200, y: -200, scale: 2, opacity: 0, rotate: 45 }}
                animate={
                  phase === "MAP_REVEAL"
                    ? { x: 200, y: -200, opacity: 0 }
                    : phase === "AIMING"
                      ? { x: 100, y: -100, opacity: 1, rotate: 30 }
                      : phase === "THROWN"
                        ? { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }
                        : {}
                }
                transition={
                  phase === "AIMING"
                    ? { type: "spring", stiffness: 100, damping: 5 }
                    : phase === "THROWN"
                      ? { type: "spring", stiffness: 400, damping: 15 }
                      : {}
                }
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  marginLeft: "0px",
                  marginTop: "-60px",
                  zIndex: 10,
                  pointerEvents: "none",
                }}
              >
                <img
                  src="/dart.png"
                  alt="다트"
                  style={{
                    width: "60px",
                    filter: "drop-shadow(5px 10px 10px rgba(0,0,0,0.4))",
                  }}
                />
              </motion.div>
            )}
          </div>

          {/* 결과 정보 및 주변 장소 탭 */}
          {phase === "RESULT" && (
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

              <div style={{ marginTop: "25px", textAlign: "left" }}>
                {/* 탭 네비게이션 */}
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
                    {placesData[activeTab].length > 0 ? (
                      placesData[activeTab].map((place) => (
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
                          <strong style={{ fontSize: "15px", color: "#333" }}>
                            {place.place_name}
                          </strong>
                          <span
                            style={{
                              backgroundColor: "#007BFF",
                              color: "white",
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: "bold",
                            }}
                          >
                            {place.distance}m
                          </span>
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
                        주변에 검색된 정보가 없습니다.
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* 하단 공유 및 다시 던지기 버튼 */}
      {phase === "RESULT" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{
            marginTop: "20px",
            display: "flex",
            gap: "10px",
            flexDirection: "column",
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
            onClick={() => setPhase("IDLE")}
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
