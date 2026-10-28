package com.invictus.tracker;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.genai.common.DownloadCallback;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.common.GenAiException;
import com.google.mlkit.genai.prompt.GenerateContentRequest;
import com.google.mlkit.genai.prompt.GenerateContentResponse;
import com.google.mlkit.genai.prompt.Generation;
import com.google.mlkit.genai.prompt.TextPart;
import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;

@CapacitorPlugin(name = "ApexOnDeviceAi")
public class ApexOnDeviceAiPlugin extends Plugin {
    private static final String AI_PERSONA =
        "You are APEX, the friendly assistant inside a petrol trip expense tracker. " +
        "Answer the user's actual question directly, naturally, and briefly. Use recent conversation to resolve follow-ups. " +
        "Do not repeat a previous answer when the question changes. Never invent trip facts, totals, dates, or report actions. " +
        "Exact trip calculations are performed by the app; only use the saved-data context provided here. " +
        "Explain that data is missing only when it matters. You do not have live internet access.";

    private GenerativeModelFutures generativeModel;

    @PluginMethod
    public void checkOnDeviceAi(PluginCall call) {
        ListenableFuture<Integer> statusFuture = getGenerativeModel().checkStatus();
        statusFuture.addListener(() -> {
            try {
                resolveStatus(call, toStatus(statusFuture.get()));
            } catch (Exception error) {
                call.reject("Could not check on-device AI availability.", error);
            }
        }, Runnable::run);
    }

    @PluginMethod
    public void prepareOnDeviceAi(PluginCall call) {
        GenerativeModelFutures model = getGenerativeModel();
        ListenableFuture<Integer> statusFuture = model.checkStatus();
        statusFuture.addListener(() -> {
            try {
                int status = statusFuture.get();
                if (status == FeatureStatus.AVAILABLE) {
                    resolveStatus(call, "ready");
                } else if (status == FeatureStatus.UNAVAILABLE) {
                    resolveStatus(call, "unsupported");
                } else if (status == FeatureStatus.DOWNLOADING) {
                    resolveStatus(call, "downloading");
                } else {
                    startModelDownload(call, model);
                }
            } catch (Exception error) {
                call.reject("Could not prepare on-device AI.", error);
            }
        }, Runnable::run);
    }

    @PluginMethod
    public void generateReply(PluginCall call) {
        String question = call.getString("question", "").trim();
        if (question.isEmpty()) {
            call.reject("Please enter a question.");
            return;
        }

        String conversation = call.getString("conversation", "");
        String tripContext = call.getString("tripContext", "");
        GenerativeModelFutures model = getGenerativeModel();
        ListenableFuture<Integer> statusFuture = model.checkStatus();
        statusFuture.addListener(() -> {
            try {
                if (statusFuture.get() != FeatureStatus.AVAILABLE) {
                    call.reject("On-device AI is not ready. Check its availability or prepare it first.", "AI_NOT_READY");
                    return;
                }
                GenerateContentRequest.Builder requestBuilder = new GenerateContentRequest.Builder(
                    new TextPart(buildPrompt(question, conversation, tripContext))
                );
                requestBuilder.setTemperature(0.35f);
                requestBuilder.setTopK(12);
                requestBuilder.setMaxOutputTokens(220);
                GenerateContentRequest request = requestBuilder.build();
                ListenableFuture<GenerateContentResponse> responseFuture = model.generateContent(request);
                responseFuture.addListener(() -> {
                    try {
                        GenerateContentResponse response = responseFuture.get();
                        String reply = response.getCandidates().isEmpty()
                            ? "I couldn’t form a reply just now. Please ask me another way."
                            : response.getCandidates().get(0).getText();
                        JSObject result = new JSObject();
                        result.put("text", reply == null ? "" : reply.trim());
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("On-device AI could not answer this question.", error);
                    }
                }, Runnable::run);
            } catch (Exception error) {
                call.reject("On-device AI could not answer this question.", error);
            }
        }, Runnable::run);
    }

    private GenerativeModelFutures getGenerativeModel() {
        if (generativeModel == null) {
            generativeModel = GenerativeModelFutures.from(Generation.INSTANCE.getClient());
        }
        return generativeModel;
    }

    private String toStatus(int status) {
        if (status == FeatureStatus.AVAILABLE) return "available";
        if (status == FeatureStatus.DOWNLOADABLE) return "downloadable";
        if (status == FeatureStatus.DOWNLOADING) return "downloading";
        return "unsupported";
    }

    private void resolveStatus(PluginCall call, String status) {
        JSObject result = new JSObject();
        result.put("status", status);
        call.resolve(result);
    }

    private void startModelDownload(PluginCall call, GenerativeModelFutures model) {
        try {
            ListenableFuture<Void> downloadFuture = model.download(new DownloadCallback() {
                @Override
                public void onDownloadStarted(long bytesToDownload) {
                    notifyDownloadStatus("downloading", bytesToDownload);
                }

                @Override
                public void onDownloadProgress(long totalBytesDownloaded) {
                    notifyDownloadStatus("downloading", totalBytesDownloaded);
                }

                @Override
                public void onDownloadCompleted() {
                    notifyDownloadStatus("ready", 0);
                }

                @Override
                public void onDownloadFailed(GenAiException error) {
                    JSObject event = new JSObject();
                    event.put("status", "failed");
                    event.put("message", error.getMessage() == null ? "Download failed." : error.getMessage());
                    notifyListeners("aiDownloadStatus", event);
                }
            });
            downloadFuture.addListener(() -> {
                try {
                    downloadFuture.get();
                    resolveStatus(call, "ready");
                } catch (Exception error) {
                    call.reject("The on-device AI model could not be downloaded.", error);
                }
            }, Runnable::run);
        } catch (Exception error) {
            call.reject("The on-device AI model could not be downloaded.", error);
        }
    }

    private void notifyDownloadStatus(String status, long bytesDownloaded) {
        JSObject event = new JSObject();
        event.put("status", status);
        event.put("bytesDownloaded", bytesDownloaded);
        notifyListeners("aiDownloadStatus", event);
    }

    private String buildPrompt(String question, String conversation, String tripContext) {
        String recentConversation = conversation.length() > 4500
            ? conversation.substring(conversation.length() - 4500)
            : conversation;
        String savedData = tripContext.length() > 2500 ? tripContext.substring(0, 2500) : tripContext;
        return AI_PERSONA + "\n\nRecent conversation:\n" + recentConversation +
            "\n\nSaved-data context:\n" + savedData +
            "\n\nCurrent question: " + question + "\nAnswer the current question directly.";
    }

    @Override
    protected void handleOnDestroy() {
        if (generativeModel != null) {
            generativeModel.getGenerativeModel().close();
            generativeModel = null;
        }
        super.handleOnDestroy();
    }
}
