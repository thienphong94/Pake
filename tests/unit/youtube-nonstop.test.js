import fs from "fs";
import path from "path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function runScript({ hostname, dialog }) {
  const observe = vi.fn();
  const addEventListener = vi.fn();
  const setInterval = vi.fn();
  const context = {
    WeakSet,
    MutationObserver: class {
      observe = observe;
    },
    document: {
      readyState: "complete",
      documentElement: {},
      addEventListener,
      querySelectorAll: () => (dialog ? [dialog] : []),
    },
    window: {
      location: { hostname },
      setInterval,
    },
  };

  const source = fs.readFileSync(
    path.join(process.cwd(), "assets/youtube-nonstop.js"),
    "utf8",
  );
  runInNewContext(source, context);
  return { addEventListener, observe, setInterval };
}

describe("YouTube NonStop injection", () => {
  it("clicks only the matching pause confirmation", () => {
    const click = vi.fn();
    const dialog = {
      textContent: "Video paused. Continue watching?",
      querySelector: () => ({ click, disabled: false }),
    };

    runScript({ hostname: "www.youtube.com", dialog });

    expect(click).toHaveBeenCalledOnce();
  });

  it("does not click unrelated confirmation dialogs", () => {
    const click = vi.fn();
    const dialog = {
      textContent: "Delete this playlist?",
      querySelector: () => ({ click, disabled: false }),
    };

    runScript({ hostname: "www.youtube.com", dialog });

    expect(click).not.toHaveBeenCalled();
  });

  it("does nothing outside YouTube", () => {
    const click = vi.fn();
    const dialog = {
      textContent: "Video paused. Continue watching?",
      querySelector: () => ({ click, disabled: false }),
    };

    const result = runScript({ hostname: "youtube.com.evil.test", dialog });

    expect(click).not.toHaveBeenCalled();
    expect(result.observe).not.toHaveBeenCalled();
    expect(result.setInterval).not.toHaveBeenCalled();
  });
});
