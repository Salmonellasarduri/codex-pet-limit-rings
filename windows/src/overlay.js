(function () {
  const canvas = document.getElementById("rings");
  const context = canvas.getContext("2d");
  let snapshot = {
    usage: { primary: null, secondary: null, source: "none" },
    style: {
      outerColor: "#4cebc2",
      innerColor: "#60b2ff",
      outerOpacity: 1,
      innerOpacity: 1
    },
    visible: false
  };
  let phase = 0;

  function resize() {
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(window.innerWidth * scale));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * scale));
    context.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function hexToRgb(hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) {
      return { r: 76, g: 235, b: 194 };
    }
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function rgba(hex, opacity) {
    const color = hexToRgb(hex);
    const alpha = Math.min(Math.max(Number(opacity) || 0, 0), 1);
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha.toFixed(3)})`;
  }

  function colorFor(bucket, fallback, opacity) {
    const remaining = bucket ? bucket.remainingPercent : null;
    if (remaining !== null && remaining <= 12) {
      return `rgba(255, 72, 92, ${Math.min(Math.max(opacity, 0), 1).toFixed(3)})`;
    }
    if (remaining !== null && remaining <= 28) {
      return `rgba(255, 176, 65, ${Math.min(Math.max(opacity, 0), 1).toFixed(3)})`;
    }
    return fallback;
  }

  function drawRing(centerX, centerY, radius, width, bucket, color, emptyColor, missingColor) {
    context.lineCap = "round";
    context.lineWidth = width;
    context.strokeStyle = emptyColor;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();

    if (!bucket) {
      context.setLineDash([3, 10]);
      context.strokeStyle = missingColor;
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

    const usage = snapshot.usage || {};
    const style = snapshot.style || {};
    const outerColor = style.outerColor || "#4cebc2";
    const innerColor = style.innerColor || "#60b2ff";
    const outerOpacity = typeof style.outerOpacity === "number" ? style.outerOpacity : 1;
    const innerOpacity = typeof style.innerOpacity === "number" ? style.innerOpacity : 1;
    const halo = hexToRgb(outerColor);
    const gradient = context.createRadialGradient(centerX, centerY, innerRadius - 10, centerX, centerY, outerRadius + 10);
    gradient.addColorStop(0, `rgba(${halo.r}, ${halo.g}, ${halo.b}, 0)`);
    gradient.addColorStop(1, `rgba(${halo.r}, ${halo.g}, ${halo.b}, ${breathe * outerOpacity})`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centerX, centerY, outerRadius + 9, 0, Math.PI * 2);
    context.fill();

    drawRing(centerX, centerY, outerRadius, 8, usage.primary, colorFor(usage.primary, rgba(outerColor, 0.96 * outerOpacity), outerOpacity), rgba(outerColor, 0.16 * outerOpacity), rgba(outerColor, 0.3 * outerOpacity));
    drawRing(centerX, centerY, innerRadius, 6, usage.secondary, colorFor(usage.secondary, rgba(innerColor, 0.92 * innerOpacity), innerOpacity), rgba(innerColor, 0.15 * innerOpacity), rgba(innerColor, 0.3 * innerOpacity));
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
