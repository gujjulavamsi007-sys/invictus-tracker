import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  ArrowLeft,
  ArrowUp,
  FileText,
  History,
  Mic,
  MicOff,
  Sparkles,
  Volume2,
  VolumeX
} from 'lucide-react';
import { answerApexQuestion, getApexGenerativeContext, APEX_STARTER_PROMPTS } from './apexAssistant.mjs';

type AssistantTab = 'reports' | 'trips';
type AssistantAction = { label: string; tab?: AssistantTab; command?: 'prepare-ai' };
type AssistantMessage = {
  id: number;
  role: 'assistant' | 'user';
  text: string;
  actions?: AssistantAction[];
};

type RobotPosition = { x: number; y: number };
type PetMood = 'happy' | 'dragging' | 'listening' | 'thinking' | 'speaking' | 'ready' | 'blocked' | 'sleep';
const APEX_ROBOT_POSITION_KEY = 'invictusApexAssistantPosition';
const APEX_ROBOT_POSITION_VERSION_KEY = 'invictusApexAssistantPositionVersion';
const APEX_ROBOT_WIDTH = 72;
const APEX_ROBOT_HEIGHT = 82;
const APEX_ROBOT_EDGE_GAP = 8;
const APEX_LISTENING_PREVIEW = import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('apexVoicePreview') === '1';

type ApexVoicePlugin = {
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  speak: (options: { text: string }) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  addListener: (
    eventName: 'speechResult' | 'speechError' | 'speechFinished',
    listener: (event: { text?: string; onDevice?: boolean; message?: string }) => void
  ) => Promise<{ remove: () => Promise<void> }>;
};

type ApexOnDeviceAiPlugin = {
  checkOnDeviceAi: () => Promise<{ status: 'available' | 'downloadable' | 'downloading' | 'unsupported' }>;
  prepareOnDeviceAi: () => Promise<{ status: 'ready' | 'downloading' | 'unsupported' }>;
  generateReply: (options: { question: string; conversation: string; tripContext: string }) => Promise<{ text: string }>;
};

const ApexVoice = registerPlugin<ApexVoicePlugin>('ApexAssistant');
const ApexOnDeviceAi = registerPlugin<ApexOnDeviceAiPlugin>('ApexOnDeviceAi');
let nextMessageId = 1;

function ApexVoiceWave({ compact = false }: { compact?: boolean }) {
  const heights = compact
    ? [7, 12, 17, 10, 20, 13, 8]
    : [7, 12, 18, 11, 22, 15, 26, 13, 20, 10, 24, 14, 8];

  return (
    <span className={`apex-voice-wave ${compact ? 'gap-[3px]' : 'gap-1'}`} aria-hidden="true">
      {heights.map((height, index) => (
        <span
          key={index}
          className="apex-voice-wave-bar"
          style={{ height: `${height}px`, animationDelay: `${index * -65}ms` }}
        />
      ))}
    </span>
  );
}

function ApexRobotFigure({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 80 88" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="apex-robot-shell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="38%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0e7490" />
        </linearGradient>
        <linearGradient id="apex-robot-body" x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#18364d" />
          <stop offset="100%" stopColor="#07111f" />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="83" rx="15" ry="2.5" fill="#22d3ee" opacity="0.32" />
      <rect x="16" y="27" width="7" height="16" rx="3.5" fill="#0e7490" stroke="#67e8f9" strokeWidth="1.5" />
      <rect x="57" y="27" width="7" height="16" rx="3.5" fill="#0e7490" stroke="#67e8f9" strokeWidth="1.5" />
      <rect x="20" y="15" width="40" height="38" rx="15" fill="url(#apex-robot-body)" stroke="url(#apex-robot-shell)" strokeWidth="2.3" />
      <rect x="25" y="21" width="30" height="25" rx="10" fill="#04101b" stroke="#164e63" strokeWidth="1" />
      <circle cx="33" cy="32" r="3.6" fill="#67e8f9" />
      <circle cx="47" cy="32" r="3.6" fill="#67e8f9" />
      <circle cx="34" cy="31" r="1.2" fill="#e0fcff" />
      <circle cx="48" cy="31" r="1.2" fill="#e0fcff" />
      <path d="M34 39Q40 47 46 39" fill="none" stroke="#22d3ee" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M28 55C25.5 57 23.4 60 21.5 62.5" fill="none" stroke="#67e8f9" strokeWidth="4" strokeLinecap="round" />
      <path d="M52 55C54.5 57 56.6 60 58.5 62.5" fill="none" stroke="#67e8f9" strokeWidth="4" strokeLinecap="round" />
      <rect x="27" y="51" width="26" height="25" rx="10" fill="url(#apex-robot-body)" stroke="url(#apex-robot-shell)" strokeWidth="2" />
      <path d="M32 66L40 57L48 66H44L40 62L36 66H32Z" fill="#67e8f9" />
      <path d="M33 72H47" stroke="#155e75" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ApexMiniRobot({ className, mood }: { className: string; mood: PetMood }) {
  return (
    <svg viewBox="0 0 80 94" aria-hidden="true" className={className} data-mood={mood}>
      <defs>
        <linearGradient id="apex-mini-shell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#72eaff" />
          <stop offset="48%" stopColor="#19aaff" />
          <stop offset="100%" stopColor="#1762db" />
        </linearGradient>
        <linearGradient id="apex-mini-body" x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#28c9ff" />
          <stop offset="100%" stopColor="#1269db" />
        </linearGradient>
        <filter id="apex-mini-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="apex-mini-ground-glow" x="-35%" y="-160%" width="170%" height="420%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
      </defs>
      <ellipse cx="40" cy="85" rx="19" ry="2.1" fill="#11d8f2" opacity="0.48" filter="url(#apex-mini-ground-glow)" />
      <ellipse cx="40" cy="85.8" rx="12" ry="1" fill="#061725" opacity="0.58" />
      <g className="apex-mini-headphones" fill="url(#apex-mini-body)" stroke="#8eefff" strokeWidth="2">
        <circle cx="19" cy="36" r="8" />
        <circle cx="61" cy="36" r="8" />
        <circle cx="19" cy="36" r="3" fill="#0a518f" stroke="#58dfff" strokeWidth="1.4" />
        <circle cx="61" cy="36" r="3" fill="#0a518f" stroke="#58dfff" strokeWidth="1.4" />
      </g>
      <rect x="18" y="13" width="44" height="45" rx="17" fill="url(#apex-mini-shell)" stroke="#a4f5ff" strokeWidth="1.8" />
      <path d="M25 17Q40 10 55 17" fill="none" stroke="#d5fbff" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <rect className="apex-mini-face-screen" x="23" y="19" width="34" height="31" rx="12" fill="#082047" stroke="#73e8ff" strokeWidth="1.4" />
      <g className="apex-mini-eyes-normal" filter="url(#apex-mini-glow)">
        <circle cx="33" cy="31" r="4.2" fill="#6cecff" />
        <circle cx="47" cy="31" r="4.2" fill="#6cecff" />
        <circle cx="34" cy="29.5" r="1.35" fill="#e6fdff" />
        <circle cx="48" cy="29.5" r="1.35" fill="#e6fdff" />
      </g>
      <g className="apex-mini-eyes-thinking" filter="url(#apex-mini-glow)">
        <circle cx="33" cy="30" r="4.2" fill="#6cecff" />
        <circle cx="47" cy="30" r="4.2" fill="#6cecff" />
        <circle cx="34" cy="27.5" r="1.4" fill="#e6fdff" />
        <circle cx="48" cy="27.5" r="1.4" fill="#e6fdff" />
      </g>
      <g className="apex-mini-eyes-victory" fill="none" stroke="#a7f6ff" strokeWidth="2.8" strokeLinecap="round" filter="url(#apex-mini-glow)">
        <path d="M29 32Q33 26 37 32" />
        <path d="M43 32Q47 26 51 32" />
      </g>
      <g className="apex-mini-eyes-sleep" fill="none" stroke="#80ddf2" strokeWidth="2.4" strokeLinecap="round">
        <path d="M29 32H37M43 32H51" />
      </g>
      <path className="apex-mini-mouth-smile" d="M34 42Q40 48 46 42" fill="none" stroke="#6ce6ff" strokeWidth="2.2" strokeLinecap="round" />
      <path className="apex-mini-mouth-open" d="M35 41Q40 38 45 41Q45 47 40 47Q35 47 35 41Z" fill="#43dfff" stroke="#b5f8ff" strokeWidth="1.2" />
      <path className="apex-mini-mouth-think" d="M38 44H44" fill="none" stroke="#b5f8ff" strokeWidth="2" strokeLinecap="round" />
      <path className="apex-mini-mouth-frown" d="M35 45Q40 39 45 45" fill="none" stroke="#9cefff" strokeWidth="2" strokeLinecap="round" />
      <g className="apex-mini-mouth-audio" fill="none" stroke="#adf8ff" strokeWidth="1.8" strokeLinecap="round">
        <path className="apex-mini-audio-bar" d="M31 42V45" />
        <path className="apex-mini-audio-bar" d="M35 40V47" />
        <path className="apex-mini-audio-bar" d="M39 42V45" />
        <path className="apex-mini-audio-bar" d="M43 39V48" />
        <path className="apex-mini-audio-bar" d="M47 42V45" />
      </g>
      <g className="apex-mini-loading" fill="#b7faff" filter="url(#apex-mini-glow)">
        <circle className="apex-mini-loading-dot apex-mini-loading-dot-one" cx="34" cy="42" r="1.7" />
        <circle className="apex-mini-loading-dot apex-mini-loading-dot-two" cx="40" cy="42" r="1.7" />
        <circle className="apex-mini-loading-dot apex-mini-loading-dot-three" cx="46" cy="42" r="1.7" />
      </g>
      <g className="apex-mini-left-arm">
        <path d="M25 58Q20 62 19 68" fill="none" stroke="#72eaff" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="18" cy="69" r="3" fill="#25b7f6" stroke="#a4f5ff" strokeWidth="1.2" />
      </g>
      <g className="apex-mini-wave">
        <path d="M57 58Q62 60 64 64" fill="none" stroke="#72eaff" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M64 63L64 56M64 57L61 53M64 57L67 53M64 57L64 51" fill="none" stroke="#a4f5ff" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g className="apex-mini-rest-arm">
        <path d="M55 58Q60 62 61 68" fill="none" stroke="#72eaff" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="62" cy="69" r="3" fill="#25b7f6" stroke="#a4f5ff" strokeWidth="1.2" />
      </g>
      <rect x="28" y="56" width="24" height="25" rx="9" fill="url(#apex-mini-body)" stroke="#8aeeff" strokeWidth="1.8" />
      <rect x="34" y="62" width="12" height="12" rx="3" fill="#0a4f9e" opacity="0.75" />
      <path d="M35 71L40 65L45 71" fill="none" stroke="#a4f5ff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type ApexAssistantProps = {
  trips: any[];
  hidden?: boolean;
  onNavigate: (tab: AssistantTab) => void;
};

export default function ApexAssistant({ trips, hidden = false, onNavigate }: ApexAssistantProps) {
  const [isOpen, setIsOpen] = useState(APEX_LISTENING_PREVIEW);
  const [robotPosition, setRobotPosition] = useState<RobotPosition | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(APEX_ROBOT_POSITION_KEY) || 'null');
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
        const savedPositionVersion = localStorage.getItem(APEX_ROBOT_POSITION_VERSION_KEY);
        const position = {
          x: Math.max(APEX_ROBOT_EDGE_GAP, Math.min(saved.x + (savedPositionVersion === '2' ? 31 : 0), window.innerWidth - APEX_ROBOT_WIDTH - APEX_ROBOT_EDGE_GAP)),
          y: Math.max(APEX_ROBOT_EDGE_GAP, Math.min(saved.y, window.innerHeight - APEX_ROBOT_HEIGHT - APEX_ROBOT_EDGE_GAP))
        };
        if (savedPositionVersion !== '3') {
          try {
            localStorage.setItem(APEX_ROBOT_POSITION_KEY, JSON.stringify(position));
            localStorage.setItem(APEX_ROBOT_POSITION_VERSION_KEY, '3');
          } catch {
            // The previous position can still be used when storage is read-only.
          }
        }
        return position;
      }
    } catch {
      // Use the default corner position when there is no valid saved placement.
    }
    return null;
  });
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [voiceState, setVoiceState] = useState<'idle' | 'listening'>(APEX_LISTENING_PREVIEW ? 'listening' : 'idle');
  const [voiceError, setVoiceError] = useState('');
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [petMotion, setPetMotion] = useState<PetMood>('sleep');
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
    lastPosition: RobotPosition | null;
  } | null>(null);
  const suppressRobotClickRef = useRef(false);
  const petMotionTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const voiceListenersRef = useRef<Array<{ remove: () => Promise<void> }>>([]);
  const petMood: PetMood = voiceState === 'listening'
    ? 'listening'
    : speakingId !== null
      ? 'speaking'
      : petMotion;

  const clearPetMotionTimer = () => {
    if (petMotionTimerRef.current !== null) {
      window.clearTimeout(petMotionTimerRef.current);
      petMotionTimerRef.current = null;
    }
  };

  const showPetMotion = (mood: PetMood, duration = 1500) => {
    clearPetMotionTimer();
    setPetMotion(mood);
    if (duration > 0) {
      petMotionTimerRef.current = window.setTimeout(() => {
        setPetMotion(current => current === mood ? 'sleep' : current);
        petMotionTimerRef.current = null;
      }, duration);
    }
  };

  useEffect(() => {
    if (!isOpen || !messages.length || !messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [isOpen, messages, voiceState]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let listenerHandle: { remove: () => Promise<void> } | undefined;
    void ApexVoice.addListener('speechFinished', () => {
      setSpeakingId(null);
      showPetMotion('ready', 1600);
    })
      .then(handle => { listenerHandle = handle; })
      .catch(() => undefined);
    return () => { void listenerHandle?.remove(); };
  }, []);

  useEffect(() => {
    const clampRobot = (position: RobotPosition): RobotPosition => ({
      x: Math.max(APEX_ROBOT_EDGE_GAP, Math.min(position.x, window.innerWidth - APEX_ROBOT_WIDTH - APEX_ROBOT_EDGE_GAP)),
      y: Math.max(APEX_ROBOT_EDGE_GAP, Math.min(position.y, window.innerHeight - APEX_ROBOT_HEIGHT - APEX_ROBOT_EDGE_GAP))
    });
    const keepRobotOnScreen = () => {
      setRobotPosition(previous => {
        if (!previous) return previous;
        const next = clampRobot(previous);
        try {
          localStorage.setItem(APEX_ROBOT_POSITION_KEY, JSON.stringify(next));
          localStorage.setItem(APEX_ROBOT_POSITION_VERSION_KEY, '3');
        } catch {
          // Repositioning still works when browser storage is unavailable.
        }
        return next;
      });
    };
    window.addEventListener('resize', keepRobotOnScreen);
    return () => window.removeEventListener('resize', keepRobotOnScreen);
  }, []);

  useEffect(() => () => {
    clearPetMotionTimer();
    recognitionRef.current?.stop?.();
    voiceListenersRef.current.forEach(listener => { void listener.remove(); });
    if (Capacitor.getPlatform() === 'android') {
      void ApexVoice.stopListening().catch(() => undefined);
      void ApexVoice.stopSpeaking().catch(() => undefined);
    } else if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
  }, []);

  const clearVoiceListeners = () => {
    voiceListenersRef.current.forEach(listener => { void listener.remove(); });
    voiceListenersRef.current = [];
  };

  const submitQuestion = (value: string) => {
    const question = value.trim();
    if (!question) return;
    showPetMotion('thinking', 0);
    const userMessage: AssistantMessage = { id: nextMessageId++, role: 'user', text: question };
    const conversation = messages.slice(-8).map(message => ({ role: message.role, text: message.text }));
    const answer = answerApexQuestion(question, trips, { history: conversation });
    const replyId = nextMessageId++;
    const assistantMessage: AssistantMessage = {
      id: replyId,
      role: 'assistant',
      text: answer.requiresGenerativeAI ? 'Checking for on-device AI…' : answer.text,
      actions: answer.actions
    };
    setMessages(previous => [...previous, userMessage, assistantMessage]);
    setDraft('');
    setVoiceError('');

    if (!answer.requiresGenerativeAI) {
      showPetMotion('ready', 1800);
      return;
    }
    const replaceReply = (text: string, actions = answer.actions) => {
      setMessages(previous => previous.map(message => message.id === replyId ? { ...message, text, actions } : message));
      const stillWorking = /^(Checking for on-device AI|Thinking on this device|Preparing APEX)/i.test(text);
      showPetMotion(stillWorking ? 'thinking' : 'ready', stillWorking ? 0 : 1800);
    };
    const fallback = answer.fallbackText || answer.text;
    if (Capacitor.getPlatform() !== 'android') {
      replaceReply(fallback);
      return;
    }

    void ApexOnDeviceAi.checkOnDeviceAi().then(async ({ status }) => {
      if (status === 'downloadable') {
        replaceReply('This phone can run APEX’s AI privately on-device. Its model needs a one-time download; choose Prepare AI when you’re ready.', [
          ...(answer.actions || []),
          { label: 'Prepare AI', command: 'prepare-ai' }
        ]);
        return;
      }
      if (status === 'downloading') {
        replaceReply('APEX’s on-device AI model is still downloading. Please try your question again when it is ready.');
        return;
      }
      if (status !== 'available') {
        replaceReply(fallback);
        return;
      }

      replaceReply('Thinking on this device…', []);
      const historyText = conversation.map(message => (message.role === 'user' ? 'You: ' : 'APEX: ') + message.text).join('\n');
      const tripContext = buildTripContext(trips);
      try {
        const result = await ApexOnDeviceAi.generateReply({ question, conversation: historyText, tripContext });
        replaceReply(result.text || fallback, answer.actions);
      } catch {
        replaceReply(fallback, answer.actions);
      }
    }).catch(() => replaceReply(fallback));
  };

  const buildTripContext = (savedTrips: any[]) => {
    return getApexGenerativeContext(savedTrips);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitQuestion(draft);
  };

  const startVoiceInput = async () => {
    setVoiceError('');
    setVoiceState('listening');
    showPetMotion('listening', 0);
    if (Capacitor.getPlatform() === 'android') {
      try {
        clearVoiceListeners();
        const resultListener = await ApexVoice.addListener('speechResult', event => {
          const recognizedText = String(event.text || '').trim();
          if (recognizedText) setDraft(current => current ? current + ' ' + recognizedText : recognizedText);
          setVoiceState('idle');
          showPetMotion('happy', 1200);
          clearVoiceListeners();
        });
        const errorListener = await ApexVoice.addListener('speechError', event => {
          setVoiceError(event.message || 'Voice input could not be started. You can type your question instead.');
          setVoiceState('idle');
          showPetMotion('blocked', 1800);
          clearVoiceListeners();
        });
        voiceListenersRef.current = [resultListener, errorListener];
        await ApexVoice.startListening();
      } catch (error: any) {
        clearVoiceListeners();
        setVoiceState('idle');
        setVoiceError(error?.message || 'Microphone access was not available. You can type your question instead.');
        showPetMotion('blocked', 1800);
      }
      return;
    }

    const browserWindow = window as typeof window & {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceState('idle');
      setVoiceError('Voice input is not available in this browser. You can type your question instead.');
      showPetMotion('blocked', 1800);
      return;
    }

    try {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event: any) => {
        const recognizedText = String(event.results?.[0]?.[0]?.transcript || '').trim();
        if (recognizedText) setDraft(current => current ? current + ' ' + recognizedText : recognizedText);
        if (recognizedText) showPetMotion('happy', 1200);
      };
      recognition.onerror = () => {
        setVoiceError('Voice input stopped. You can type your question instead.');
        showPetMotion('blocked', 1800);
      };
      recognition.onend = () => {
        setVoiceState('idle');
        setPetMotion(current => current === 'listening' ? 'sleep' : current);
      };
      recognition.start();
    } catch {
      setVoiceState('idle');
      setVoiceError('Voice input could not be started. You can type your question instead.');
      showPetMotion('blocked', 1800);
    }
  };

  const stopVoiceInput = async () => {
    recognitionRef.current?.stop?.();
    if (Capacitor.getPlatform() === 'android') {
      try {
        await ApexVoice.stopListening();
      } catch {
        // The recognition session may already have ended.
      }
      clearVoiceListeners();
    }
    setVoiceState('idle');
    showPetMotion('ready', 1200);
  };

  const speakMessage = async (message: AssistantMessage) => {
    if (speakingId === message.id) {
      if (Capacitor.getPlatform() === 'android') await ApexVoice.stopSpeaking().catch(() => undefined);
      else window.speechSynthesis?.cancel();
      setSpeakingId(null);
      showPetMotion('ready', 1200);
      return;
    }

    setVoiceError('');
    if (Capacitor.getPlatform() === 'android') {
      try {
        setSpeakingId(message.id);
        await ApexVoice.speak({ text: message.text });
      } catch {
        setSpeakingId(null);
        setVoiceError('Spoken replies are not available right now.');
        showPetMotion('blocked', 1800);
      }
      return;
    }

    if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      setVoiceError('Spoken replies are not available in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.text);
    utterance.lang = 'en-IN';
    utterance.onstart = () => setSpeakingId(message.id);
    utterance.onend = () => {
      setSpeakingId(null);
      showPetMotion('ready', 1600);
    };
    utterance.onerror = () => {
      setSpeakingId(null);
      setVoiceError('Spoken replies stopped. The text answer is still available above.');
      showPetMotion('blocked', 1800);
    };
    window.speechSynthesis.speak(utterance);
  };

  const handleAction = (action: AssistantAction, sourceMessageId?: number) => {
    if (action.command === 'prepare-ai') {
      showPetMotion('thinking', 0);
      const replyId = sourceMessageId;
      if (replyId !== undefined) {
        setMessages(previous => previous.map(message => message.id === replyId
          ? { ...message, text: 'Preparing APEX’s on-device AI… This model is downloaded once to the phone. Keep the app open until it is ready.', actions: [] }
          : message));
      }
      void ApexOnDeviceAi.prepareOnDeviceAi().then(({ status }) => {
        if (replyId === undefined) return;
        showPetMotion(status === 'ready' ? 'ready' : status === 'downloading' ? 'thinking' : 'blocked', status === 'downloading' ? 0 : 1800);
        setMessages(previous => previous.map(message => message.id === replyId
          ? { ...message, text: status === 'ready'
            ? 'APEX’s on-device AI is ready. Please ask your last question again.'
            : status === 'downloading'
              ? 'APEX’s on-device AI is downloading. Please try again once the download finishes.'
              : 'This phone cannot run APEX’s on-device AI. You can still ask about trips, expenses, and reports.' }
          : message));
      }).catch(() => {
        if (replyId === undefined) return;
        showPetMotion('blocked', 1800);
        setMessages(previous => previous.map(message => message.id === replyId
          ? { ...message, text: 'I could not prepare the on-device model. Check the phone’s connection and available storage, then try again.' }
          : message));
      });
      return;
    }
    if (!action.tab) return;
    setIsOpen(false);
    onNavigate(action.tab);
  };

  const handleRobotPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      lastPosition: robotPosition
    };
    showPetMotion('happy', 0);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleRobotPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;

    event.preventDefault();
    drag.moved = true;
    showPetMotion('dragging', 0);
    const position = {
      x: Math.max(APEX_ROBOT_EDGE_GAP, Math.min(event.clientX - drag.offsetX, window.innerWidth - APEX_ROBOT_WIDTH - APEX_ROBOT_EDGE_GAP)),
      y: Math.max(APEX_ROBOT_EDGE_GAP, Math.min(event.clientY - drag.offsetY, window.innerHeight - APEX_ROBOT_HEIGHT - APEX_ROBOT_EDGE_GAP))
    };
    drag.lastPosition = position;
    setRobotPosition(position);
  };

  const finishRobotDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.moved && drag.lastPosition) {
      try {
        localStorage.setItem(APEX_ROBOT_POSITION_KEY, JSON.stringify(drag.lastPosition));
        localStorage.setItem(APEX_ROBOT_POSITION_VERSION_KEY, '3');
      } catch {
        // The robot remains movable for this session if storage is unavailable.
      }
      suppressRobotClickRef.current = true;
      window.setTimeout(() => { suppressRobotClickRef.current = false; }, 0);
    }
    showPetMotion('happy', drag.moved ? 1300 : 1000);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const openAssistantFromRobot = () => {
    if (suppressRobotClickRef.current) {
      suppressRobotClickRef.current = false;
      return;
    }
    showPetMotion('happy', 1500);
    setIsOpen(true);
  };

  const robotStyle: React.CSSProperties = robotPosition
    ? {
      left: robotPosition.x,
      top: robotPosition.y,
      right: 'auto',
      bottom: 'auto',
      touchAction: 'none',
      userSelect: 'none'
    }
    : {
      right: 'max(0.75rem, calc((100vw - 28rem) / 2))',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.2rem)',
      touchAction: 'none',
      userSelect: 'none'
    };

  return (
    <>
      {!hidden && !isOpen && (
        <div className="apex-pet-dock group fixed z-30 h-[82px] w-[72px]" style={robotStyle}>
          <span className="pointer-events-none absolute left-1/2 top-3 h-20 w-20 -translate-x-1/2 rounded-full bg-cyan-400/35 opacity-90 blur-2xl transition-opacity group-hover:opacity-100" />
          <button
            type="button"
            onClick={openAssistantFromRobot}
            onPointerDown={handleRobotPointerDown}
            onPointerMove={handleRobotPointerMove}
            onPointerUp={finishRobotDrag}
            onPointerCancel={finishRobotDrag}
            onDragStart={event => event.preventDefault()}
            aria-label="APEX robot. Tap to open or press and drag to move it."
            title="Tap APEX to open · press and drag to move"
            className="absolute left-0 top-0 flex h-[82px] w-[72px] items-center justify-center rounded-full bg-transparent p-0 transition-transform duration-150 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 active:scale-95"
          >
            <ApexMiniRobot className="apex-mini-robot pointer-events-none relative h-[82px] w-[70px]" mood={petMood} />
          </button>
        </div>
      )}

      {isOpen && (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="apex-title"
          className="apex-dark-theme fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#07111f] text-slate-100"
        >
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

          <header className="relative flex shrink-0 items-center justify-between border-b border-white/10 bg-[#091625]/90 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => { showPetMotion('happy', 1400); setIsOpen(false); }}
              aria-label="Close APEX assistant"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-cyan-100 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <h1 id="apex-title" className="text-xl font-bold tracking-[0.12em] text-cyan-200">APEX</h1>
              <p className="whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.13em] text-slate-400">Advanced Personal Executive</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setDraft('');
              }}
              aria-label="Start a new APEX conversation"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
            >
              <Sparkles className="h-5 w-5" />
            </button>
          </header>

          <div ref={messageListRef} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <div className="mx-auto flex max-w-xl flex-col gap-4">
              {messages.length === 0 && voiceState !== 'listening' && (
                <div className="my-auto flex min-h-full flex-col items-center justify-center py-2 text-center">
                  <div className="relative mb-1 flex h-52 w-52 items-center justify-center">
                    <span className="absolute inset-0 rounded-full border border-cyan-300/20" />
                    <span className="absolute inset-4 rounded-full border border-blue-400/20" />
                    <span className="absolute inset-8 rounded-full border border-cyan-200/15 shadow-[0_0_42px_rgba(14,165,233,0.16)]" />
                    <span className="absolute h-28 w-28 rounded-full bg-cyan-400/15 blur-2xl" />
                    <ApexRobotFigure className="apex-robot-float relative z-10 h-[170px] w-[155px] drop-shadow-[0_0_18px_rgba(34,211,238,0.65)]" />
                  </div>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Advanced Personal Executive</p>
                  <p className="mt-3 max-w-xs text-sm leading-6 text-slate-300">
                    Your personal trip and expense assistant. How can I help you today?
                  </p>
                  <div className="mt-5 grid w-full max-w-md grid-cols-2 gap-2">
                    {APEX_STARTER_PROMPTS.map(prompt => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => submitQuestion(prompt)}
                        className="min-h-11 rounded-xl border border-cyan-300/30 bg-[#071827]/90 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-300/10 focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <div className="relative mt-5 flex h-[78px] w-[78px] items-center justify-center">
                    <button
                      type="button"
                      onClick={() => voiceState === 'listening' ? void stopVoiceInput() : void startVoiceInput()}
                      aria-label={voiceState === 'listening' ? 'Stop voice input' : 'Tap to speak to APEX'}
                      className="relative z-10 flex h-[66px] w-[66px] items-center justify-center rounded-full border border-cyan-200/40 bg-cyan-400/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.25)] transition hover:bg-cyan-300/20 focus:outline-none focus:ring-4 focus:ring-cyan-300/30"
                    >
                      <Mic className="h-7 w-7" />
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-cyan-200/90">Tap to speak</p>
                </div>
              )}

              {messages.length === 0 && voiceState === 'listening' && (
                <div className="my-auto flex min-h-full flex-col items-center justify-center py-3 text-center">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">APEX voice mode</p>
                  <div className="relative flex h-36 w-36 items-center justify-center">
                    <span className="absolute inset-0 rounded-full border border-cyan-300/20" />
                    <span className="absolute inset-3 rounded-full border border-sky-300/25 shadow-[0_0_34px_rgba(34,211,238,0.12)]" />
                    <span className="apex-listening-ring absolute inset-5 rounded-full border border-cyan-200/55" />
                    <span className="apex-listening-ring apex-listening-ring-delayed absolute inset-5 rounded-full border border-sky-300/35" />
                    <span className="absolute h-16 w-16 rounded-full bg-cyan-300/20 blur-xl" />
                    <button
                      type="button"
                      onClick={() => void stopVoiceInput()}
                      aria-label="Stop listening"
                      className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full border border-cyan-100/65 bg-cyan-300/15 text-cyan-100 shadow-[0_0_38px_rgba(34,211,238,0.38)] transition hover:bg-cyan-300/25 focus:outline-none focus:ring-4 focus:ring-cyan-300/30"
                    >
                      <Mic className="h-8 w-8" />
                    </button>
                  </div>
                  <div className="mt-2"><ApexVoiceWave /></div>
                  <h2 className="mt-1 text-lg font-semibold text-cyan-200">Listening…</h2>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-slate-300">Speak naturally. I’m listening for your question.</p>
                  <div className="mt-4 flex max-w-sm flex-wrap justify-center gap-2 text-[11px] text-slate-300">
                    <span className="rounded-full border border-cyan-200/15 bg-white/[0.035] px-3 py-1.5">“How much have I spent?”</span>
                    <span className="rounded-full border border-cyan-200/15 bg-white/[0.035] px-3 py-1.5">“Show my recent trips”</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void stopVoiceInput()}
                    className="mt-4 min-h-10 rounded-full border border-cyan-200/25 px-5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-100/50 hover:bg-cyan-300/10 focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
                  >
                    Cancel listening
                  </button>
                </div>
              )}

              {messages.map(message => (
                <article
                  key={message.id}
                  className={`flex gap-2.5 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {message.role === 'assistant' ? (
                    <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-300/[0.08] ring-1 ring-cyan-200/15">
                      <ApexRobotFigure className="apex-robot-float h-8 w-7 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]" />
                    </div>
                  ) : null}
                  <div className={`max-w-[85%] min-w-0 rounded-2xl px-4 py-3 shadow-lg ${
                    message.role === 'user'
                      ? 'rounded-br-md bg-gradient-to-br from-blue-600 to-teal-600 text-white shadow-blue-950/20'
                      : 'rounded-bl-md border border-white/10 bg-[#101d2c]/95 text-slate-100 shadow-black/10'
                  }`}>
                    <p className="whitespace-pre-line text-sm leading-6">{message.text}</p>
                    {message.role === 'assistant' && (
                      <>
                        <button
                          type="button"
                          onClick={() => { void speakMessage(message); }}
                          aria-label={speakingId === message.id ? 'Stop spoken reply' : 'Read reply aloud'}
                          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-cyan-200/80 transition hover:bg-white/5 hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
                        >
                          {speakingId === message.id ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                          {speakingId === message.id ? 'Stop voice' : 'Listen'}
                        </button>
                        {message.actions?.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.actions.map(action => (
                              <button
                                key={action.command || action.tab}
                                type="button"
                                onClick={() => handleAction(action, message.id)}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-cyan-200/20 bg-cyan-300/10 px-3 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/15 focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
                              >
                                {action.command === 'prepare-ai'
                                  ? <Sparkles className="h-3.5 w-3.5" />
                                  : action.tab === 'reports'
                                    ? <FileText className="h-3.5 w-3.5" />
                                    : <History className="h-3.5 w-3.5" />}
                                {action.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </article>
              ))}

              {voiceState === 'listening' && messages.length > 0 && (
                <div role="status" className="flex items-center gap-3 self-start rounded-2xl border border-cyan-300/20 bg-[#0b2030]/90 px-4 py-3 text-xs font-medium text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
                  <ApexVoiceWave compact />
                  <span>Listening… speak naturally.</span>
                </div>
              )}
              {voiceError && (
                <p role="status" className="self-start rounded-xl border border-cyan-300/15 bg-[#0b2030]/80 px-3 py-2 text-xs leading-5 text-slate-300">
                  {voiceError}
                </p>
              )}
            </div>
          </div>

          <div className="relative shrink-0 border-t border-white/10 bg-[#091625]/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
            <div className="mx-auto max-w-xl">
              <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-2xl border border-white/10 bg-[#101d2c] p-2 shadow-[0_12px_30px_rgba(0,0,0,0.2)] focus-within:border-cyan-300/35">
                <textarea
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      submitQuestion(draft);
                    }
                  }}
                  rows={1}
                  aria-label="Ask APEX a question"
                  placeholder="Ask APEX anything…"
                  className="max-h-24 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-3 text-sm leading-5 text-white outline-none placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => voiceState === 'listening' ? void stopVoiceInput() : void startVoiceInput()}
                  aria-label={voiceState === 'listening' ? 'Stop voice input' : 'Start voice input'}
                  className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition focus:outline-none focus:ring-2 focus:ring-cyan-300/60 ${
                    voiceState === 'listening' ? 'animate-pulse bg-cyan-300/15 text-cyan-100' : 'text-slate-300 hover:bg-white/10 hover:text-cyan-100'
                  }`}
                >
                  {voiceState === 'listening' ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Send question"
                  className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-emerald-400 text-slate-950 transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-cyan-100/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
              </form>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
