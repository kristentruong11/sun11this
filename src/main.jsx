// -- console filter (dev only) --
if (import.meta?.env?.DEV) {
  const blocked = [
    "Detected lesson info",
    "Found lesson in content",
    "Should show task bubbles"
  ];
  const origLog = console.log.bind(console);
  console.log = (...args) => {
    try {
      const txt = args.map(a => (typeof a === "string" ? a : "")).join(" ");
      if (blocked.some(k => txt.includes(k))) return;
    } catch {}
    origLog(...args);
  };
}
