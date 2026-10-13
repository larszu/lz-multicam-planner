import { describe, expect, it } from 'vitest';
import { timecodeOfDay } from '../components/Multiview/timecode';
import { useStore } from '../store/useStore';

describe('multiview', () => {
  it('formats the time of day as HH:MM:SS:FF at 25 fps', () => {
    expect(timecodeOfDay(new Date(2026, 9, 13, 9, 5, 7, 960))).toBe('09:05:07:24');
  });

  it('drops the program source when its camera is removed', () => {
    useStore.getState().addCamera();
    const id = useStore.getState().selectedCameraId!;
    useStore.getState().setProgramCamera(id);
    useStore.getState().removeCamera(id);
    expect(useStore.getState().programCameraId).toBeNull();
  });
});
