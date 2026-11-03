import { useEffect, useState } from 'react';
import { speechController, type PlayerState } from '../lib/tts/controller';

/** 订阅朗读控制器状态 */
export function usePlayerState(): PlayerState {
  const [state, setState] = useState<PlayerState>(() => speechController.getState());
  useEffect(() => speechController.subscribe(setState), []);
  return state;
}
