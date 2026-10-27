'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [scannerStatusText, setScannerStatusText] = useState(
    'Position face within camera oval to record event.'
  );

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
      setScannerStatusText('Camera active. Ready for biometric scan.');
    } catch (e) {
      alert('Camera access denied or unavailable: ' + e.message);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setScannerStatusText('Camera stopped.');
  }, []);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const captureBurstAndPrimary = useCallback(async (onProgress) => {
    if (!streamRef.current || !videoRef.current) {
      alert("Camera is not active. Please click 'Start Camera' first to enable your video feed.");
      return null;
    }

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    const livenessFrames = [];
    const totalFrames = 4;

    for (let i = 1; i <= totalFrames; i++) {
      if (onProgress) {
        onProgress(Math.round((i / totalFrames) * 100));
      }
      if (streamRef.current) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        livenessFrames.push(canvas.toDataURL('image/jpeg', 0.85));
      }
      await new Promise((r) => setTimeout(r, 220));
    }

    let primaryPhoto = null;
    if (streamRef.current) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      primaryPhoto = canvas.toDataURL('image/jpeg', 0.9);
    }

    return { livenessFrames, primaryPhoto };
  }, []);

  return {
    videoRef,
    isCameraActive,
    scannerStatusText,
    setScannerStatusText,
    startCamera,
    stopCamera,
    captureBurstAndPrimary,
  };
}

export default useCamera;
