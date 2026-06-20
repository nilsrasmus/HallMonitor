import { useCallback, useState } from "react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const STEP = 0.25;

export function useDigitalZoom() {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, ox: 0, oy: 0 });

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_ZOOM, s + STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(MIN_ZOOM, s - STEP);
      if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (scale <= 1) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y });
    },
    [scale, offset]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setOffset({
        x: dragStart.ox + (e.clientX - dragStart.x),
        y: dragStart.oy + (e.clientY - dragStart.y),
      });
    },
    [dragging, dragStart]
  );

  const onPointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const transform = `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`;

  return {
    scale,
    transform,
    zoomIn,
    zoomOut,
    reset,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    canPan: scale > 1,
  };
}
