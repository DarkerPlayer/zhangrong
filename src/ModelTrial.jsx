import React, { useEffect, useRef, useState } from "react";
import { consumeChatStream } from "./chat-stream.mjs";

export default function ModelTrial({ model, disabled = false }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const request = useRef(null);
  useEffect(() => {
    setResult(null);
    setRunning(false);
    return () => {
      const previous = request.current;
      request.current = null;
      previous?.abort();
    };
  }, [model]);
  async function trial() {
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    const started = performance.now();
    let first = null;
    const timeout = setTimeout(() => controller.abort(), 100000);
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          provider: "ollama",
          stream: true,
          message:
            "今天做了一件有挑战的事，现在有点累。请自然地接着聊，用两句简短中文回答。",
        }),
      });
      if (!response.ok)
        throw new Error((await response.json()).error || "测试失败，请重试。");
      const data = await consumeChatStream(response, {
        signal: controller.signal,
        onDelta: () => {
          first ??= performance.now();
        },
      });
      if (controller.signal.aborted) return;
      setResult(
        data.provider === "ollama"
          ? {
              reply: data.reply,
              first: ((first || performance.now()) - started) / 1000,
              total: (performance.now() - started) / 1000,
            }
          : { error: data.error || "模型不可用，本次返回了内置回复。" },
      );
    } catch (error) {
      if (!controller.signal.aborted) setResult({ error: error.message });
      else if (request.current === controller)
        setResult({ error: "测试已停止或超时。" });
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setRunning(false);
      }
    }
  }
  return (
    <div className="model-trial">
      <p className="footnote">
        4B 适合日常陪伴；9B
        可用于比较复杂的表达。所有角色共用所选模型，记忆各自保存。首次回复包含加载时间。
      </p>
      <button
        type="button"
        className="text-button"
        disabled={!model || (disabled && !running)}
        onClick={() => (running ? request.current?.abort() : trial())}
      >
        {running ? "停止响应测试" : "测试当前模型响应"}
      </button>
      <p className="footnote">
        测试使用固定示例，不写入聊天和记忆，也不会朗读。
      </p>
      {result && (
        <div role="status" className="model-trial-result">
          {result.error || (
            <>
              <strong>
                首字 {result.first.toFixed(2)} 秒 · 完成{" "}
                {result.total.toFixed(2)} 秒
              </strong>
              <p>{result.reply}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
