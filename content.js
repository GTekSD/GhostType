// GhostType - GTekSD content script for the side panel
(function() {
  if (window.GhostTypeInitialized || window.HumanAutoTyperInitialized) {
    //console.log('GhostType - GTekSD: Already initialized on this page');
    return;
  }
  window.GhostTypeInitialized = true;
  
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
  // Main typing function with ORIGINAL logic
  function startTyping(text, speed = 60, errorRate = 0.05, startPosition = 0, humanMode = true) {
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
    } else {
      targetElement = document.activeElement;
      if (!targetElement || (!["INPUT", "TEXTAREA"].includes(targetElement.tagName) && !targetElement.isContentEditable)) {
        const errorMsg = "No editable element focused. Please click on a text field first.";
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    }

    // Focus element
    try {
      targetElement.focus();
    } catch (e) {
      console.error("Could not focus element:", e);
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
      if (isGoogleDocs) {
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
        document.execCommand("insertHTML", false, "<br>");
      } else if (targetElement.tagName === "TEXTAREA") {
        const pos = targetElement.selectionStart;
        const val = targetElement.value;
        targetElement.value = val.substring(0, pos) + "\n" + val.substring(targetElement.selectionEnd);
        targetElement.selectionStart = targetElement.selectionEnd = pos + 1;
        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (targetElement.tagName === "INPUT") {
        targetElement.value += "\n";
        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return 100 + Math.random() * 150;
    };

    // Type character (from original logic)
    const typeChar = async (char) => {
      if (char === "\n") {
        return await typeEnter();
      }

      if (char === "\b") {
        if (isGoogleDocs) {
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
          document.execCommand("delete", false);
        } else if (["TEXTAREA", "INPUT"].includes(targetElement.tagName)) {
          const pos = targetElement.selectionStart;
          if (pos > 0) {
            const val = targetElement.value;
            targetElement.value = val.substring(0, pos - 1) + val.substring(targetElement.selectionEnd);
            targetElement.selectionStart = targetElement.selectionEnd = pos - 1;
            targetElement.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        return 50;
      }

      // Regular character - ORIGINAL LOGIC for Google Docs
      if (isGoogleDocs) {
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
        document.execCommand("insertText", false, char);
      } else if (["TEXTAREA", "INPUT"].includes(targetElement.tagName)) {
        const pos = targetElement.selectionStart;
        const val = targetElement.value;
        targetElement.value = val.substring(0, pos) + char + val.substring(targetElement.selectionEnd);
        targetElement.selectionStart = targetElement.selectionEnd = pos + 1;
        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
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
        if (isGoogleDocs) {
          targetElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
          await new Promise(r => setTimeout(r, 5));
          targetElement.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
          await new Promise(r => setTimeout(r, 5));
          targetElement.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        } else if (targetElement.isContentEditable) {
          document.execCommand("insertHTML", false, "<br>");
        } else if (targetElement.tagName === "TEXTAREA") {
          const pos = targetElement.selectionStart;
          const val = targetElement.value;
          targetElement.value = val.substring(0, pos) + "\n" + val.substring(targetElement.selectionEnd);
          targetElement.selectionStart = targetElement.selectionEnd = pos + 1;
          targetElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return 0;
      }

      // Regular character - simplified, minimal delays
      if (isGoogleDocs) {
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
        document.execCommand("insertText", false, char);
      } else if (["TEXTAREA", "INPUT"].includes(targetElement.tagName)) {
        const pos = targetElement.selectionStart;
        const val = targetElement.value;
        targetElement.value = val.substring(0, pos) + char + val.substring(targetElement.selectionEnd);
        targetElement.selectionStart = targetElement.selectionEnd = pos + 1;
        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
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
        shouldError = Math.random() < randomizedErrorRate && char !== " " && char !== "\n" && char !== "\r";
        extraDelay = shouldError ? await typeWithError(char) : await typeChar(char);
      } else {
        // Fast mode: speed-dependent delay, no errors or randomness
        const baseDelay = calculateDelay(speed);
        delay = Math.max(5, baseDelay / 8); // Much faster but still adjustable
        await typeCharFast(char);
      }

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
          message.humanMode !== false
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
