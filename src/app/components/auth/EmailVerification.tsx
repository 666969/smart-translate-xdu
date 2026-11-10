"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const actionClass = "rounded-lg border border-card-border bg-white px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-sky-50 disabled:opacity-50";

function verificationError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  switch (code) {
    case "auth/too-many-requests":
      return "操作太频繁，请稍后再试。";
    case "auth/network-request-failed":
      return "暂时连不上账号服务，请检查网络后重试。";
    case "auth/unauthorized-continue-uri":
      return "当前网址暂未开通邮箱验证。";
    case "auth/user-token-expired":
      return "登录状态已过期，请重新登录。";
    default:
      return !code && error instanceof Error ? error.message : "暂时无法处理邮箱验证，请稍后再试。";
  }
}

export default function EmailVerification() {
  const { emailVerified, sendVerificationEmail, refreshEmailVerification } = useAuth();
  const [pending, setPending] = useState<"send" | "refresh" | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  async function handleAction(action: "send" | "refresh") {
    if (pending) return;
    setPending(action);
    setNotice(null);
    try {
      if (action === "send") {
        if (await sendVerificationEmail()) {
          setNotice({ text: "验证邮件已发送。请打开邮件里的验证链接。" });
        }
      } else if (!(await refreshEmailVerification())) {
        setNotice({ text: "邮箱仍待验证。请先点击邮件里的链接，再刷新状态。" });
      }
    } catch (error) {
      setNotice({ text: verificationError(error), error: true });
    } finally {
      setPending(null);
    }
  }

  return (
    <section aria-label="邮箱验证" className="mt-2 rounded-xl border border-card-border px-3 py-2.5">
      <p role="status" className={emailVerified ? "text-xs font-semibold text-emerald-700" : "text-xs font-semibold text-slate-700"}>
        {emailVerified ? "邮箱已验证" : "邮箱待验证"}
      </p>
      {!emailVerified && (
        <>
          <p className="mt-1 text-xs leading-5 text-text-muted">发送验证邮件后，点开邮件里的链接，再回到这里刷新状态。</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" className={actionClass} disabled={Boolean(pending)} onClick={() => void handleAction("send")}>
              {pending === "send" ? "发送中…" : "发送验证邮件"}
            </button>
            <button type="button" className={actionClass} disabled={Boolean(pending)} onClick={() => void handleAction("refresh")}>
              {pending === "refresh" ? "查询中…" : "刷新验证状态"}
            </button>
          </div>
          {notice && (
            <p role={notice.error ? "alert" : "status"} className={"mt-2 text-xs leading-5 " + (notice.error ? "text-rose-700" : "text-text-muted")}>
              {notice.text}
            </p>
          )}
        </>
      )}
    </section>
  );
}
