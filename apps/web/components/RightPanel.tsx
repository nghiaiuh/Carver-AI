"use client";

import { useRef, useState } from "react";

const AI_CONTENT = {
  title: "Garden 3D Render",
  subtitle: "AI generation complete",
  steps: [
    { done: true, text: "Parsed scene description" },
    { done: true, text: "Applied photorealism enhancement" },
    { done: true, text: "Generated depth of field" },
    { done: false, text: "Exporting high-res version" },
  ],
  bullets: [
    "Ultra-realistic garden scene with volumetric lighting and ambient occlusion",
    "Dynamic foliage simulation with wind-driven motion blur",
    "Physically-based rendering materials for stone and vegetation",
    "Golden-hour HDRI environment map with cinematic color grading",
    "Anti-aliased at 4K resolution with post-processing stack",
  ],
  summary:
    "The AI has successfully interpreted your garden concept and rendered a photorealistic 3D scene. The model applied procedural foliage distribution, PBR materials, and a cinematic lighting rig to achieve the final output. You can now iterate on the prompt or export the asset.",
};

const MODELS = ["Carver AI 2.5", "GPT-4o", "Claude 3.5", "Gemini 2.0"];

export default function RightPanel() {
  const [message, setMessage] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [modelOpen, setModelOpen] = useState(false);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  };

  return (
    <aside className="right-panel">
      {/* Header */}
      <div className="rp-header">
        <div className="rp-header-left">
          <div className="rp-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div>
            <p className="rp-task-title">{AI_CONTENT.title}</p>
            <p className="rp-task-sub">{AI_CONTENT.subtitle}</p>
          </div>
        </div>
        <div className="rp-header-actions">
          <button className="icon-btn" title="Refresh" id="rp-refresh-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
          </button>
          <button className="icon-btn" title="More options" id="rp-more-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="rp-body">
        {/* Progress steps */}
        <div className="rp-card">
          <div className="rp-card-header">
            <div className="rp-spinner-wrap">
              <div className="rp-spinner" />
            </div>
            <span className="rp-card-title">Task Progress</span>
            <span className="rp-badge rp-badge-blue">In progress</span>
          </div>
          <div className="rp-steps">
            {AI_CONTENT.steps.map((step, i) => (
              <div key={i} className={`rp-step ${step.done ? "rp-step-done" : "rp-step-current"}`}>
                <div className="rp-step-icon">
                  {step.done ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="10" height="10">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : (
                    <div className="rp-step-pulse" />
                  )}
                </div>
                <span>{step.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Notify me */}
        <button
          id="notify-me-btn"
          className={`rp-notify-btn ${notifyEnabled ? "rp-notify-btn-on" : ""}`}
          onClick={() => setNotifyEnabled(!notifyEnabled)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {notifyEnabled ? "Notifications enabled" : "Notify me when task is done"}
        </button>

        {/* AI Summary */}
        <div className="rp-section">
          <p className="rp-section-label">AI Summary</p>
          <p className="rp-summary">{AI_CONTENT.summary}</p>
        </div>

        {/* Bullet list */}
        <div className="rp-section">
          <p className="rp-section-label">Generation Details</p>
          <ul className="rp-bullet-list">
            {AI_CONTENT.bullets.map((b, i) => (
              <li key={i} className="rp-bullet-item">
                <span className="rp-bullet-dot" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Notification cards */}
        <div className="rp-section">
          <p className="rp-section-label">Activity</p>
          <div className="rp-notification-card rp-notification-success">
            <div className="rp-notif-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <div>
              <p className="rp-notif-title">Render complete</p>
              <p className="rp-notif-sub">Garden 3D scene exported · 2 min ago</p>
            </div>
          </div>
          <div className="rp-notification-card rp-notification-info">
            <div className="rp-notif-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <div>
              <p className="rp-notif-title">Model updated</p>
              <p className="rp-notif-sub">Carver AI 2.5 is now available · 5 min ago</p>
            </div>
          </div>
        </div>

        {/* Upgrade banner */}
        <div className="rp-upgrade-banner" id="upgrade-banner">
          <div className="rp-upgrade-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div className="rp-upgrade-body">
            <p className="rp-upgrade-title">Unlock Pro Renders</p>
            <p className="rp-upgrade-sub">8K exports, priority queue & custom models</p>
          </div>
          <button id="upgrade-btn" className="rp-upgrade-btn">Upgrade</button>
        </div>
      </div>

      {/* Chat Input */}
      <div className="rp-chat-area">
        <div className="rp-chat-box">
          <textarea
            id="chat-input"
            ref={textareaRef}
            className="rp-chat-input"
            placeholder="Start with an idea, or type @ to mention"
            value={message}
            onChange={handleInput}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                setMessage("");
              }
            }}
          />
          <div className="rp-chat-actions">
            <button id="chat-attach-btn" className="icon-btn" title="Attach file">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            {/* Model selector */}
            <div className="rp-model-selector" style={{ position: "relative" }}>
              <button
                id="model-selector-btn"
                className="rp-model-btn"
                onClick={() => setModelOpen(!modelOpen)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                  <circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                </svg>
                <span>{selectedModel}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="10" height="10">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {modelOpen && (
                <div className="rp-model-dropdown" id="model-dropdown">
                  {MODELS.map((m) => (
                    <button
                      key={m}
                      className={`rp-model-option ${selectedModel === m ? "rp-model-option-active" : ""}`}
                      onClick={() => { setSelectedModel(m); setModelOpen(false); }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button id="chat-voice-btn" className="icon-btn" title="Voice input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>

            <button
              id="chat-send-btn"
              className={`rp-send-btn ${message.trim() ? "rp-send-btn-active" : ""}`}
              title="Send message"
              onClick={() => setMessage("")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
        <p className="rp-chat-hint">Press <kbd>↵</kbd> to send · <kbd>Shift+↵</kbd> for new line</p>
      </div>
    </aside>
  );
}
