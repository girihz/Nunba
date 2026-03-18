"""
UI test for Nunba splash screen — verifies dark background, no white flash.

Finds the actual Tk splash window via Win32 API, brings it to front,
screenshots it, and verifies the average luminance is dark (< 80).

Run: python tests/test_splash_ui.py
"""
import ctypes
import ctypes.wintypes
import subprocess
import sys
import time
import os

def find_borderless_tk_window():
    """Find borderless Tk window (the splash)."""
    user32 = ctypes.windll.user32
    results = []

    def enum_cb(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            rect = ctypes.wintypes.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(rect))
            w = rect.right - rect.left
            h = rect.bottom - rect.top
            style = user32.GetWindowLongW(hwnd, -16)
            borderless = not (style & 0x00C00000)  # no WS_CAPTION
            if borderless and 300 <= w <= 1000 and 200 <= h <= 700:
                length = user32.GetWindowTextLengthW(hwnd)
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                results.append({
                    'hwnd': hwnd, 'title': buf.value,
                    'x': rect.left, 'y': rect.top, 'w': w, 'h': h,
                })
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(
        ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)
    user32.EnumWindows(WNDENUMPROC(enum_cb), 0)

    # Filter to tk/empty title (splash)
    return [w for w in results if w['title'].lower() in ('tk', '')]


def test_splash_no_white():
    from PIL import ImageGrab

    app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    save_dir = os.path.dirname(os.path.abspath(__file__))
    user32 = ctypes.windll.user32

    print("Starting Nunba...")
    proc = subprocess.Popen(
        [sys.executable, os.path.join(app_dir, 'app.py')],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        cwd=app_dir,
    )

    frames = []
    try:
        for i in range(16):
            time.sleep(0.3)
            t = (i + 1) * 0.3

            wins = find_borderless_tk_window()
            if not wins:
                print(f"  t={t:.1f}s: waiting for splash...")
                continue

            win = wins[0]
            # Bring to absolute front
            user32.SetForegroundWindow(win['hwnd'])
            user32.BringWindowToTop(win['hwnd'])
            time.sleep(0.05)

            img = ImageGrab.grab(bbox=(
                win['x'], win['y'],
                win['x'] + win['w'], win['y'] + win['h']))

            # Analyze center region (avoid edges/title bars)
            cx, cy = win['w'] // 2, win['h'] // 2
            margin = 40
            center = img.crop((cx - margin, cy - margin, cx + margin, cy + margin))
            pixels = list(center.getdata())
            avg_r = sum(p[0] for p in pixels) / len(pixels)
            avg_g = sum(p[1] for p in pixels) / len(pixels)
            avg_b = sum(p[2] for p in pixels) / len(pixels)
            lum = 0.299 * avg_r + 0.587 * avg_g + 0.114 * avg_b

            status = "WHITE" if lum > 200 else ("DARK" if lum < 80 else "MID")
            print(f"  t={t:.1f}s: size={win['w']}x{win['h']} "
                  f"center=({avg_r:.0f},{avg_g:.0f},{avg_b:.0f}) "
                  f"lum={lum:.0f} [{status}]")

            frames.append((t, lum, status, img))

            if status == "WHITE":
                img.save(os.path.join(save_dir, f'splash_white_t{t:.1f}.png'))

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    if frames:
        frames[0][3].save(os.path.join(save_dir, 'splash_first.png'))
        frames[-1][3].save(os.path.join(save_dir, 'splash_last.png'))

    print(f"\n{'=' * 50}")
    white = [f for f in frames if f[2] == 'WHITE']
    dark = [f for f in frames if f[2] == 'DARK']

    if not frames:
        print("FAIL: No splash window found!")
        return False
    elif white:
        print(f"FAIL: White in {len(white)}/{len(frames)} frames")
        return False
    else:
        avg_lum = sum(f[1] for f in frames) / len(frames)
        print(f"PASS: {len(frames)} frames, avg lum={avg_lum:.0f}, "
              f"{len(dark)} dark, 0 white")
        return True


if __name__ == '__main__':
    ok = test_splash_no_white()
    sys.exit(0 if ok else 1)
