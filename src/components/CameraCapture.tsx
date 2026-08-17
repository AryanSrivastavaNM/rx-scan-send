import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CameraCaptureProps = {
  open: boolean;
  onClose: () => void;
  /** Called with the captured frame as a File — same shape a <input
   * type="file"> change event hands over, so the caller can pass it straight
   * into its existing upload/OCR handler without knowing this is a camera
   * capture under the hood. */
  onCapture: (file: File) => void;
};

/** "Take a photo" for the prescription upload flow, via a live
 * getUserMedia() preview — not a file-picker with the `capture` attribute,
 * which desktop browsers ignore and fall back to a plain file picker for
 * (the bug this component fixes). Knows nothing about uploading, OCR, or
 * Qwen — it only ever hands the caller a File via onCapture(). */
export function CameraCapture({ open, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  // Start the camera whenever the dialog opens; always stop every track when
  // it closes, on capture, or on unmount — required so the browser's camera
  // indicator actually turns off.
  useEffect(() => {
    if (!open) return;

    setError(null);
    setReady(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        'Camera capture isn\'t supported in this browser. Please use "Upload PDF or image" instead.',
      );
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        // "ideal", not "exact" — prefers the rear camera on phones but still
        // falls back to whatever camera is available (e.g. a laptop webcam)
        // instead of hard-failing when there's no environment-facing camera.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError(
            'Camera access was denied. Please allow camera access, or use "Upload PDF or image" instead.',
          );
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setError('No camera was found on this device. Please use "Upload PDF or image" instead.');
        } else if (name === "NotReadableError" || name === "TrackStartError") {
          setError(
            'The camera is unavailable right now (it may be in use by another app). Please use "Upload PDF or image" instead.',
          );
        } else {
          setError('Could not access the camera. Please use "Upload PDF or image" instead.');
        }
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open]);

  const handleClose = () => {
    stopStream();
    onClose();
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `prescription-${Date.now()}.jpg`, { type: "image/jpeg" });
        stopStream();
        onCapture(file);
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
          <DialogDescription>Line up the prescription in frame, then capture.</DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="space-y-4">
            <p className="rounded-xl border-l-4 border-destructive bg-destructive/10 px-4 py-3 text-sm text-foreground">
              {error}
            </p>
            <Button variant="outline" className="w-full rounded-xl" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative aspect-3/4 w-full overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
              />
              {!ready ? (
                <div className="absolute inset-0 grid place-items-center text-sm text-white/80">
                  Starting camera…
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
              <Button variant="ghost" className="rounded-xl" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                className="h-12 rounded-xl text-base"
                onClick={handleCapture}
                disabled={!ready}
              >
                <Camera className="size-4" />
                Capture
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
