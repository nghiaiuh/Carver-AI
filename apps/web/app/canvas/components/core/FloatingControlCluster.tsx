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
      <div className="flex items-center gap-1 rounded-2xl border border-[#E5E3DC] bg-white/90 p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-md">
        {/* Credits Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-[#4A4843]" title="Available AI Generation Credits">
          <Coins className="h-3.5 w-3.5 text-[#EA7542]" />
          <span>{creditsAmount !== null ? creditsAmount.toLocaleString() : "1,240"}</span>
        </div>

        <div className="h-4 w-[1px] bg-[#E5E3DC]" />

        {/* Undo */}
        <button
          type="button"
          onClick={onUndo}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-[#4A4843] transition hover:bg-[#F2F0E9] active:scale-95"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>

        {/* Redo */}
        <button
          type="button"
          onClick={onRedo}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-[#4A4843] transition hover:bg-[#F2F0E9] active:scale-95"
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
          className="flex items-center gap-1.5 rounded-xl bg-[#1A1918] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#2C2A26] active:scale-95"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>Share</span>
        </button>

        {/* User Avatar */}
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#EA7542] text-xs font-bold text-white shadow-sm">
          N
        </div>

        {/* More Options */}
        <button
          type="button"
          onClick={() => {
            setShowMoreMenu(!showMoreMenu);
            setShowShareModal(false);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-[#4A4843] transition hover:bg-[#F2F0E9]"
          title="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Share Modal Popover */}
      {showShareModal && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-[#E5E3DC] bg-white p-4 shadow-[0_16px_40px_rgba(0,0,0,0.1)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-3 border-b border-[#F2F0E9]">
            <span className="text-sm font-bold text-[#1A1918]">Share Project</span>
            <span className="rounded-full bg-[#FFF5F0] px-2 py-0.5 text-[10px] font-bold text-[#EA7542]">
              Live Board
            </span>
          </div>

          <div className="mt-3">
            <label className="text-xs font-medium text-[#827E75]">Invite Collaborators</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="email"
                placeholder="colleague@studio.com"
                className="w-full rounded-xl border border-[#E5E3DC] px-3 py-1.5 text-xs outline-none focus:border-[#EA7542]"
              />
              <button
                type="button"
                className="rounded-xl bg-[#1A1918] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2C2A26]"
              >
                Invite
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-medium text-[#827E75]">Project Link</label>
            <div className="mt-1 flex items-center justify-between rounded-xl border border-[#E5E3DC] bg-[#F8F7F3] p-1.5 pl-3">
              <span className="truncate text-xs text-[#4A4843]">
                {typeof window !== "undefined" ? window.location.href : ""}
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-[#1A1918] shadow-sm hover:bg-[#F2F0E9]"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
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
        <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-[#E5E3DC] bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
          <button
            type="button"
            onClick={() => setShowMoreMenu(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#1A1918] transition hover:bg-[#F8F7F3]"
          >
            <Download className="h-4 w-4 text-[#827E75]" />
            <span>Export Snapshot Image</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMoreMenu(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#1A1918] transition hover:bg-[#F8F7F3]"
          >
            <Users className="h-4 w-4 text-[#827E75]" />
            <span>Collaborator Permissions</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMoreMenu(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#1A1918] transition hover:bg-[#F8F7F3]"
          >
            <Shield className="h-4 w-4 text-[#827E75]" />
            <span>Spatial Lock Preferences</span>
          </button>
        </div>
      )}
    </div>
  );
}
