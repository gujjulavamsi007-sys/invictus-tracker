package com.invictus.tracker;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(
    name = "ApexAssistant",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class ApexAssistantPlugin extends Plugin implements RecognitionListener {
    private SpeechRecognizer speechRecognizer;
    private TextToSpeech textToSpeech;
    private boolean usingOnDeviceRecognition = false;

    @PluginMethod
    public void startListening(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        beginRecognition(call);
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission is required for voice input.");
            return;
        }
        beginRecognition(call);
    }

    private void beginRecognition(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("No Android speech recognition service is available on this device.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                destroyRecognizer();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                    SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
                    speechRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
                    usingOnDeviceRecognition = true;
                } else {
                    speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                    usingOnDeviceRecognition = false;
                }
                speechRecognizer.setRecognitionListener(this);

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN");
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                speechRecognizer.startListening(intent);
                call.resolve();
            } catch (Exception error) {
                destroyRecognizer();
                call.reject("Could not start Android voice input.", error);
            }
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            destroyRecognizer();
            call.resolve();
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) {
            call.reject("There is no reply text to speak.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                if (textToSpeech == null) {
                    textToSpeech = new TextToSpeech(getContext(), status -> {
                        if (status != TextToSpeech.SUCCESS) {
                            call.reject("Android text-to-speech is not available on this device.");
                            return;
                        }
                        speakText(call, text);
                    });
                } else {
                    speakText(call, text);
                }
            } catch (Exception error) {
                call.reject("Could not start Android spoken replies.", error);
            }
        });
    }

    private void speakText(PluginCall call, String text) {
        if (textToSpeech == null) {
            call.reject("Android text-to-speech is not available on this device.");
            return;
        }
        textToSpeech.setLanguage(new Locale("en", "IN"));
        textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {}

            @Override
            public void onDone(String utteranceId) {
                notifyListeners("speechFinished", new JSObject());
            }

            @Override
            public void onError(String utteranceId) {
                JSObject error = new JSObject();
                error.put("message", "Android text-to-speech stopped.");
                notifyListeners("speechFinished", error);
            }
        });
        int result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "apex-reply");
        if (result == TextToSpeech.ERROR) {
            call.reject("Android could not speak this reply.");
            return;
        }
        JSObject response = new JSObject();
        response.put("started", true);
        call.resolve(response);
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        if (textToSpeech != null) {
            textToSpeech.stop();
            notifyListeners("speechFinished", new JSObject());
        }
        call.resolve();
    }

    @Override
    public void onReadyForSpeech(Bundle params) {}

    @Override
    public void onBeginningOfSpeech() {}

    @Override
    public void onRmsChanged(float rmsdB) {}

    @Override
    public void onBufferReceived(byte[] buffer) {}

    @Override
    public void onEndOfSpeech() {}

    @Override
    public void onError(int error) {
        JSObject result = new JSObject();
        result.put("message", getRecognitionError(error));
        result.put("onDevice", usingOnDeviceRecognition);
        notifyListeners("speechError", result);
        destroyRecognizer();
    }

    @Override
    public void onResults(Bundle results) {
        ArrayList<String> matches = results == null
            ? null
            : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        String recognizedText = matches == null || matches.isEmpty() ? "" : matches.get(0);
        if (recognizedText.trim().isEmpty()) {
            JSObject error = new JSObject();
            error.put("message", "No speech was recognized. Please try again or type your question.");
            notifyListeners("speechError", error);
        } else {
            JSObject result = new JSObject();
            result.put("text", recognizedText.trim());
            result.put("onDevice", usingOnDeviceRecognition);
            notifyListeners("speechResult", result);
        }
        destroyRecognizer();
    }

    @Override
    public void onPartialResults(Bundle partialResults) {}

    @Override
    public void onEvent(int eventType, Bundle params) {}

    private String getRecognitionError(int error) {
        if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
            return "Microphone permission was not granted.";
        }
        if (error == SpeechRecognizer.ERROR_NETWORK ||
            error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ||
            error == SpeechRecognizer.ERROR_SERVER) {
            return "The speech service could not connect. Check your connection or type your question.";
        }
        if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
            return "No speech was recognized. Please try again or type your question.";
        }
        return "Android voice input stopped. You can type your question instead.";
    }

    private void destroyRecognizer() {
        if (speechRecognizer != null) {
            speechRecognizer.cancel();
            speechRecognizer.destroy();
            speechRecognizer = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        destroyRecognizer();
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.handleOnDestroy();
    }
}
