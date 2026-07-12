import qrcode from "qrcode-generator";

// Light modules around the code are required so scanners can find the code's edges.
const QUIET_ZONE = 2;
const RESET = "\x1b[0m";

/**
 * Renders a QR code as terminal lines using half-block characters (▀), two modules per
 * character row. Colors are explicit ANSI black/white (not the terminal's default fg/bg) so the
 * code has correct polarity — and therefore actually scans — regardless of the user's terminal
 * theme.
 */
export function renderQrTerminal(text: string): string[] {
  const qr = qrcode(0, "L");
  qr.addData(text);
  qr.make();

  const n = qr.getModuleCount();
  const size = n + QUIET_ZONE * 2;
  const isDark = (row: number, col: number): boolean => {
    const r = row - QUIET_ZONE;
    const c = col - QUIET_ZONE;
    if (r < 0 || c < 0 || r >= n || c >= n) return false;
    return qr.isDark(r, c);
  };
  const ansiFor = (topDark: boolean, bottomDark: boolean): string => {
    const fg = topDark ? 30 : 97;
    const bg = bottomDark ? 40 : 107;
    return `\x1b[${fg};${bg}m`;
  };

  const lines: string[] = [];
  for (let y = 0; y < size; y += 2) {
    let line = "";
    let lastCode = "";
    for (let x = 0; x < size; x++) {
      const code = ansiFor(isDark(y, x), y + 1 < size && isDark(y + 1, x));
      if (code !== lastCode) {
        line += code;
        lastCode = code;
      }
      line += "▀";
    }
    lines.push(line + RESET);
  }
  return lines;
}
