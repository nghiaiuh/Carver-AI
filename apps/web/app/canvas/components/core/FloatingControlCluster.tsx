"use client";

import React, { useState, useRef, useEffect } from "react";
import { Undo2, Redo2, Share2, MoreHorizontal, Coins, Copy, Check, Users, Shield, Download } from "lucide-react";

type FloatingControlClusterProps = {
  creditsAmount: number | null;
  onUndo: () => void;
  onRedo: () => void;
  onShare?: () => void;
};

export default function FloatingControlCluster({
  creditsAmount,
  onUndo,
  onRedo,
  onShare,
}: FloatingControlClusterProps) {
  const [showShareModal, setShowShareModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowShareModal(false);
        setShowMoreMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative z-[90] flex items-center gap-2" ref={menuRef}>
      {/* Main Control Cluster Capsule */}
      <div className="flex items-center gap-1 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]/90 p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-md">
        {/* Credits Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-[var(--canvas-theme-text-soft)]" title="Available AI Generation Credits">
          <Coins className="h-3.5 w-3.5 text-[var(--canvas-theme-selection)]" />
          <span>{creditsAmount !== null ? creditsAmount.toLocaleString() : "1,240"}</span>
        </div>

        <div className="h-4 w-[1px] bg-[var(--canvas-theme-border)]" />

        {/* Undo */}
        <button
          type="button"
          onClick={onUndo}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)] active:scale-95"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>

        {/* Redo */}
        <button
          type="button"
          onClick={onRedo}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)] active:scale-95"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>

        {/* Share Button (Dark Charcoal Pill) */}
        <button
          type="button"
          onClick={() => {
            setShowShareModal(!showShareModal);
            setShowMoreMenu(false);
            onShare?.();
          }}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--canvas-theme-active)] px-3 py-1.5 text-xs font-semibold text-[var(--canvas-theme-active-text)] shadow-sm transition hover:bg-[var(--canvas-theme-selection-hover)] active:scale-95"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>Share</span>
        </button>

        {/* User Avatar */}
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--canvas-theme-selection)] text-xs font-bold text-[var(--canvas-theme-active-text)] shadow-sm">
          N
        </div>

        {/* More Options */}
        <button
          type="button"
          onClick={() => {
            setShowMoreMenu(!showMoreMenu);
            setShowShareModal(false);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)]"
          title="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Share Modal Popover */}
      {showShareModal && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.1)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--canvas-theme-border)]">
            <span className="text-sm font-bold text-[var(--canvas-theme-text)]">Share Project</span>
            <span className="rounded-full bg-[var(--canvas-theme-selection-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--canvas-theme-selection)]">
              Live Board
            </span>
          </div>

          <div className="mt-3">
            <label className="text-xs font-medium text-[var(--canvas-theme-text-muted)]">Invite Collaborators</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="email"
                placeholder="colleague@studio.com"
                className="w-full rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface)] px-3 py-1.5 text-xs text-[var(--canvas-theme-text)] outline-none focus:border-[var(--canvas-theme-selection)]"
              />
              <button
                type="button"
                className="rounded-xl bg-[var(--canvas-theme-active)] px-3 py-1.5 text-xs font-semibold text-[var(--canvas-theme-active-text)] hover:bg-[var(--canvas-theme-selection-hover)]"
              >
                Invite
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-medium text-[var(--canvas-theme-text-muted)]">Project Link</label>
            <div className="mt-1 flex items-center justify-between rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-soft)] p-1.5 pl-3">
              <span className="truncate text-xs text-[var(--canvas-theme-text-soft)]">
                {typeof window !== "undefined" ? window.location.href : ""}
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1 rounded-lg bg-[var(--canvas-theme-surface-panel)] px-2.5 py-1 text-xs font-semibold text-[var(--canvas-theme-text)] shadow-sm hover:bg-[var(--canvas-theme-hover)]"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[var(--canvas-theme-success)]" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* More Options Popover */}
      {showMoreMenu && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
          <button
            type="button"
            onClick={() => setShowMoreMenu(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
          >
            <Download className="h-4 w-4 text-[var(--canvas-theme-icon-muted)]" />
            <span>Export Snapshot Image</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMoreMenu(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
          >
            <Users className="h-4 w-4 text-[var(--canvas-theme-icon-muted)]" />
            <span>Collaborator Permissions</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMoreMenu(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
          >
            <Shield className="h-4 w-4 text-[var(--canvas-theme-icon-muted)]" />
            <span>Spatial Lock Preferences</span>
          </button>
        </div>
      )}
    </div>
  );
}
