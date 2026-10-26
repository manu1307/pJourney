import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Map, MapMarker } from 'react-kakao-maps-sdk';
import html2canvas from 'html2canvas';
import confetti from 'canvas-confetti';
import { getValidDestination, DestinationSuccess } from './utils/getDestination';
import { getNearbyTouristSpots, Place } from './utils/getPlaces';

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY as string;

type Phase = 'IDLE' | 'SEARCHING' | 'MAP_REVEAL' | 'AIMING' | 'THROWN' | 'RESULT';

function App() {
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [result, setResult] = useState<DestinationSuccess | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY);
  }, []);

  useEffect(() => {
    if (phase === 'MAP_REVEAL') {
      const timer = setTimeout(() => setPhase('AIMING'), 500);
      return () => clearTimeout(timer);
    } 
    else if (phase === 'AIMING') {
      const timer = setTimeout(() => setPhase('THROWN'), 1500);
      return () => clearTimeout(timer);
    } 
    else if (phase === 'THROWN') {
      const timer = setTimeout(() => {
        setPhase('RESULT');
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#007BFF', '#FEE500', '#FF5722', '#4CAF50']
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const handleThrowDart = async () => {
    setPhase('SEARCHING');
    setResult(null);
    setPlaces([]);
    setError(null);

    try {
      const destination = await getValidDestination();
      setResult(destination);
      const spots = await getNearbyTouristSpots(destination.lat, destination.lng);
      setPlaces(spots);
      setPhase('MAP_REVEAL');
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      setPhase('IDLE');
    }
  };

  const shareToKakao = async () => {
    if (!captureRef.current || !result) return;
    try {
      const canvas = await html2canvas(captureRef.current, { useCORS: true });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'result.png', { type: 'image/png' });
        const uploadRes = await window.Kakao.Share.uploadImage({ file: [file] });
        window.Kakao.Share.sendDefault({
          objectType: 'feed',
          content: {
            title: '🎯 P의 여행 - 목적지 당첨!',
            description: `이번 여행지는 [${result.region1} ${result.region2}] 입니다!`,
            imageUrl: uploadRes.infos.original.url,
            link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
          },
          buttons: [{ title: '나도 다트 던지러 가기', link: { mobileWebUrl: window.location.href, webUrl: window.location.href } }],
        });
      }, 'image/png');
    } catch (err) {
      alert('공유하기에 실패했습니다.');
    }
  };

  return (
    <div style={{ 
        textAlign: 'center', 
        padding: '20px', // 모바일 환경을 고려해 30px -> 20px로 축소
        fontFamily: 'sans-serif', 
        width: '100%',   // 추가: 기기 가로폭에 100% 맞춤
        maxWidth: '500px', 
        margin: '0 auto' 
      }}>
      <motion.h1 initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
        🎯 P의 여행
      </motion.h1>

      {phase === 'IDLE' && (
        <button 
          onClick={handleThrowDart}
          style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '25px', fontWeight: 'bold', width: '100%' }}
        >
          다트 던지기
        </button>
      )}

      {phase === 'SEARCHING' && (
        <div style={{ marginTop: '50px', color: '#666' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ fontSize: '50px', marginBottom: '20px' }}>
            🧭
          </motion.div>
          <p>운명의 목적지 탐색 중...</p>
        </div>
      )}

      {error && <p style={{ color: 'red', marginTop: '20px' }}>🚨 {error}</p>}

      {result && phase !== 'IDLE' && phase !== 'SEARCHING' && (
        <div ref={captureRef} style={{ marginTop: '30px', padding: phase === 'RESULT' ? '30px' : '0', backgroundColor: phase === 'RESULT' ? '#f8f9fa' : 'transparent', borderRadius: '15px', transition: 'all 0.5s' }}>
          
          <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', boxShadow: phase === 'RESULT' ? '0 10px 20px rgba(0,0,0,0.1)' : 'none' }}>
            
            <Map 
              center={{ lat: result.lat, lng: result.lng }} 
              style={{ width: "100%", height: "300px" }} 
              level={phase === 'RESULT' ? 8 : 13} 
            >
              {/* 핀이 사라지지 않도록 명확하게 THROWN과 RESULT 단계 모두 렌더링되도록 수정 */}
              {(phase === 'THROWN' || phase === 'RESULT') && (
                <MapMarker position={{ lat: result.lat, lng: result.lng }} />
              )}
            </Map>

            {phase !== 'RESULT' && (
              <motion.div
                initial={{ x: 200, y: -200, scale: 2, opacity: 0, rotate: 45 }}
                animate={
                  phase === 'MAP_REVEAL' ? { x: 200, y: -200, opacity: 0 } :
                  phase === 'AIMING' ? { x: 100, y: -100, opacity: 1, rotate: 30 } :
                  phase === 'THROWN' ? { x: 0, y: -20, scale: 1, opacity: 1, rotate: 0 } : {}
                }
                transition={
                  phase === 'AIMING' ? { type: "spring", stiffness: 100, damping: 5 } :
                  phase === 'THROWN' ? { type: "spring", stiffness: 400, damping: 15 } : {}
                }
                style={{ 
                  position: 'absolute', top: '50%', left: '50%', 
                  marginLeft: '-30px', marginTop: '-30px',
                  fontSize: '60px', zIndex: 10, textShadow: '2px 5px 10px rgba(0,0,0,0.5)'
                }}
              >
                📍
              </motion.div>
            )}
          </div>

          {phase === 'RESULT' && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ marginTop: '20px' }}>
              <h2 style={{ margin: '0 0 10px 0' }}>🎉 당신의 여행지는!</h2>
              <h3 style={{ color: '#007BFF', fontSize: '32px', margin: '10px 0' }}>{result.region1} {result.region2}</h3>
              
              {places.length > 0 && (
                <div style={{ marginTop: '20px', textAlign: 'left' }}>
                  <h4>📍 추천 명소</h4>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {places.map((place) => (
                      <li key={place.id} style={{ marginBottom: '8px', padding: '10px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #ddd' }}>
                        <strong>{place.place_name}</strong> <span style={{ color: '#007BFF' }}>{place.distance}m</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}

      {phase === 'RESULT' && (
        <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexDirection: 'column' }}>
          <button onClick={shareToKakao} style={{ padding: '12px', fontSize: '16px', backgroundColor: '#FEE500', color: '#191919', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}>
            💬 카카오톡으로 결과 공유하기
          </button>
          <button onClick={() => setPhase('IDLE')} style={{ padding: '12px', fontSize: '16px', backgroundColor: '#eee', color: '#333', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}>
            🔄 다시 던지기
          </button>
        </div>
      )}
    </div>
  );
}

export default App;