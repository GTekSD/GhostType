// GhostType - GTekSD content script for the side panel
(function() {
  if (window.GhostTypeInitialized || window.HumanAutoTyperInitialized) {
    //console.log('GhostType - GTekSD: Already initialized on this page');
    return;
  }
  window.GhostTypeInitialized = true;

  let lastClickedCanvas = null;

  document.addEventListener('pointerdown', (event) => {
    const clickedCanvas = event.composedPath().find((target) =>
      target?.tagName === 'CANVAS'
    );
    lastClickedCanvas = clickedCanvas || null;
    if (clickedCanvas) updateCompatibilityStatus(clickedCanvas);
  }, true);

  function updateCompatibilityStatus(target) {
    let text = "Compatibility: no text editor focused";
    let level = "unavailable";
    let details = "Click an input, textarea, rich-text area, or supported editor on the page.";
    if (target?.tagName === "CANVAS") {
      text = "Compatibility: canvas is page-dependent";
      level = "limited";
      details = "Canvas input only works when the page handles synthetic keyboard events.";
    } else if (target?.matches?.("textarea") && target.closest(".monaco-editor")) {
      text = "Compatibility: Monaco editor detected";
      level = "supported";
      details = "Monaco support tested; the editor or website may still ignore synthetic input.";
    } else if (target?.matches?.("textarea") && target.closest(".CodeMirror")) {
      text = "Compatibility: CodeMirror editor detected";
      level = "supported";
      details = "CodeMirror support tested; the editor or website may still ignore synthetic input.";
    } else if (target?.isContentEditable) {
      text = "Compatibility: rich-text editor detected";
      level = "supported";
      details = "Rich-text support works with standard editable areas; custom editor behavior may vary.";
    } else if (isEditableElement(target)) {
      text = "Compatibility: text field detected";
      level = "supported";
      details = "Standard field support detected; the website may still reject simulated input.";
    }

    try {
      chrome.runtime.sendMessage({ action: "compatibilityStatus", text, level, details }, () => {
        if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
          console.debug("Could not update compatibility status:", chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      console.debug("Could not update compatibility status:", error);
    }
  }

  document.addEventListener("focusin", (event) => {
    let target = event.target;
    if (target?.tagName === "IFRAME") {
      target = getFocusedEditableElement(document) || target;
    }
    updateCompatibilityStatus(target);
  }, true);
  
  // Helper functions from original
  const getRandomChar = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789,./;'[]=-`%";
    return chars.charAt(Math.floor(Math.random() * chars.length));
  };

  const getNeighborKey = (char) => {
    const neighbors = {
      q: ["w", "a", "s"], w: ["q", "e", "a", "s", "d"], e: ["w", "r", "s", "d", "f"],
      r: ["e", "t", "d", "f", "g"], t: ["r", "y", "f", "g", "h"], y: ["t", "u", "g", "h", "j"],
      u: ["y", "i", "h", "j", "k"], i: ["u", "o", "j", "k", "l"], o: ["i", "p", "k", "l"],
      p: ["o", "l"], a: ["q", "w", "s", "z"], s: ["q", "w", "e", "a", "d", "z", "x"],
      d: ["w", "e", "r", "s", "f", "x", "c"], f: ["e", "r", "t", "d", "g", "c", "v"],
      g: ["r", "t", "y", "f", "h", "v", "b"], h: ["t", "y", "u", "g", "j", "b", "n"],
      j: ["y", "u", "i", "h", "k", "n", "m"], k: ["u", "i", "o", "j", "l", "m"],
      l: ["i", "o", "p", "k"], z: ["a", "s", "x"], x: ["z", "s", "d", "c"],
      c: ["x", "d", "f", "v"], v: ["c", "f", "g", "b"], b: ["v", "g", "h", "n"],
      n: ["b", "h", "j", "m"], m: ["n", "j", "k"]
    };
    
    const lower = char.toLowerCase();
    if (neighbors[lower]) {
      const neighborList = neighbors[lower];
      const neighbor = neighborList[Math.floor(Math.random() * neighborList.length)];
      return char === char.toUpperCase() ? neighbor.toUpperCase() : neighbor;
    }
    
    const fallback = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return fallback.charAt(Math.floor(Math.random() * fallback.length));
  };

  // Global state
  let isTyping = false;
  let isPaused = false;
  let currentPosition = 0;
  let currentText = "";
  let typingTimeout = null;
  const isEditableElement = (element) =>
    element &&
    (
      element.tagName === "TEXTAREA" ||
      (element.tagName === "INPUT" &&
        ["text", "search", "url", "tel", "password", "email", "number"].includes(element.type)) ||
      element.isContentEditable
    );
  const getFocusedEditableElement = (doc) => {
    const activeElement = doc.activeElement;
    if (activeElement?.tagName === "IFRAME") {
      try {
        const frameDocument = activeElement.contentDocument;
        if (frameDocument) {
          const frameTarget = getFocusedEditableElement(frameDocument);
          if (frameTarget) return frameTarget;
        }
      } catch (error) {
        console.debug("Focused editor frame is not accessible:", error);
      }
    }
    if (activeElement?.shadowRoot?.activeElement) {
      const shadowTarget = getFocusedEditableElement(activeElement.shadowRoot);
      if (shadowTarget) return shadowTarget;
    }
    return isEditableElement(activeElement) ? activeElement : null;
  };
  const setInputValue = (element, value) => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      "value"
    )?.set;
    if (!valueSetter) {
      throw new Error("Could not update the focused input field.");
    }
    valueSetter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const insertIntoInput = (element, text) => {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (typeof start !== "number" || typeof end !== "number") {
      setInputValue(element, element.value + text);
      return;
    }
    setInputValue(element, element.value.slice(0, start) + text + element.value.slice(end));
    element.setSelectionRange(start + text.length, start + text.length);
  };
  const deleteFromInput = (element) => {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (typeof start !== "number" || typeof end !== "number") {
      if (element.value.length > 0) setInputValue(element, element.value.slice(0, -1));
      return;
    }
    if (start === 0 && start === end) return;
    const nextPosition = start === end ? start - 1 : start;
    const nextValue = start === end
      ? element.value.slice(0, nextPosition) + element.value.slice(end)
      : element.value.slice(0, start) + element.value.slice(end);
    setInputValue(element, nextValue);
    element.setSelectionRange(nextPosition, nextPosition);
  };
  // Main typing function with ORIGINAL logic
  function startTyping(text, speed = 60, errorRate = 0.05, startPosition = 0, humanMode = true, canvasMode = false) {
    // Detect Google Docs
    const googleDocsIframe = document.querySelector(".docs-texteventtarget-iframe");
    const isGoogleDocs = !!googleDocsIframe;
    
    let targetElement;

    // Get target element
    if (isGoogleDocs) {
      if (!googleDocsIframe || !googleDocsIframe.contentDocument) {
        const errorMsg = "Google Docs iframe not accessible. Please wait for the document to load.";
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      targetElement = googleDocsIframe.contentDocument.activeElement;
      if (!targetElement) {
        const errorMsg = "Could not access Google Docs editor. Please click in the document first.";
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    } else if (canvasMode) {
      targetElement = lastClickedCanvas;
      if (!targetElement?.isConnected) {
        const errorMsg = "No canvas selected. Turn on Canvas mode, click the canvas on the webpage, then start typing.";
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    } else {
      targetElement = getFocusedEditableElement(document);
      if (!targetElement) {
        const errorMsg = "No editable element focused. Please click on a text field first.";
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    }
    const targetDocument = targetElement.ownerDocument;
    const isPolledCodeEditor =
      targetElement.tagName === "TEXTAREA" && Boolean(targetElement.closest(".CodeMirror"));
    const isMonacoEditor =
      targetElement.tagName === "TEXTAREA" && Boolean(targetElement.closest(".monaco-editor"));

    // Focus element
    try {
      targetElement.focus();
    } catch (e) {
      console.error("Could not focus element:", e);
    }
    if (canvasMode) {
      targetElement.dispatchEvent(new FocusEvent("focus"));
    }

    // Calculate typing delay (from original)
    const calculateDelay = (wpm) => {
      let multiplier = 1;
      if (wpm > 100) multiplier = 0.7;
      else if (wpm > 80) multiplier = 0.8;
      const baseDelay = (60000 / (5 * wpm)) * (0.8 + Math.random() * 0.4) * multiplier;
      return Math.max(5, baseDelay);
    };

    // Get key code (from original)
    const getKeyCode = (char) => {
      if (char === " ") return "Space";
      if (char === "!") return "Digit1";
      if (char === "@") return "Digit2";
      if (char === "#") return "Digit3";
      if (char === "$") return "Digit4";
      if (char === "%") return "Digit5";
      if (char === "^") return "Digit6";
      if (char === "&") return "Digit7";
      if (char === "*") return "Digit8";
      if (char === "(") return "Digit9";
      if (char === ")") return "Digit0";
      if (char === "-" || char === "_") return "Minus";
      if (char === "=" || char === "+") return "Equal";
      if (char === "[") return "BracketLeft";
      if (char === "]") return "BracketRight";
      if (char === "{") return "BracketLeft";
      if (char === "}") return "BracketRight";
      if (char === "|" || char === "\\") return "Backslash";
      if (char === ";" || char === ":") return "Semicolon";
      if (char === "'" || char === '"') return "Quote";
      if (char === "," || char === "<") return "Comma";
      if (char === "." || char === ">") return "Period";
      if (char === "/" || char === "?") return "Slash";
      if (char === "`" || char === "~") return "Backquote";
      return `Key${char.toUpperCase()}`;
    };

    // Type Enter (from original logic)
    const typeEnter = async () => {
      if (canvasMode) {
        targetElement.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        }));
        targetElement.dispatchEvent(new KeyboardEvent("keypress", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        }));
        targetElement.dispatchEvent(new KeyboardEvent("keyup", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        }));
      } else if (isGoogleDocs) {
        targetElement.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13, 
          bubbles: true, cancelable: true
        }));
        await new Promise(r => setTimeout(r, 30));
        targetElement.dispatchEvent(new KeyboardEvent("keypress", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        }));
        await new Promise(r => setTimeout(r, 30));
        targetElement.dispatchEvent(new KeyboardEvent("keyup", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        }));
      } else if (targetElement.isContentEditable) {
        targetDocument.execCommand("insertHTML", false, "<br>");
      } else if (targetElement.tagName === "TEXTAREA") {
        insertIntoInput(targetElement, "\n");
      } else if (targetElement.tagName === "INPUT") {
        insertIntoInput(targetElement, "\n");
      }
      return 100 + Math.random() * 150;
    };

    // Type character (from original logic)
    const typeChar = async (char) => {
      if (char === "\n") {
        return await typeEnter();
      }

      if (char === "\b") {
        if (canvasMode) {
          targetElement.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Backspace", code: "Backspace", keyCode: 8, which: 8,
            bubbles: true, cancelable: true
          }));
          targetElement.dispatchEvent(new KeyboardEvent("keyup", {
            key: "Backspace", code: "Backspace", keyCode: 8, which: 8,
            bubbles: true, cancelable: true
          }));
        } else if (isGoogleDocs) {
          targetElement.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Backspace", code: "Backspace", keyCode: 8, which: 8,
            bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 15));
          targetElement.dispatchEvent(new KeyboardEvent("keypress", {
            key: "Backspace", code: "Backspace", keyCode: 8, which: 8,
            bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 15));
          targetElement.dispatchEvent(new KeyboardEvent("keyup", {
            key: "Backspace", code: "Backspace", keyCode: 8, which: 8,
            bubbles: true, cancelable: true
          }));
        } else if (targetElement.isContentEditable) {
          targetDocument.execCommand("delete", false);
        } else if (["TEXTAREA", "INPUT"].includes(targetElement.tagName)) {
          deleteFromInput(targetElement);
        }
        return 50;
      }

      // Regular character - ORIGINAL LOGIC for Google Docs
      if (canvasMode) {
        const isShiftChar = char !== char.toLowerCase() || '!@#$%^&*()_+{}|:"<>?~'.includes(char);
        const code = getKeyCode(char);
        const charCode = char.charCodeAt(0);
        if (isShiftChar) {
          targetElement.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Shift", code: "ShiftLeft", keyCode: 16, which: 16,
            shiftKey: true, bubbles: true, cancelable: true
          }));
        }
        targetElement.dispatchEvent(new KeyboardEvent("keydown", {
          key: char, code, keyCode: charCode, which: charCode,
          shiftKey: isShiftChar, bubbles: true, cancelable: true
        }));
        targetElement.dispatchEvent(new KeyboardEvent("keypress", {
          key: char, code, keyCode: charCode, which: charCode,
          shiftKey: isShiftChar, bubbles: true, cancelable: true
        }));
        targetElement.dispatchEvent(new KeyboardEvent("keyup", {
          key: char, code, keyCode: charCode, which: charCode,
          shiftKey: isShiftChar, bubbles: true, cancelable: true
        }));
        if (isShiftChar) {
          targetElement.dispatchEvent(new KeyboardEvent("keyup", {
            key: "Shift", code: "ShiftLeft", keyCode: 16, which: 16,
            bubbles: true, cancelable: true
          }));
        }
      } else if (isGoogleDocs) {
        const isShiftChar = '!@#$%^&*()_+{}|:"<>?~'.includes(char);
        const code = getKeyCode(char);
        const charCode = char.charCodeAt(0);

        if (isShiftChar) {
          const shiftCharMap = {
            "!": {code: "Digit1", keyCode: 49}, "@": {code: "Digit2", keyCode: 50},
            "#": {code: "Digit3", keyCode: 51}, "$": {code: "Digit4", keyCode: 52},
            "%": {code: "Digit5", keyCode: 53}, "^": {code: "Digit6", keyCode: 54},
            "&": {code: "Digit7", keyCode: 55}, "*": {code: "Digit8", keyCode: 56},
            "(": {code: "Digit9", keyCode: 57}, ")": {code: "Digit0", keyCode: 48},
            "_": {code: "Minus", keyCode: 189}, "+": {code: "Equal", keyCode: 187},
            "{": {code: "BracketLeft", keyCode: 219}, "}": {code: "BracketRight", keyCode: 221},
            "|": {code: "Backslash", keyCode: 220}, ":": {code: "Semicolon", keyCode: 186},
            '"': {code: "Quote", keyCode: 222}, "<": {code: "Comma", keyCode: 188},
            ">": {code: "Period", keyCode: 190}, "?": {code: "Slash", keyCode: 191},
            "~": {code: "Backquote", keyCode: 192}
          };
          const keyInfo = shiftCharMap[char] || {code: code, keyCode: charCode};
          
          // Shift down
          targetElement.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Shift", code: "ShiftLeft", keyCode: 16, which: 16,
            shiftKey: true, bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 8));
          
          // Key down
          targetElement.dispatchEvent(new KeyboardEvent("keydown", {
            key: char, code: keyInfo.code, keyCode: keyInfo.keyCode, which: keyInfo.keyCode,
            shiftKey: true, bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 10));
          
          // Key press
          targetElement.dispatchEvent(new KeyboardEvent("keypress", {
            key: char, code: keyInfo.code, keyCode: charCode, which: charCode,
            shiftKey: true, bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 10));
          
          // Key up
          targetElement.dispatchEvent(new KeyboardEvent("keyup", {
            key: char, code: keyInfo.code, keyCode: keyInfo.keyCode, which: keyInfo.keyCode,
            shiftKey: true, bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 8));
          
          // Shift up
          targetElement.dispatchEvent(new KeyboardEvent("keyup", {
            key: "Shift", code: "ShiftLeft", keyCode: 16, which: 16,
            shiftKey: false, bubbles: true, cancelable: true
          }));
        } else {
          // Regular character
          targetElement.dispatchEvent(new KeyboardEvent("keydown", {
            key: char, code: code, keyCode: charCode, which: charCode,
            bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 15));
          targetElement.dispatchEvent(new KeyboardEvent("keypress", {
            key: char, code: code, keyCode: charCode, which: charCode,
            bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 15));
          targetElement.dispatchEvent(new KeyboardEvent("keyup", {
            key: char, code: code, keyCode: charCode, which: charCode,
            bubbles: true, cancelable: true
          }));
        }
      } else if (targetElement.isContentEditable) {
        targetDocument.execCommand("insertText", false, char);
      } else if (["TEXTAREA", "INPUT"].includes(targetElement.tagName)) {
        insertIntoInput(targetElement, char);
      }

      // Extra delay for punctuation
      let extraDelay = 0;
      if (",.?!".includes(char)) extraDelay = 100 + Math.random() * 200;
      else if (char === " ") extraDelay = 25 + Math.random() * 50;
      return extraDelay;
    };

    // Type character FAST (no delays, for fast mode)
    const typeCharFast = async (char) => {
      if (char === "\n") {
        if (canvasMode) {
          targetElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
          targetElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        } else if (isGoogleDocs) {
          targetElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
          await new Promise(r => setTimeout(r, 5));
          targetElement.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
          await new Promise(r => setTimeout(r, 5));
          targetElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        } else if (targetElement.isContentEditable) {
          targetDocument.execCommand("insertHTML", false, "<br>");
        } else if (targetElement.tagName === "TEXTAREA") {
          insertIntoInput(targetElement, "\n");
        }
        return 0;
      }

      // Regular character - simplified, minimal delays
      if (canvasMode) {
        const isShiftChar = char !== char.toLowerCase() || '!@#$%^&*()_+{}|:"<>?~'.includes(char);
        const code = getKeyCode(char);
        const charCode = char.charCodeAt(0);
        if (isShiftChar) {
          targetElement.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Shift", code: "ShiftLeft", keyCode: 16, which: 16,
            shiftKey: true, bubbles: true, cancelable: true
          }));
        }
        targetElement.dispatchEvent(new KeyboardEvent("keydown", {
          key: char, code, keyCode: charCode, which: charCode,
          shiftKey: isShiftChar, bubbles: true, cancelable: true
        }));
        targetElement.dispatchEvent(new KeyboardEvent("keyup", {
          key: char, code, keyCode: charCode, which: charCode,
          shiftKey: isShiftChar, bubbles: true, cancelable: true
        }));
        if (isShiftChar) {
          targetElement.dispatchEvent(new KeyboardEvent("keyup", {
            key: "Shift", code: "ShiftLeft", keyCode: 16, which: 16,
            bubbles: true, cancelable: true
          }));
        }
      } else if (isGoogleDocs) {
        const isShiftChar = '!@#$%^&*()_+{}|:"<>?~'.includes(char);
        const code = getKeyCode(char);
        const charCode = char.charCodeAt(0);
        
        if (isShiftChar) {
          const shiftCharMap = {
            "!": {code: "Digit1", keyCode: 49}, "@": {code: "Digit2", keyCode: 50},
            "#": {code: "Digit3", keyCode: 51}, "$": {code: "Digit4", keyCode: 52},
            "%": {code: "Digit5", keyCode: 53}, "^": {code: "Digit6", keyCode: 54},
            "&": {code: "Digit7", keyCode: 55}, "*": {code: "Digit8", keyCode: 56},
            "(": {code: "Digit9", keyCode: 57}, ")": {code: "Digit0", keyCode: 48},
            "_": {code: "Minus", keyCode: 189}, "+": {code: "Equal", keyCode: 187},
            "{": {code: "BracketLeft", keyCode: 219}, "}": {code: "BracketRight", keyCode: 221},
            "|": {code: "Backslash", keyCode: 220}, ":": {code: "Semicolon", keyCode: 186},
            '"': {code: "Quote", keyCode: 222}, "<": {code: "Comma", keyCode: 188},
            ">": {code: "Period", keyCode: 190}, "?": {code: "Slash", keyCode: 191},
            "~": {code: "Backquote", keyCode: 192}
          };
          const keyInfo = shiftCharMap[char] || {code: code, keyCode: charCode};
          
          // Shift down
          targetElement.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Shift", code: "ShiftLeft", keyCode: 16, which: 16,
            shiftKey: true, bubbles: true, cancelable: true
          }));
          
          // Key down
          targetElement.dispatchEvent(new KeyboardEvent("keydown", {
            key: char, code: keyInfo.code, keyCode: keyInfo.keyCode, which: keyInfo.keyCode,
            shiftKey: true, bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 5));
          
          // Key press
          targetElement.dispatchEvent(new KeyboardEvent("keypress", {
            key: char, code: keyInfo.code, keyCode: charCode, which: charCode,
            shiftKey: true, bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 5));
          
          // Key up
          targetElement.dispatchEvent(new KeyboardEvent("keyup", {
            key: char, code: keyInfo.code, keyCode: keyInfo.keyCode, which: keyInfo.keyCode,
            shiftKey: true, bubbles: true, cancelable: true
          }));
          
          // Shift up
          targetElement.dispatchEvent(new KeyboardEvent("keyup", {
            key: "Shift", code: "ShiftLeft", keyCode: 16, which: 16,
            shiftKey: false, bubbles: true, cancelable: true
          }));
        } else {
          // Regular character
          targetElement.dispatchEvent(new KeyboardEvent("keydown", {
            key: char, code: code, keyCode: charCode, which: charCode,
            bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 5));
          targetElement.dispatchEvent(new KeyboardEvent("keypress", {
            key: char, code: code, keyCode: charCode, which: charCode,
            bubbles: true, cancelable: true
          }));
          await new Promise(r => setTimeout(r, 5));
          targetElement.dispatchEvent(new KeyboardEvent("keyup", {
            key: char, code: code, keyCode: charCode, which: charCode,
            bubbles: true, cancelable: true
          }));
        }
      } else if (targetElement.isContentEditable) {
        targetDocument.execCommand("insertText", false, char);
      } else if (["TEXTAREA", "INPUT"].includes(targetElement.tagName)) {
        insertIntoInput(targetElement, char);
      }
      return 0;
    };

    // Type with error (from original)
    const typeWithError = async (char) => {
      const wrongChar = /[a-zA-Z]/.test(char) ? getNeighborKey(char) : getRandomChar();
      await typeChar(wrongChar);
      await new Promise(r => setTimeout(r, 100 + Math.random() * 150));
      await typeChar("\b");
      await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
      await typeChar(char);
      return 200 + Math.random() * 300;
    };

    // Main typing loop
    currentText = text;
    currentPosition = startPosition;
    isTyping = true;

    console.log(`Starting to type ${text.length} characters at ${speed} WPM`);

    void (async () => {
    while (currentPosition < text.length && isTyping) {
      // Wait if paused
      if (isPaused) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      const char = text[currentPosition];
      
      // Skip carriage return
      if (char === "\r") {
        currentPosition++;
        continue;
      }

      // Update progress (silently fail if sidepanel is closed)
      const progress = (currentPosition / text.length) * 100;
      if (currentPosition % 10 === 0) { // Log every 10 characters
        console.log(`Progress: ${currentPosition}/${text.length} = ${progress.toFixed(1)}%`);
      }
      try {
        chrome.runtime.sendMessage({ action: "updateProgress", progress }, () => {
          if (chrome.runtime.lastError) {
            // Sidepanel is closed, ignore the error silently
          }
        });
      } catch (e) {
        // Ignore any errors
      }

      // Calculate delay
      let delay, extraDelay = 0;
      let shouldError = false;
      
      if (humanMode) {
        // Human mode: natural delays and errors
        delay = calculateDelay(speed);
        if (Math.random() < 0.3) {
          delay *= (0.7 + Math.random() * 0.6);
        }
        
        // Random error chance for each character (varies between provided errorRate ± 50%)
        const randomizedErrorRate = errorRate * (0.5 + Math.random());
        shouldError = !canvasMode && Math.random() < randomizedErrorRate && char !== " " && char !== "\n" && char !== "\r";
        extraDelay = shouldError ? await typeWithError(char) : await typeChar(char);
      } else {
        // Fast mode: speed-dependent delay, no errors or randomness
        const baseDelay = calculateDelay(speed);
        delay = Math.max(5, baseDelay / 8); // Much faster but still adjustable
        await typeCharFast(char);
      }

      // CodeMirror polls its hidden textarea, so allow each input event to be consumed.
      if (isPolledCodeEditor) delay = Math.max(delay, 120);
      if (isMonacoEditor) delay = Math.max(delay, 80);

      currentPosition++;

      // Wait before next character
      if (isTyping && currentPosition < text.length) {
        await new Promise(resolve => {
          typingTimeout = setTimeout(resolve, delay + extraDelay);
        });
      }
    }

    // Typing complete
    if (currentPosition >= text.length && isTyping) {
      console.log("Typing complete!");
      isTyping = false;
      isPaused = false;
      try {
        chrome.runtime.sendMessage({ action: "typingComplete", charsTyped: text.length }, () => {
          if (chrome.runtime.lastError) {
            console.log("Typing completed successfully (sidepanel closed)");
          }
        });
      } catch (e) {
        console.log("Typing completed successfully");
      }
    }
    })();
  }

  function pauseTyping() {
    isPaused = !isPaused;
    console.log(isPaused ? "Typing paused" : "Typing resumed");
  }

  function stopTyping() {
    console.log("Stopping typing...");
    isTyping = false;
    isPaused = false;
    currentPosition = 0;
    currentText = "";
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
  }

  // Message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content script received:", message.action);
    
    if (message.action === "startTyping") {
      stopTyping();

      try {
        startTyping(
          message.text,
          message.speed,
          message.errorRate,
          message.position || 0,
          message.humanMode !== false,
          message.canvasMode === true
        );
        sendResponse({ status: "started" });
      } catch (err) {
        console.error("Typing error:", err);
        sendResponse({ status: "error", error: err.message });
      }
      return false;
    }
    else if (message.action === "pauseTyping") {
      pauseTyping();
      sendResponse({ status: isPaused ? "paused" : "resumed" });
      return false;
    }
    else if (message.action === "stopTyping") {
      stopTyping();
      sendResponse({ status: "stopped" });
      return false;
    }
    return false;
  });

  console.log("GhostType - GTekSD: Content script loaded (SidePanel mode)");
})();
