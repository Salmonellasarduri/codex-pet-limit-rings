(function () {
  const canvas = document.getElementById("rings");
  const context = canvas.getContext("2d");
  const USAGE_PANEL_WIDTH = 164;
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

  function drawRing(centerX, centerY, radius, width, bucket, color, emptyColor, missingColor, edgeColor) {
    const fullCircle = Math.PI * 2;
    const sweep = bucket ? (fullCircle * bucket.remainingPercent) / 100 : 0;
    const startAngle = -Math.PI / 2;
    const remainingStartAngle = startAngle + fullCircle - sweep;
    const remainingEndAngle = startAngle + fullCircle;

    context.lineCap = "round";
    context.shadowBlur = 0;
    context.lineWidth = width + 9;
    context.strokeStyle = emptyColor;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();

    context.shadowBlur = 0;
    context.lineWidth = width + 4;
    context.strokeStyle = emptyColor;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();

    if (!bucket) {
      context.setLineDash([3, 10]);
      context.strokeStyle = missingColor;
      context.beginPath();
      context.arc(centerX, centerY, radius, startAngle, Math.PI * 1.5);
      context.stroke();
      context.setLineDash([]);
      return;
    }

    context.shadowBlur = 10;
    context.shadowColor = color;
    context.lineWidth = width;
    context.strokeStyle = color;
    context.beginPath();
    context.arc(centerX, centerY, radius, remainingStartAngle, remainingEndAngle);
    context.stroke();

    context.shadowBlur = 0;
    context.lineWidth = Math.max(1.5, width * 0.28);
    context.strokeStyle = edgeColor;
    context.beginPath();
    context.arc(centerX, centerY, radius - width * 0.42, remainingStartAngle, remainingEndAngle);
    context.stroke();

    const marker = pointOnCircle(centerX, centerY, radius, remainingStartAngle);
    context.fillStyle = edgeColor;
    context.beginPath();
    context.arc(marker.x, marker.y, Math.max(2.4, width * 0.45), 0, Math.PI * 2);
    context.fill();
  }

  function pointOnCircle(centerX, centerY, radius, angle) {
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  }

  function ringGeometry(width, height) {
    const ringSize = Math.max(1, Math.min(width - USAGE_PANEL_WIDTH, height));
    const ringLeft = width - ringSize;
    return {
      size: ringSize,
      centerX: ringLeft + ringSize / 2,
      centerY: height / 2
    };
  }

  function drawText(width, height, usage, style) {
    const rows = window.LimitRingDisplay.limitRows(usage);
    const panelWidth = Math.min(USAGE_PANEL_WIDTH - 12, 152);
    const panelHeight = 52;
    const panelX = 36;
    const panelY = 8;

    context.shadowBlur = 14;
    context.shadowColor = "rgba(0, 0, 0, 0.50)";
    context.fillStyle = "rgba(24, 24, 26, 0.88)";
    roundRect(panelX, panelY, panelWidth, panelHeight, 7);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = "rgba(255, 255, 255, 0.10)";
    context.lineWidth = 1;
    context.stroke();

    const labelX = panelX + 18;
    const percentX = panelX + panelWidth - 96;
    const resetX = panelX + panelWidth - 10;
    rows.forEach((row, index) => {
      const y = panelY + 18 + index * 22;
      const color = row.role === "outer" ? style.outerColor : style.innerColor;
      const opacity = row.role === "outer" ? style.outerOpacity : style.innerOpacity;

      context.fillStyle = rgba(color, 0.95 * opacity);
      roundRect(panelX + 9, y - 8, 3, 16, 2);
      context.fill();

      context.font = "700 9.5px ui-monospace, Cascadia Code, Consolas, monospace";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillStyle = rgba(color, 0.98 * opacity);
      context.fillText(row.label, labelX, y);

      context.font = "800 10px ui-monospace, Cascadia Code, Consolas, monospace";
      context.fillStyle = "rgba(255, 255, 255, 0.95)";
      context.fillText(row.percent, percentX, y);

      context.font = "700 10px ui-monospace, Cascadia Code, Consolas, monospace";
      context.textAlign = "right";
      context.fillStyle = "rgba(255, 255, 255, 0.90)";
      context.fillText(row.reset || "", resetX, y);
    });
  }

  function drawSourceBadge(width, height, usage, centerX) {
    const source = usage.source === "live" ? "Live" : usage.source === "log" ? "Cached" : "";
    if (!source) {
      return;
    }
    context.font = "700 9px ui-monospace, Cascadia Code, Consolas, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const badgeWidth = 42;
    const x = centerX - badgeWidth / 2;
    const y = 7;
    context.fillStyle = "rgba(24, 24, 26, 0.56)";
    roundRect(x, y, badgeWidth, 17, 6);
    context.fill();
    context.fillStyle = "rgba(255, 255, 255, 0.70)";
    context.fillText(source, centerX, y + 8.5);
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
    const ring = ringGeometry(width, height);
    const centerX = ring.centerX;
    const centerY = ring.centerY;
    const outerRadius = ring.size / 2 - 24;
    const innerRadius = outerRadius - 15;
    const breathe = 0.22 + Math.sin(phase) * 0.05;

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

    drawRing(centerX, centerY, outerRadius, 7, usage.primary, colorFor(usage.primary, rgba(outerColor, 0.80 * outerOpacity), outerOpacity), rgba(outerColor, 0.08 * outerOpacity), rgba(outerColor, 0.18 * outerOpacity), rgba(outerColor, 0.95 * outerOpacity));
    drawRing(centerX, centerY, innerRadius, 6, usage.secondary, colorFor(usage.secondary, rgba(innerColor, 0.78 * innerOpacity), innerOpacity), rgba(innerColor, 0.075 * innerOpacity), rgba(innerColor, 0.17 * innerOpacity), rgba(innerColor, 0.92 * innerOpacity));
    drawText(width, height, usage, { outerColor, innerColor, outerOpacity, innerOpacity });
    drawSourceBadge(width, height, usage, centerX);

    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  window.limitRings.onSnapshot((nextSnapshot) => {
    snapshot = nextSnapshot;
  });
  resize();
  draw();
})();
