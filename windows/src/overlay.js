(function () {
  const canvas = document.getElementById("rings");
  const context = canvas.getContext("2d");
  let snapshot = {
    usage: { primary: null, secondary: null, source: "none" },
    visible: false
  };
  let phase = 0;

  function resize() {
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(window.innerWidth * scale));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * scale));
    context.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function colorFor(bucket, fallback) {
    const remaining = bucket ? bucket.remainingPercent : null;
    if (remaining !== null && remaining <= 12) {
      return "rgba(255, 72, 92, 0.96)";
    }
    if (remaining !== null && remaining <= 28) {
      return "rgba(255, 176, 65, 0.96)";
    }
    return fallback;
  }

  function drawRing(centerX, centerY, radius, width, bucket, color, emptyColor) {
    context.lineCap = "round";
    context.lineWidth = width;
    context.strokeStyle = emptyColor;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();

    if (!bucket) {
      context.setLineDash([3, 10]);
      context.strokeStyle = "rgba(255, 255, 255, 0.30)";
      context.beginPath();
      context.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI * 1.5);
      context.stroke();
      context.setLineDash([]);
      return;
    }

    const sweep = (Math.PI * 2 * bucket.remainingPercent) / 100;
    context.strokeStyle = color;
    context.beginPath();
    context.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + sweep);
    context.stroke();
  }

  function drawText(width, height, usage) {
    const source = usage.source === "live" ? "Live" : usage.source === "log" ? "Cached" : "Waiting";
    const primary = usage.primary ? `${Math.round(usage.primary.remainingPercent)}%` : "--";
    const secondary = usage.secondary ? `${Math.round(usage.secondary.remainingPercent)}%` : "--";
    context.font = "600 11px system-ui, Segoe UI, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(8, 12, 20, 0.62)";
    roundRect(width / 2 - 48, height - 35, 96, 24, 7);
    context.fill();
    context.fillStyle = "rgba(255, 255, 255, 0.92)";
    context.fillText(`${source} ${primary}/${secondary}`, width / 2, height - 23);
  }

  function roundRect(x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  function draw() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    context.clearRect(0, 0, width, height);
    if (!snapshot.visible) {
      requestAnimationFrame(draw);
      return;
    }

    phase += 0.012;
    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = Math.min(width, height) / 2 - 14;
    const innerRadius = outerRadius - 14;
    const breathe = 0.18 + Math.sin(phase) * 0.06;

    const gradient = context.createRadialGradient(centerX, centerY, innerRadius - 10, centerX, centerY, outerRadius + 10);
    gradient.addColorStop(0, "rgba(112, 244, 216, 0)");
    gradient.addColorStop(1, `rgba(112, 244, 216, ${breathe})`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centerX, centerY, outerRadius + 9, 0, Math.PI * 2);
    context.fill();

    const usage = snapshot.usage || {};
    drawRing(centerX, centerY, outerRadius, 8, usage.primary, colorFor(usage.primary, "rgba(76, 235, 194, 0.96)"), "rgba(76, 235, 194, 0.16)");
    drawRing(centerX, centerY, innerRadius, 6, usage.secondary, colorFor(usage.secondary, "rgba(96, 178, 255, 0.92)"), "rgba(96, 178, 255, 0.15)");
    drawText(width, height, usage);

    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  window.limitRings.onSnapshot((nextSnapshot) => {
    snapshot = nextSnapshot;
  });
  resize();
  draw();
})();
