(function () {
  const canvas = document.getElementById("rings");
  const context = canvas.getContext("2d");
  const USAGE_PANEL_WIDTH = 164;
  const BELOW_RING_TEXT_HEIGHT = 48;
  const CLAUDE_SESSION_STALE_MS = 10 * 60 * 1000;
  let snapshot = {
    usage: { primary: null, secondary: null, source: "none" },
    claude: null,
    style: {
      outerColor: "#4cebc2",
      innerColor: "#d97757",
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
    const ringSize = Math.max(1, Math.min(width - USAGE_PANEL_WIDTH, height - BELOW_RING_TEXT_HEIGHT));
    const ringLeft = width - ringSize;
    return {
      size: ringSize,
      centerX: ringLeft + ringSize / 2,
      centerY: ringSize / 2
    };
  }

  function roleStyle(role, style) {
    if (role === "inner") {
      return { color: style.innerColor, opacity: style.innerOpacity };
    }
    return { color: style.outerColor, opacity: style.outerOpacity };
  }

  function drawBar(x, y, barWidth, barHeight, remainingPercent, colorHex, opacity) {
    context.fillStyle = rgba(colorHex, 0.12 * opacity);
    roundRect(x, y, barWidth, barHeight, 3);
    context.fill();

    if (remainingPercent === null || remainingPercent === undefined) {
      context.setLineDash([2, 5]);
      context.strokeStyle = rgba(colorHex, 0.35 * opacity);
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x + 2, y + barHeight / 2);
      context.lineTo(x + barWidth - 2, y + barHeight / 2);
      context.stroke();
      context.setLineDash([]);
      return;
    }

    const fillWidth = Math.max(0, (barWidth * Math.min(Math.max(remainingPercent, 0), 100)) / 100);
    const color = colorFor({ remainingPercent }, rgba(colorHex, 0.92 * opacity), opacity);
    if (fillWidth >= 1) {
      context.shadowBlur = 6;
      context.shadowColor = color;
      context.fillStyle = color;
      roundRect(x, y, Math.max(fillWidth, barHeight), barHeight, 3);
      context.fill();
      context.shadowBlur = 0;
    }
  }

  function drawWeeklyTextBelowRing(ring, rows, style) {
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.font = "700 9.5px ui-monospace, Cascadia Code, Consolas, monospace";
    context.shadowBlur = 4;
    context.shadowColor = "rgba(0, 0, 0, 0.65)";
    context.fillStyle = "rgba(255, 255, 255, 0.62)";
    context.fillText("Weekly", ring.centerX, ring.size + 6);
    context.shadowBlur = 0;
    context.textAlign = "left";

    rows.forEach((row, index) => {
      const y = ring.size + 20 + index * 15;
      const accent = roleStyle(row.role, style);
      const valueText = row.reset ? `${row.percent}  ${row.reset}` : row.percent;

      context.textBaseline = "middle";
      context.textAlign = "left";
      const labelFont = "700 9.5px ui-monospace, Cascadia Code, Consolas, monospace";
      const valueFont = "800 10px ui-monospace, Cascadia Code, Consolas, monospace";
      context.font = labelFont;
      const labelWidth = context.measureText(row.label).width;
      context.font = valueFont;
      const valueWidth = context.measureText(valueText).width;

      let x = ring.centerX - (labelWidth + 6 + valueWidth) / 2;
      context.shadowBlur = 4;
      context.shadowColor = "rgba(0, 0, 0, 0.65)";
      context.font = labelFont;
      context.fillStyle = rgba(accent.color, 0.98 * accent.opacity);
      context.fillText(row.label, x, y);
      x += labelWidth + 6;
      context.font = valueFont;
      context.fillStyle = "rgba(255, 255, 255, 0.95)";
      context.fillText(valueText, x, y);
      context.shadowBlur = 0;
    });
  }

  function claudeSessionFooter(claude) {
    const session = claude.session;
    const fresh = session && typeof session.ageMs === "number" && session.ageMs < CLAUDE_SESSION_STALE_MS;
    if (fresh) {
      return window.LimitRingDisplay.claudeSessionLine(claude);
    }
    const source = (claude.limits || {}).source;
    if (source === "statusline" && session) {
      const age = window.LimitRingDisplay.formatAge(session.ageMs);
      return age ? `Claude data ${age}` : "";
    }
    return "";
  }

  function drawFiveHourPanel(usage, claude, style) {
    const allRows = window.LimitRingDisplay.fiveHourBarRows(usage, claude);
    const rows = claude ? allRows : allRows.filter((row) => row.role === "outer");
    const footer = claude ? claudeSessionFooter(claude) : "";
    const panelWidth = Math.min(USAGE_PANEL_WIDTH - 12, 152);
    const panelHeight = 24 + rows.length * 19 + (footer ? 14 : 0);
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

    context.font = "700 9.5px ui-monospace, Cascadia Code, Consolas, monospace";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(255, 255, 255, 0.62)";
    context.fillText("5h", panelX + 9, panelY + 13);

    const labelX = panelX + 9;
    const barX = panelX + 46;
    const barWidth = 36;
    const percentX = barX + barWidth + 6;
    const resetX = panelX + panelWidth - 9;
    rows.forEach((row, index) => {
      const y = panelY + 30 + index * 19;
      const accent = roleStyle(row.role, style);

      context.font = "700 9.5px ui-monospace, Cascadia Code, Consolas, monospace";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillStyle = rgba(accent.color, 0.92 * accent.opacity);
      context.fillText(row.label, labelX, y);

      drawBar(barX, y - 3.5, barWidth, 7, row.remainingPercent, accent.color, accent.opacity);

      context.font = "800 10px ui-monospace, Cascadia Code, Consolas, monospace";
      context.textAlign = "left";
      context.fillStyle = "rgba(255, 255, 255, 0.95)";
      context.fillText(row.percent, percentX, y);

      context.font = "700 10px ui-monospace, Cascadia Code, Consolas, monospace";
      context.textAlign = "right";
      context.fillStyle = "rgba(255, 255, 255, 0.90)";
      context.fillText(row.reset || "", resetX, y);
    });

    if (footer) {
      context.font = "700 8.5px ui-monospace, Cascadia Code, Consolas, monospace";
      context.textAlign = "left";
      context.fillStyle = "rgba(255, 255, 255, 0.58)";
      context.fillText(footer, panelX + 9, panelY + 66, panelWidth - 18);
    }
  }

  function drawSourceBadge(usage, centerX) {
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
    const claude = snapshot.claude || null;
    const claudeLimits = (claude && claude.limits) || {};
    const style = snapshot.style || {};
    const outerColor = style.outerColor || "#4cebc2";
    const innerColor = style.innerColor || "#d97757";
    const outerOpacity = typeof style.outerOpacity === "number" ? style.outerOpacity : 1;
    const innerOpacity = typeof style.innerOpacity === "number" ? style.innerOpacity : 1;
    const resolvedStyle = { outerColor, innerColor, outerOpacity, innerOpacity };
    const halo = hexToRgb(outerColor);
    const gradient = context.createRadialGradient(centerX, centerY, innerRadius - 10, centerX, centerY, outerRadius + 10);
    gradient.addColorStop(0, `rgba(${halo.r}, ${halo.g}, ${halo.b}, 0)`);
    gradient.addColorStop(1, `rgba(${halo.r}, ${halo.g}, ${halo.b}, ${breathe * outerOpacity})`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centerX, centerY, outerRadius + 9, 0, Math.PI * 2);
    context.fill();

    drawRing(centerX, centerY, outerRadius, 7, usage.secondary, colorFor(usage.secondary, rgba(outerColor, 0.80 * outerOpacity), outerOpacity), rgba(outerColor, 0.08 * outerOpacity), rgba(outerColor, 0.18 * outerOpacity), rgba(outerColor, 0.95 * outerOpacity));
    if (claude) {
      drawRing(centerX, centerY, innerRadius, 6, claudeLimits.secondary || null, colorFor(claudeLimits.secondary, rgba(innerColor, 0.78 * innerOpacity), innerOpacity), rgba(innerColor, 0.075 * innerOpacity), rgba(innerColor, 0.17 * innerOpacity), rgba(innerColor, 0.92 * innerOpacity));
    }
    const weeklyRows = window.LimitRingDisplay.weeklyRingRows(usage, claude);
    drawWeeklyTextBelowRing(ring, claude ? weeklyRows : weeklyRows.filter((row) => row.role === "outer"), resolvedStyle);
    drawFiveHourPanel(usage, claude, resolvedStyle);
    drawSourceBadge(usage, centerX);

    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  window.limitRings.onSnapshot((nextSnapshot) => {
    snapshot = nextSnapshot;
  });
  resize();
  draw();
})();
