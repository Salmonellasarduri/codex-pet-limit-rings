const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCodexState } = require("../src/codexState");

test("parseCodexState returns mascot frame in top-left coordinates", () => {
  const parsed = parseCodexState({
    "electron-avatar-overlay-open": true,
    "electron-persisted-atom-state": {
      "selected-avatar-id": "custom:inanna"
    },
    "electron-avatar-overlay-bounds": {
      x: 3445,
      y: 0,
      mascot: {
        left: 248,
        top: 62,
        width: 80,
        height: 87
      }
    }
  });

  assert.equal(parsed.open, true);
  assert.equal(parsed.avatarId, "custom:inanna");
  assert.deepEqual(parsed.petFrame, {
    x: 3693,
    y: 62,
    width: 80,
    height: 87
  });
});

test("parseCodexState hides frame when pet overlay is closed", () => {
  const parsed = parseCodexState({
    "electron-avatar-overlay-open": false,
    "electron-avatar-overlay-bounds": {
      x: 10,
      y: 20,
      mascot: {
        left: 1,
        top: 2,
        width: 3,
        height: 4
      }
    }
  });

  assert.equal(parsed.open, false);
  assert.equal(parsed.petFrame, null);
});
